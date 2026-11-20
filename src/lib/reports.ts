// Reports: day snapshot computation (X non-destructive / Z close), range summaries,
// auto-close of forgotten business days. Training orders excluded everywhere.
import 'server-only'
import { db } from './db'
import { audit } from './audit'
import { emitRealtime } from './realtime'
import { getCashStatus } from './payments'
import { addDaysJakarta, todayJakarta } from './format'
import type { DailyReportRow, DayReportSnapshot, ReportSummaryDTO, SessionUser } from './types'

const dateRangeStart = (d: string) => new Date(d + 'T00:00:00+07:00')
const dateRangeEnd = (d: string) => new Date(d + 'T23:59:59+07:00')

export async function computeDayReport(businessDate: string): Promise<DayReportSnapshot> {
  const [orders, cash, wasteAgg] = await Promise.all([
    db.order.findMany({
      where: { businessDate, isTraining: false },
      include: {
        items: true,
        payments: true,
        cashier: { select: { name: true } },
      },
    }),
    getCashStatus(businessDate),
    db.stockMovement.aggregate({
      where: {
        type: 'WASTE',
        createdAt: { gte: dateRangeStart(businessDate), lte: dateRangeEnd(businessDate) },
        stockItem: { isActive: true },
      },
      _sum: { qtyDelta: true },
    }),
  ])

  const voidsList: DayReportSnapshot['voidsList'] = []
  const productTotals = new Map<string, { qty: number; revenue: number }>()
  const byType: Record<string, { count: number; revenue: number }> = {}
  const byHourMap = new Map<string, { revenue: number; orders: number }>()
  let gross = 0
  let discounts = 0
  let voids = 0
  let deliveryFees = 0
  let taxTotal = 0
  let orderCount = 0
  let itemCount = 0

  for (const o of orders) {
    const cancelled = o.status === 'CANCELLED'
    if (cancelled) {
      if (o.paidAt) {
        // paid-then-cancelled counts as a void with the paid amount
        const paidSum = o.payments.filter((p) => p.status !== 'REJECTED').reduce((s, p) => s + p.amount, 0)
        if (paidSum > 0) {
          voids += paidSum
          voidsList.push({
            code: o.code,
            reason: o.cancelReason ?? '—',
            amount: paidSum,
            by: o.cashier?.name ?? null,
            at: (o.cancelledAt ?? o.createdAt).toISOString(),
          })
        }
      }
      continue
    }
    orderCount += 1
    gross += o.subtotal
    discounts += o.discountTotal
    deliveryFees += o.deliveryFee
    taxTotal += o.taxTotal

    const t = (byType[o.type] ??= { count: 0, revenue: 0 })
    t.count += 1
    t.revenue += o.total

    const hour = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
    }).format(o.createdAt)
    const h = (byHourMap.get(hour) ?? { revenue: 0, orders: 0 })
    h.revenue += o.total
    h.orders += 1
    byHourMap.set(hour, h)

    for (const item of o.items) {
      if (item.isVoided) {
        voids += item.lineTotal
        voidsList.push({
          code: o.code,
          reason: item.voidReason ?? '—',
          amount: item.lineTotal,
          by: o.cashier?.name ?? null,
          at: o.createdAt.toISOString(),
        })
        continue
      }
      itemCount += item.qty
      const cur = productTotals.get(item.nameSnapshot) ?? { qty: 0, revenue: 0 }
      cur.qty += item.qty
      cur.revenue += item.lineTotal
      productTotals.set(item.nameSnapshot, cur)
    }
  }

  const cashTotal = orders
    .flatMap((o) => o.payments)
    .filter((p) => p.method === 'CASH' && p.status === 'CONFIRMED' && o_notCancelled(orders, p.orderId))
    .reduce((s, p) => s + p.amount, 0)
  const qrisTotal = orders
    .flatMap((o) => o.payments)
    .filter((p) => p.method === 'QRIS' && p.status === 'CONFIRMED' && o_notCancelled(orders, p.orderId))
    .reduce((s, p) => s + p.amount, 0)

  const byHour = [...byHourMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, v]) => ({ hour, ...v }))

  const topProducts = [...productTotals.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10)

  const existingZ = await db.dailyReport.findFirst({ where: { businessDate, kind: 'Z' } })
  const zSnap = existingZ ? (existingZ.snapshot as unknown as DayReportSnapshot) : null

  return {
    businessDate,
    gross,
    discounts,
    voids,
    net: gross - discounts + deliveryFees + taxTotal - voids,
    cashTotal,
    qrisTotal,
    deliveryFees,
    taxTotal,
    orderCount,
    itemCount,
    byType,
    byHour,
    openingFloat: cash.openingFloat,
    cashIn: cash.cashIn,
    cashOut: cash.cashOut,
    countedCash: zSnap?.countedCash ?? null,
    expectedCash: cash.expectedCash ?? 0,
    variance: zSnap?.variance ?? null,
    merchantQrisTotal: zSnap?.merchantQrisTotal ?? null,
    merchantQrisVariance: zSnap?.merchantQrisVariance ?? null,
    topProducts,
    voidsList,
    wasteTotal: -(wasteAgg._sum.qtyDelta ?? 0),
  }
}

