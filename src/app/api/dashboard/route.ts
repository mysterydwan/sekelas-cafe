// Dashboard API: role-aware KPIs, alerts, live feed, hourly chart data,
// top products, queue metrics, expected cash (report.viewAll only).
import { ok, withAuth } from '@/lib/api'
import { db } from '@/lib/db'
import { currentBusinessDate } from '@/lib/business-day'
import { getCashStatus } from '@/lib/payments'
import { unclosedPastDates, ensureClosedDates } from '@/lib/reports'
import { hasGrant } from '@/lib/grants'
import { formatDate, formatIDR, formatNumber } from '@/lib/format'
import type { CashStatusDTO, DashboardDTO } from '@/lib/types'

const TZ = 'Asia/Jakarta'
const hourFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ })

function describeAction(action: string, label: string | null): string {
  const l = label ?? ''
  switch (action) {
    case 'auth.login':
      return 'masuk'
    case 'auth.logout':
      return 'keluar'
    case 'order.create':
      return `membuat pesanan ${l}`
    case 'order.status:PREPARING':
      return `memasak ${l}`
    case 'order.status:READY':
      return `menandai ${l} siap`
    case 'order.status:OUT_FOR_DELIVERY':
      return `mengantar ${l}`
    case 'order.status:COMPLETED':
      return `menyerahkan ${l}`
    case 'order.status:CANCELLED':
      return `membatalkan ${l}`
    case 'order.voidItem':
      return `membatalkan item ${l}`
    case 'order.hold':
      return `menahan pesanan ${l}`
    case 'order.courier':
      return `menugaskan kurir untuk ${l}`
    case 'payment.take':
      return `menerima pembayaran ${l}`
    case 'payment.verifyQris':
      return `memverifikasi QRIS ${l}`
    case 'payment.rejectQris':
      return `menolak QRIS ${l}`
    case 'cash.opening_float':
      return 'mengatur modal awal laci'
    case 'cash.cash_in':
      return 'memasukkan uang ke laci'
    case 'cash.cash_out':
      return 'mengeluarkan uang dari laci'
    case 'print.reprint':
      return `mencetak ulang struk ${l}`
    default:
      return `${action}${l ? ` ${l}` : ''}`
  }
}