function o_notCancelled(orders: { id: string; status: string }[], orderId: string): boolean {
  const o = orders.find((x) => x.id === orderId)
  return !!o && o.status !== 'CANCELLED'
}

export async function getDayReportRow(businessDate: string, kind: 'X' | 'Z'): Promise<DailyReportRow | null> {
  const r = await db.dailyReport.findFirst({
    where: { businessDate, kind },
    include: { generatedBy: { select: { name: true } } },
  })
  if (!r) return null
  return {
    id: r.id,
    businessDate: r.businessDate,
    kind: r.kind as 'X' | 'Z',
    status: r.status,
    isAutoClosed: r.isAutoClosed,
    closedAt: r.closedAt?.toISOString() ?? null,
    generatedBy: r.generatedBy?.name ?? null,
    snapshot: r.snapshot as unknown as DayReportSnapshot,
  }
}

export async function listDailyReports(limit = 30): Promise<DailyReportRow[]> {
  const rows = await db.dailyReport.findMany({
    where: { kind: 'Z' },
    orderBy: { businessDate: 'desc' },
    take: limit,
    include: { generatedBy: { select: { name: true } } },
  })
  return rows.map((r) => ({
    id: r.id,
    businessDate: r.businessDate,
    kind: r.kind as 'X' | 'Z',
    status: r.status,
    isAutoClosed: r.isAutoClosed,
    closedAt: r.closedAt?.toISOString() ?? null,
    generatedBy: r.generatedBy?.name ?? null,
    snapshot: r.snapshot as unknown as DayReportSnapshot,
  }))
}

/** Warnings gathered before closing a day (SPEC Z wizard step 1). */
export async function getDayWarnings(businessDate: string) {
  const [activeOrders, unpaid, pendingQris, held] = await Promise.all([
    db.order.count({ where: { businessDate, status: { in: ['PENDING_PAYMENT', 'PENDING_VERIFICATION', 'PAID', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] } } }),
    db.order.count({ where: { businessDate, status: 'PENDING_PAYMENT' } }),
    db.order.count({ where: { businessDate, status: 'PENDING_VERIFICATION' } }),
    db.heldOrder.count({ where: { businessDate } }),
  ])
  return { activeOrders, unpaid, pendingQris, held }
}

export async function closeDay(
  input: { businessDate?: string; countedCash: number; merchantQrisTotal?: number | null; override?: boolean },
  actor: SessionUser
): Promise<DailyReportRow> {
  const businessDate = input.businessDate ?? todayJakarta()
  const isToday = businessDate === todayJakarta()

  const existing = await db.dailyReport.findFirst({ where: { businessDate, kind: 'Z' } })
  if (existing) throw new Error(`Hari ${businessDate} sudah ditutup`)

  const warnings = await getDayWarnings(businessDate)
  const blocking =
    warnings.activeOrders > 0 || warnings.pendingQris > 0
  if (blocking && !input.override) {
    throw new Error(
      `Masih ada ${warnings.activeOrders} pesanan aktif / ${warnings.pendingQris} verifikasi QRIS tertunda — selesaikan dulu atau centang paksa (Admin)`
    )
  }

  const snapshot = await computeDayReport(businessDate)
  snapshot.countedCash = Math.round(input.countedCash)
  snapshot.variance = snapshot.countedCash - snapshot.expectedCash
  if (input.merchantQrisTotal !== null && input.merchantQrisTotal !== undefined) {
    snapshot.merchantQrisTotal = Math.round(input.merchantQrisTotal)
    snapshot.merchantQrisVariance = snapshot.merchantQrisTotal - snapshot.qrisTotal
  }

  const report = await db.dailyReport.create({
    data: {
      businessDate,
      kind: 'Z',
      status: 'CLOSED',
      snapshot: snapshot as never,
      generatedById: actor.id,
      closedAt: new Date(),
    },
  })

  // purge held orders of that date
  await db.heldOrder.deleteMany({ where: { businessDate } })
  void isToday

  await audit(actor, 'report.zClose', 'DailyReport', {
    entityId: report.id,
    label: businessDate,
    after: { countedCash: snapshot.countedCash, variance: snapshot.variance },
  })
  await emitRealtime('day:closed', { businessDate })

  return {
    id: report.id,
    businessDate,
    kind: 'Z',
    status: 'CLOSED',
    isAutoClosed: false,
    closedAt: report.closedAt?.toISOString() ?? null,
    generatedBy: actor.name,
    snapshot,
  }
}

/** Auto-close past unclosed business days from ledger (SPEC: forgotten EOD fix). */
export async function ensureClosedDates(): Promise<string[]> {
  const today = todayJakarta()
  const closed: string[] = []
  // scan last 14 days in TWO queries (pooled-connection friendly — no 28-roundtrip loop)
  const since = addDaysJakarta(today, -14)
  const [orderDates, zRows] = await Promise.all([
    db.order.groupBy({ by: ['businessDate'], where: { businessDate: { gte: since, lt: today } } }),
    db.dailyReport.findMany({
      where: { kind: 'Z', businessDate: { gte: since, lt: today } },
      select: { businessDate: true },
    }),
  ])
  const zSet = new Set(zRows.map((z) => z.businessDate))
  const unclosed = orderDates.map((o) => o.businessDate).filter((d) => !zSet.has(d)).sort()
  for (const date of unclosed) {
    const snapshot = await computeDayReport(date)
    snapshot.countedCash = snapshot.expectedCash
    snapshot.variance = 0
    await db.dailyReport.create({
      data: {
        businessDate: date,
        kind: 'Z',
        status: 'CLOSED',
        snapshot: snapshot as never,
        isAutoClosed: true,
        closedAt: new Date(),
      },
    })
    await db.heldOrder.deleteMany({ where: { businessDate: date } })
    closed.push(date)
  }
  return closed
}

/** Unclosed past dates for dashboard alerts. */
export async function unclosedPastDates(): Promise<string[]> {
  const today = todayJakarta()
  const dates: string[] = []
  for (let i = 1; i <= 14; i++) {
    const date = addDaysJakarta(today, -i)
    const [hasOrders, hasZ] = await Promise.all([
      db.order.count({ where: { businessDate: date }, take: 1 }).then((c) => c > 0),
      db.dailyReport.findFirst({ where: { businessDate: date, kind: 'Z' }, select: { id: true } }),
    ])
    if (hasOrders && !hasZ) dates.push(date)
  }
  return dates
}