export const GET = withAuth(async (req, { session }) => {
  const today = currentBusinessDate()
  const startOfDay = new Date(today + 'T00:00:00+07:00')
  const isBarista = session.role === 'BARISTA'

  // SPEC §1.8: past unclosed dates auto-close from ledger on next access,
  // flagged isAutoClosed — surfaced below as informational alerts.
  const autoClosed = await ensureClosedDates()

  const [orders, stockItems, unclosed, logs, cash, shortfallLogs] = await Promise.all([
    db.order.findMany({
      where: { businessDate: today, isTraining: false, status: { not: 'CANCELLED' } },
      include: { items: true, payments: true },
    }),
    db.stockItem.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    unclosedPastDates(),
    db.auditLog.findMany({
      where: { createdAt: { gte: startOfDay } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
    hasGrant(session, 'report.viewAll') ? getCashStatus() : Promise.resolve(null),
    // per-ingredient deduction shortfall warnings, last 24h (SPEC §3.11)
    db.auditLog.findMany({
      where: { action: 'stock.shortfall', createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ])
  const cashStatus = cash as CashStatusDTO | null

  // ---- sales aggregation ----
  let revenue = 0
  let itemCount = 0
  let cashTotal = 0
  let qrisTotal = 0
  let queueDepth = 0
  let readyCount = 0
  const hourlyMap = new Map<string, { revenue: number; orders: number }>()
  const productTotals = new Map<string, { qty: number; revenue: number }>()
  const pendingQrisOrders: string[] = []
  let unpaidCount = 0

  for (const o of orders) {
    revenue += o.total
    if (o.status === 'PENDING_PAYMENT') unpaidCount += 1
    if (o.status === 'PAID' || o.status === 'PREPARING') queueDepth += 1
    if (o.status === 'READY') readyCount += 1
    if (o.payments.some((p) => p.status === 'PENDING_VERIFICATION')) pendingQrisOrders.push(o.code)

    const h = hourFmt.format(o.createdAt)
    const bucket = hourlyMap.get(h) ?? { revenue: 0, orders: 0 }
    bucket.revenue += o.total
    bucket.orders += 1
    hourlyMap.set(h, bucket)

    for (const p of o.payments) {
      if (p.status !== 'CONFIRMED') continue
      if (p.method === 'CASH') cashTotal += p.amount
      else if (p.method === 'QRIS') qrisTotal += p.amount
    }
    for (const item of o.items) {
      if (item.isVoided) continue
      itemCount += item.qty
      const cur = productTotals.get(item.nameSnapshot) ?? { qty: 0, revenue: 0 }
      cur.qty += item.qty
      cur.revenue += item.lineTotal
      productTotals.set(item.nameSnapshot, cur)
    }
  }

  const orderCount = orders.length
  const aov = orderCount > 0 ? Math.round(revenue / orderCount) : 0

  const hourly = [...hourlyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, v]) => ({ hour, ...v }))

  const topProducts = [...productTotals.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)

  // ---- rolling 30-min avg prep time (READY - PAID) ----
  const cutoff = Date.now() - 30 * 60 * 1000
  const prepDurations: number[] = []
  for (const o of orders) {
    if (o.readyAt && o.paidAt && o.readyAt.getTime() >= cutoff) {
      prepDurations.push((o.readyAt.getTime() - o.paidAt.getTime()) / 60000)
    }
  }
  const avgPrepMinutes =
    prepDurations.length > 0 ? Math.round(prepDurations.reduce((s, d) => s + d, 0) / prepDurations.length) : null

  // ---- low stock ----
  const lowStock = stockItems.filter((i) => i.qty <= i.lowThreshold)

  // ---- KPIs (role-aware) ----
  const kpis: DashboardDTO['kpis'] = isBarista
    ? [
        { label: 'Antrean Dapur', value: String(queueDepth), hint: 'menunggu + dimasak', href: '/kitchen' },
        {
          label: 'Rata-rata Masak',
          value: avgPrepMinutes != null ? `${avgPrepMinutes} mnt` : '—',
          hint: 'rerata 30 menit terakhir',
          href: '/kitchen',
        },
        { label: 'Menunggu Diambil', value: String(readyCount), hint: 'siap diserahkan ke pelanggan', href: '/kitchen' },
        { label: 'Stok Rendah', value: String(lowStock.length), hint: 'bahan di bawah ambang', href: '/stock' },
      ]
    : [
        { label: 'Pendapatan Hari Ini', value: formatIDR(revenue), hint: `${orderCount} pesanan · ${itemCount} item`, href: '/reports' },
        {
          label: 'Pesanan',
          value: String(orderCount),
          hint: unpaidCount > 0 ? `${unpaidCount} belum dibayar` : 'semua pesanan tertangani',
          href: '/orders',
        },
        { label: 'Rata-rata / Pesanan', value: formatIDR(aov), href: '/reports' },
        {
          label: 'Tunai vs QRIS',
          value: `${formatIDR(cashTotal)} · ${formatIDR(qrisTotal)}`,
          hint:
            cashStatus?.expectedCash != null
              ? `Kas diharapkan di laci ${formatIDR(cashStatus.expectedCash)}`
              : 'tunai · QRIS',
          href: '/reports',
        },
      ]

  // ---- alerts (problem + one-tap fix) ----
  const alerts: DashboardDTO['alerts'] = []
  for (const item of lowStock.slice(0, 6)) {
    alerts.push({
      id: `low-stock-${item.id}`,
      kind: 'LOW_STOCK',
      label: item.name,
      detail: `Sisa ${formatNumber(item.qty)} ${item.unit} — ambang ${formatNumber(item.lowThreshold)}`,
      href: '/stock',
    })
  }
  if (pendingQrisOrders.length > 0) {
    alerts.push({
      id: 'pending-qris',
      kind: 'PENDING_QRIS',
      label: `${pendingQrisOrders.length} pembayaran QRIS menunggu verifikasi`,
      detail: pendingQrisOrders.join(', '),
      href: '/orders?status=PENDING_VERIFICATION',
    })
  }
  if (unpaidCount > 0) {
    alerts.push({
      id: 'unpaid-today',
      kind: 'UNPAID',
      label: `${unpaidCount} pesanan belum dibayar`,
      detail: 'Termasuk pesanan mandiri pelanggan',
      href: '/orders?status=PENDING_PAYMENT',
    })
  }
  for (const d of unclosed) {
    alerts.push({
      id: `unclosed-${d}`,
      kind: 'UNCLOSED_DAY',
      label: `Tutup hari ${formatDate(d + 'T12:00:00+07:00')}?`,
      detail: 'Hari bisnis belum ditutup (laporan Z)',
      href: '/data',
    })
  }
  // informational: days this access just auto-closed from the ledger
  for (const d of autoClosed) {
    alerts.push({
      id: `autoclosed-${d}`,
      kind: 'AUTO_CLOSED_DAY',
      label: `Hari ${formatDate(d + 'T12:00:00+07:00')} ditutup otomatis`,
      detail: 'Lupa tutup hari — Z dibuat dari data pembukuan (selisih 0). Tinjau di Riwayat Z.',
      href: '/data',
    })
  }
  // recipe-deduction shortfalls with per-ingredient detail (SPEC §3.11)
  for (const log of shortfallLogs) {
    const a = (log.after ?? {}) as { sku?: string; name?: string; qtyNeeded?: number; qtyBefore?: number; orderCode?: string }
    if (!a.name) continue
    alerts.push({
      id: `shortfall-${log.id}`,
      kind: 'STOCK_SHORTFALL',
      label: `Stok kurang: ${a.name}`,
      detail: `Butuh ${formatNumber(a.qtyNeeded ?? 0)} — sisa ${formatNumber(a.qtyBefore ?? 0)} saat pesanan ${a.orderCode ?? ''}`,
      href: '/stock',
    })
  }

  // ---- live feed (last 10, newest on top) ----
  const feed: DashboardDTO['feed'] = logs.map((log) => ({
    id: log.id,
    label: `${log.user?.name ?? 'Sistem'} — ${describeAction(log.action, log.label)}`,
    at: log.createdAt.toISOString(),
  }))

  // ---- quick actions per role (max 5) ----
  const quickActions: DashboardDTO['quickActions'] = isBarista
    ? [
        { label: 'Buka Dapur', href: '/kitchen' },
        { label: 'Catat Stok', href: '/stock' },
      ]
    : session.role === 'CASHIER'
      ? [
          { label: 'Pesanan Baru', href: '/pos' },
          { label: 'Pesanan Ditahan', href: '/pos' },
          { label: `Verifikasi QRIS (${pendingQrisOrders.length})`, href: '/orders?status=PENDING_VERIFICATION' },
        ]
      : [
          { label: 'Pesanan Baru', href: '/pos' },
          { label: `Verifikasi QRIS (${pendingQrisOrders.length})`, href: '/orders?status=PENDING_VERIFICATION' },
          { label: 'Laporan Hari Ini', href: '/reports' },
          { label: 'Impor Excel', href: '/data' },
          { label: 'Tambah Produk', href: '/products' },
        ]

  const dto: DashboardDTO = {
    role: session.role,
    kpis,
    expectedCash: cashStatus?.expectedCash ?? null,
    alerts,
    feed,
    hourly,
    topProducts,
    quickActions,
    queueDepth,
    avgPrepMinutes,
  }
  return ok(dto)
})