// ---------- Range summary (reports page) ----------
export async function getReportSummary(from: string, to: string): Promise<ReportSummaryDTO> {
  const orders = await db.order.findMany({
    where: {
      businessDate: { gte: from, lte: to },
      isTraining: false,
    },
    include: { items: true, payments: true, cashier: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const voidsList: ReportSummaryDTO['voidsList'] = []
  const productTotals = new Map<string, { qty: number; revenue: number }>()
  const byType = new Map<string, { count: number; revenue: number }>()
  const byHourMap = new Map<string, { revenue: number; orders: number }>()
  const pendingPayments: ReportSummaryDTO['pendingPayments'] = []
  let gross = 0
  let discounts = 0
  let voids = 0
  let deliveryFees = 0
  let taxTotal = 0
  let itemCount = 0

  for (const o of orders) {
    if (o.status === 'CANCELLED') {
      const paidSum = o.payments.filter((p) => p.status !== 'REJECTED').reduce((s, p) => s + p.amount, 0)
      if (paidSum > 0) {
        voids += paidSum
        voidsList.push({ code: o.code, reason: o.cancelReason ?? '—', amount: paidSum, by: o.cashier?.name ?? null, at: (o.cancelledAt ?? o.createdAt).toISOString() })
      }
      continue
    }
    gross += o.subtotal
    discounts += o.discountTotal
    deliveryFees += o.deliveryFee
    taxTotal += o.taxTotal
    const t = byType.get(o.type) ?? { count: 0, revenue: 0 }
    t.count += 1
    t.revenue += o.total
    byType.set(o.type, t)

    const hour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).format(o.createdAt)
    const h = byHourMap.get(hour) ?? { revenue: 0, orders: 0 }
    h.revenue += o.total
    h.orders += 1
    byHourMap.set(hour, h)

    if (o.payments.some((p) => p.status === 'PENDING_VERIFICATION')) {
      pendingPayments.push({ code: o.code, amount: o.total, at: o.createdAt.toISOString() })
    }

    for (const item of o.items) {
      if (item.isVoided) {
        voids += item.lineTotal
        voidsList.push({ code: o.code, reason: item.voidReason ?? '—', amount: item.lineTotal, by: o.cashier?.name ?? null, at: o.createdAt.toISOString() })
        continue
      }
      itemCount += item.qty
      const cur = productTotals.get(item.nameSnapshot) ?? { qty: 0, revenue: 0 }
      cur.qty += item.qty
      cur.revenue += item.lineTotal
      productTotals.set(item.nameSnapshot, cur)
    }
  }

  const paymentTotals = new Map<string, { total: number; count: number }>()
  for (const o of orders) {
    if (o.status === 'CANCELLED') continue
    for (const p of o.payments) {
      if (p.status === 'REJECTED') continue
      const cur = paymentTotals.get(p.method) ?? { total: 0, count: 0 }
      cur.total += p.amount
      cur.count += 1
      paymentTotals.set(p.method, cur)
    }
  }

  const totalRevenue = [...productTotals.values()].reduce((s, v) => s + v.revenue, 0)
  const net = gross - discounts + deliveryFees + taxTotal - voids

  // stock usage for range
  const movements = await db.stockMovement.findMany({
    where: {
      createdAt: { gte: dateRangeStart(from), lte: dateRangeEnd(to) },
      type: { in: ['SALE_DEDUCT', 'WASTE'] },
    },
    include: { stockItem: { select: { name: true, unit: true } } },
  })
  const usage = new Map<string, { name: string; unit: string; consumed: number; wasted: number }>()
  for (const m of movements) {
    const cur = usage.get(m.stockItem.name) ?? { name: m.stockItem.name, unit: m.stockItem.unit, consumed: 0, wasted: 0 }
    if (m.type === 'SALE_DEDUCT') cur.consumed += -m.qtyDelta
    else cur.wasted += -m.qtyDelta
    usage.set(m.stockItem.name, cur)
  }

  const orderCount = orders.filter((o) => o.status !== 'CANCELLED').length

  return {
    from,
    to,
    gross,
    discounts,
    voids,
    net,
    deliveryFees,
    taxTotal,
    orderCount,
    itemCount,
    aov: orderCount > 0 ? Math.round(net / orderCount) : 0,
    byPayment: [...paymentTotals.entries()].map(([method, v]) => ({ method, ...v })),
    byType: [...byType.entries()].map(([type, v]) => ({ type, ...v })),
    hourly: [...byHourMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([hour, v]) => ({ hour, ...v })),
    productMix: [...productTotals.entries()]
      .map(([name, v]) => ({ name, ...v, share: totalRevenue > 0 ? v.revenue / totalRevenue : 0 }))
      .sort((a, b) => b.revenue - a.revenue),
    voidsList,
    stockUsage: [...usage.values()].sort((a, b) => b.consumed - a.consumed),
    pendingPayments,
  }
}
