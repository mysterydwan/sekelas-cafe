// Order engine: server-authoritative money, status machine with kitchen gating,
// voids, cancels, holds, courier, DTO mapping. All mutations audited + realtime.
import 'server-only'
import { db } from './db'
import { audit } from './audit'
import { emitRealtime } from './realtime'
import { currentBusinessDate, checkIdempotency, rememberIdempotency, nextOrderCode } from './business-day'
import { getSettings } from './settings'
import { deductRecipesForOrder, type StockShortfall } from './stock'
import type {
  CreateOrderInput,
  DraftLine,
  OrderDTO,
  OrderItemDTO,
  OrderListResult,
  OrderStatus,
  OrderType,
  PaymentDTO,
  SessionUser,
  TimelineEntry,
} from './types'
import { ORDER_STATUS_LABEL } from './types'

const ACTIVE_STATUSES = ['PENDING_PAYMENT', 'PENDING_VERIFICATION', 'PAID', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']

// ---------- DTO mapping ----------
export function toOrderDTO(
  o: {
    id: string
    code: string
    businessDate: string
    type: string
    status: string
    source: string
    isTraining: boolean
    customerName: string | null
    customerPhone: string | null
    tableLabel: string | null
    deliveryLocation: string | null
    courierName: string | null
    note: string | null
    subtotal: number
    deliveryFee: number
    discountTotal: number
    discountReason: string | null
    taxTotal: number
    total: number
    needsAck: boolean
    createdAt: Date
    paidAt: Date | null
    preparingAt: Date | null
    readyAt: Date | null
    outForDeliveryAt: Date | null
    completedAt: Date | null
    cancelledAt: Date | null
    cancelReason: string | null
    cashier?: { name: string } | null
    preparer?: { name: string } | null
    server?: { name: string } | null
    items: {
      id: string
      productId: string | null
      nameSnapshot: string
      qty: number
      unitPrice: number
      variantSnapshot: unknown
      lineTotal: number
      note: string | null
      checkedCount: number
      isVoided: boolean
      voidReason: string | null
    }[]
    payments: {
      id: string
      method: string
      amount: number
      cashReceived: number | null
      changeDue: number | null
      qrReference: string | null
      status: string
      paidAt: Date
      verifiedBy?: { name: string } | null
    }[]
  },
  actors?: {
    paidBy?: string | null
    readyBy?: string | null
    outForDeliveryBy?: string | null
    cancelledBy?: string | null
  }
): OrderDTO {
  const paymentStatus = (() => {
    if (o.payments.length === 0) return 'UNPAID' as const
    const anyPending = o.payments.some((p) => p.status === 'PENDING_VERIFICATION')
    if (anyPending) return 'PENDING_VERIFICATION' as const
    if (o.payments.every((p) => p.status === 'REJECTED')) return 'REJECTED' as const
    return 'CONFIRMED' as const
  })()

  const timeline: TimelineEntry[] = [
    { status: 'CREATED', label: 'Diterima', at: o.createdAt.toISOString(), by: o.cashier?.name ?? null },
    { status: 'PAID', label: 'Dibayar', at: o.paidAt?.toISOString() ?? null, by: actors?.paidBy ?? null },
    { status: 'PREPARING', label: 'Dimasak', at: o.preparingAt?.toISOString() ?? null, by: o.preparer?.name ?? null },
    { status: 'READY', label: 'Siap Diambil', at: o.readyAt?.toISOString() ?? null, by: actors?.readyBy ?? null },
    ...(o.type === 'DELIVERY'
      ? [{ status: 'OUT_FOR_DELIVERY' as OrderStatus, label: 'Sedang Diantar', at: o.outForDeliveryAt?.toISOString() ?? null, by: actors?.outForDeliveryBy ?? null }]
      : []),
    { status: 'COMPLETED', label: 'Selesai', at: o.completedAt?.toISOString() ?? null, by: o.server?.name ?? null },
    ...(o.cancelledAt
      ? [{ status: 'CANCELLED' as OrderStatus, label: 'Dibatalkan', at: o.cancelledAt.toISOString(), by: actors?.cancelledBy ?? null }]
      : []),
  ]

  const items: OrderItemDTO[] = o.items.map((i) => ({
    id: i.id,
    productId: i.productId,
    name: i.nameSnapshot,
    qty: i.qty,
    unitPrice: i.unitPrice,
    lineTotal: i.lineTotal,
    variantLabels: Array.isArray(i.variantSnapshot)
      ? (i.variantSnapshot as { label: string; priceDelta: number }[]).map(
          (v) => (v.priceDelta ? `${v.priceDelta > 0 ? '+ ' : ''}${v.label}` : v.label)
        )
      : [],
    note: i.note,
    checkedCount: i.checkedCount,
    isVoided: i.isVoided,
    voidReason: i.voidReason,
  }))

  const payments: PaymentDTO[] = o.payments.map((p) => ({
    id: p.id,
    method: p.method as PaymentDTO['method'],
    amount: p.amount,
    cashReceived: p.cashReceived,
    changeDue: p.changeDue,
    qrReference: p.qrReference,
    status: p.status as PaymentDTO['status'],
    verifiedBy: p.verifiedBy?.name ?? null,
    paidAt: p.paidAt.toISOString(),
  }))

  return {
    id: o.id,
    code: o.code,
    businessDate: o.businessDate,
    type: o.type as OrderType,
    status: o.status as OrderStatus,
    source: o.source as 'POS' | 'PUBLIC',
    isTraining: o.isTraining,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    tableLabel: o.tableLabel,
    deliveryLocation: o.deliveryLocation,
    courierName: o.courierName,
    note: o.note,
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    discountTotal: o.discountTotal,
    discountReason: o.discountReason,
    taxTotal: o.taxTotal,
    total: o.total,
    cashier: o.cashier?.name ?? null,
    preparedBy: o.preparer?.name ?? null,
    servedBy: o.server?.name ?? null,
    needsAck: o.needsAck,
    createdAt: o.createdAt.toISOString(),
    paidAt: o.paidAt?.toISOString() ?? null,
    preparingAt: o.preparingAt?.toISOString() ?? null,
    readyAt: o.readyAt?.toISOString() ?? null,
    outForDeliveryAt: o.outForDeliveryAt?.toISOString() ?? null,
    completedAt: o.completedAt?.toISOString() ?? null,
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
    cancelReason: o.cancelReason,
    items,
    payments,
    paymentStatus,
    timeline,
  }
}

const orderInclude = {
  cashier: { select: { name: true } },
  preparer: { select: { name: true } },
  server: { select: { name: true } },
  items: true,
  payments: { include: { verifiedBy: { select: { name: true } } } },
} as const

/** Shortfall warnings → audit log (dashboard reads these, SPEC §3.11 per-ingredient detail). */
async function recordShortfalls(shortfalls: StockShortfall[], orderCode: string) {
  for (const s of shortfalls) {
    await audit(null, 'stock.shortfall', 'StockItem', {
      entityId: s.sku,
      label: `${orderCode} — ${s.name}`,
      after: { sku: s.sku, name: s.name, qtyNeeded: s.qtyNeeded, qtyBefore: s.qtyBefore, orderCode },
    })
    await emitRealtime('stock:low', {
      sku: s.sku,
      name: s.name,
      qty: s.qtyBefore - s.qtyNeeded,
      lowThreshold: 0,
    })
  }
}

export async function getOrderDTO(idOrCode: string): Promise<OrderDTO | null> {
  const o = await db.order.findFirst({
    where: { OR: [{ id: idOrCode }, { code: idOrCode.toUpperCase() }] },
    include: orderInclude,
    orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
  })
  if (!o) return null
  // Timeline actor attribution (SPEC §3.9): audit logs carry who did what that
  // the order row itself doesn't store (PAID/READY/OUT_FOR_DELIVERY/CANCELLED).
  const logs = await db.auditLog.findMany({
    where: {
      entity: 'Order',
      entityId: o.id,
      action: { in: ['order.status:READY', 'order.status:OUT_FOR_DELIVERY', 'order.cancel'] },
    },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const actors: Partial<Record<string, string | null>> = {}
  for (const log of logs) {
    if (!(log.action in actors)) actors[log.action] = log.user?.name ?? null
  }
  const paidVerifier = o.payments.find((p) => p.status === 'CONFIRMED' && p.verifiedBy)?.verifiedBy?.name ?? null
  return toOrderDTO(o, {
    paidBy: paidVerifier ?? o.cashier?.name ?? null,
    readyBy: actors['order.status:READY'] ?? null,
    outForDeliveryBy: actors['order.status:OUT_FOR_DELIVERY'] ?? null,
    cancelledBy: actors['order.cancel'] ?? null,
  })
}

// ---------- Create order (POS + public self-order) ----------
interface ResolvedLine {
  productId: string
  nameSnapshot: string
  qty: number
  unitPrice: number
  variants: { group: string; label: string; priceDelta: number }[]
  lineTotal: number
  note?: string
}

async function resolveLines(items: DraftLine[]): Promise<ResolvedLine[]> {
  const resolved: ResolvedLine[] = []
  for (const line of items) {
    if (!line.qty || line.qty < 1) throw new Error('Jumlah item tidak valid')
    if (line.qty > 99) throw new Error('Jumlah item maksimal 99')
    const product = await db.product.findUnique({
      where: { id: line.productId },
      include: { variantGroups: { include: { options: true }, orderBy: { sortOrder: 'asc' } } },
    })
    if (!product || !product.isActive) throw new Error(`Produk tidak lagi tersedia`)
    if (!product.isAvailable) throw new Error(`${product.name} sedang habis`)
    const chosen = line.optionIds ?? []
    const variants: { group: string; label: string; priceDelta: number }[] = []
    let delta = 0
    for (const gid of chosen) {
      for (const g of product.variantGroups) {
        const opt = g.options.find((o) => o.id === gid && o.isActive)
        if (opt) {
          variants.push({ group: g.name, label: opt.label, priceDelta: opt.priceDelta })
          delta += opt.priceDelta
        }
      }
    }
    // required-group validation
    for (const g of product.variantGroups) {
      if (!g.isActive || !g.isRequired) continue
      const picked = variants.filter((v) => v.group === g.name).length
      if (picked < 1) throw new Error(`${product.name}: pilih ${g.name} dulu`)
      if (picked > Math.max(1, g.maxSelect)) throw new Error(`${product.name}: maksimal ${g.maxSelect} pilihan untuk ${g.name}`)
    }
    const unitPrice = product.basePrice + delta
    resolved.push({
      productId: product.id,
      nameSnapshot: product.name,
      qty: line.qty,
      unitPrice,
      variants,
      lineTotal: unitPrice * line.qty,
      note: line.note?.slice(0, 200) || undefined,
    })
  }
  if (resolved.length === 0) throw new Error('Keranjang masih kosong')
  if (resolved.length > 50) throw new Error('Maksimal 50 jenis item per pesanan')
  return resolved
}

export async function createOrder(
  input: CreateOrderInput,
  actor: SessionUser | null
): Promise<OrderDTO> {
  // idempotency (public)
  const existingId = checkIdempotency(input.idempotencyKey)
  if (existingId) {
    const existing = await getOrderDTO(existingId)
    if (existing) return existing
  }

  const settings = await getSettings()
  const lines = await resolveLines(input.items)
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)

  // delivery rules
  if (input.type === 'DELIVERY') {
    if (!settings.ordering.deliveryEnabled) throw new Error('Layanan antar sedang tidak tersedia')
    if (!input.deliveryLocation?.trim()) throw new Error('Lokasi antar wajib diisi')
    if (settings.ordering.requirePhoneForDelivery && !input.customerPhone?.trim())
      throw new Error('Nomor HP penerima wajib diisi untuk pesanan antar')
  }
  if (input.type === 'DINE_IN' && input.tableLabel) input.tableLabel = input.tableLabel.slice(0, 20)

  const deliveryFee = input.type === 'DELIVERY' ? settings.ordering.deliveryFee : 0

  // discount
  let discountTotal = 0
  if (input.discount) {
    const { type, value, reason } = input.discount
    if (!reason?.trim()) throw new Error('Alasan diskon wajib diisi')
    discountTotal =
      type === 'RP' ? Math.min(value, subtotal) : Math.min(Math.round((subtotal * value) / 100), subtotal)
    if (discountTotal < 0) discountTotal = 0
  }

  const taxTotal = Math.round(((subtotal - discountTotal) * settings.ordering.taxRatePercent) / 100)
  const total = subtotal - discountTotal + deliveryFee + taxTotal

  // payment resolution
  let status: OrderStatus = 'PENDING_PAYMENT'
  let paymentRows: {
    method: string
    amount: number
    cashReceived?: number
    changeDue?: number
    qrReference?: string
    status: string
  }[] = []
  const payment = input.payment ?? null

  if (payment) {
    if (payment.method === 'CASH') {
      const received = payment.cashReceived ?? 0
      if (received < total) throw new Error('Uang tunai kurang dari total')
      status = 'PAID'
      paymentRows = [
        { method: 'CASH', amount: total, cashReceived: received, changeDue: received - total, status: 'CONFIRMED' },
      ]
    } else if (payment.method === 'QRIS') {
      if (!settings.payments.qrisImageUrl) throw new Error('QRIS belum diatur di pengaturan')
      if (input.source === 'PUBLIC') {
        // customer claims paid — cashier must verify mutation (SPEC protocol)
        status = 'PENDING_VERIFICATION'
        paymentRows = [{ method: 'QRIS', amount: total, qrReference: payment.qrReference, status: 'PENDING_VERIFICATION' }]
      } else {
        // POS: cashier confirms after checking merchant mutation
        status = 'PAID'
        paymentRows = [{ method: 'QRIS', amount: total, qrReference: payment.qrReference, status: 'CONFIRMED' }]
      }
    } else if (payment.method === 'SPLIT') {
      if (!settings.payments.splitEnabled) throw new Error('Pembayaran campuran tidak diaktifkan')
      const cashPortion = payment.cashPortion ?? 0
      if (cashPortion <= 0 || cashPortion >= total) throw new Error('Porsi tunai harus antara Rp 1 dan total')
      const qrPortion = total - cashPortion
      status = input.source === 'PUBLIC' ? 'PENDING_VERIFICATION' : 'PAID'
      const pStatus = input.source === 'PUBLIC' ? 'PENDING_VERIFICATION' : 'CONFIRMED'
      paymentRows = [
        { method: 'CASH', amount: cashPortion, cashReceived: cashPortion, changeDue: 0, status: 'CONFIRMED' },
        { method: 'QRIS', amount: qrPortion, qrReference: payment.qrReference, status: pStatus },
      ]
    }
  }

  const businessDate = currentBusinessDate()
  const { code } = await nextOrderCode(settings.profile.orderCodePrefix)

  const order = await db.order.create({
    data: {
      code,
      businessDate,
      type: input.type,
      status,
      source: input.source,
      isTraining: input.isTraining ?? false,
      customerName: input.customerName?.slice(0, 60) || null,
      customerPhone: input.customerPhone?.slice(0, 20) || null,
      tableLabel: input.tableLabel || null,
      deliveryLocation: input.deliveryLocation?.slice(0, 120) || null,
      note: input.note?.slice(0, 300) || null,
      subtotal,
      deliveryFee,
      discountTotal,
      discountReason: input.discount?.reason || null,
      taxTotal,
      total,
      cashierId: actor?.id ?? null,
      paidAt: status === 'PAID' ? new Date() : null,
      idempotencyKey: input.idempotencyKey ?? null,
      items: {
        create: lines.map((l) => ({
          productId: l.productId,
          nameSnapshot: l.nameSnapshot,
          qty: l.qty,
          unitPrice: l.unitPrice,
          variantSnapshot: l.variants as never,
          lineTotal: l.lineTotal,
          note: l.note ?? null,
        })),
      },
      payments: {
        create: paymentRows.map((p) => ({
          method: p.method,
          amount: p.amount,
          cashReceived: p.cashReceived ?? null,
          changeDue: p.changeDue ?? null,
          qrReference: p.qrReference ?? null,
          status: p.status,
          verifiedById: p.status === 'CONFIRMED' && actor ? actor.id : null,
        })),
      },
    },
    include: orderInclude,
  })

  rememberIdempotency(input.idempotencyKey, order.id)
  await audit(actor, 'order.create', 'Order', {
    entityId: order.id,
    label: order.code,
    after: { code, total, status, type: input.type },
  })
  await emitRealtime('order:created', { id: order.id, code: order.code, status, type: order.type })

  // recipe deduction at PAID (when configured)
  if (status === 'PAID' && !order.isTraining && settings.stock.deductionTrigger === 'PAID') {
    const shortfalls = await deductRecipesForOrder(order.id, actor)
    if (shortfalls.length > 0) await recordShortfalls(shortfalls, order.code)
  }

  return toOrderDTO(order)
}

// ---------- Kitchen: per-unit check-off + THE GATE ----------
export async function checkItem(
  orderId: string,
  itemId: string,
  delta: 1 | -1,
  actor: SessionUser
): Promise<OrderDTO> {
  const item = await db.orderItem.findUnique({ where: { id: itemId }, include: { order: true } })
  if (!item || item.orderId !== orderId) throw new Error('Item tidak ditemukan')
  const order = item.order
  if (!['PAID', 'PREPARING'].includes(order.status))
    throw new Error('Pesanan ini tidak lagi di antrean dapur')
  if (item.isVoided) throw new Error('Item sudah dibatalkan')

  const nextCount = Math.max(0, Math.min(item.qty, item.checkedCount + delta))
  if (nextCount === item.checkedCount) return (await getOrderDTO(orderId))!

  await db.orderItem.update({ where: { id: itemId }, data: { checkedCount: nextCount } })

  // first check-off auto-advances to PREPARING
  if (order.status === 'PAID' && nextCount > 0) {
    await db.order.update({
      where: { id: orderId },
      data: { status: 'PREPARING', preparingAt: new Date(), preparedById: actor.id },
    })
  }
  await emitRealtime('order:itemChecked', { id: orderId, code: order.code, itemId, checkedCount: nextCount })
  return (await getOrderDTO(orderId))!
}

export async function allItemsChecked(orderId: string): Promise<boolean> {
  const items = await db.orderItem.findMany({ where: { orderId, isVoided: false } })
  return items.length > 0 && items.every((i) => i.checkedCount >= i.qty)
}

// ---------- Status machine ----------
export async function transitionOrder(
  orderId: string,
  next: OrderStatus,
  actor: SessionUser,
  reason?: string
): Promise<OrderDTO> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
  if (!order) throw new Error('Pesanan tidak ditemukan')

  const settings = await getSettings()
  const now = new Date()

  switch (next) {
    case 'PREPARING': {
      if (order.status !== 'PAID') throw new Error('Pesanan tidak bisa dimasak')
      await db.order.update({
        where: { id: orderId },
        data: { status: 'PREPARING', preparingAt: now, preparedById: actor.id },
      })
      break
    }
    case 'READY': {
      if (!['PAID', 'PREPARING'].includes(order.status))
        throw new Error('Pesanan tidak bisa ditandai siap')
      // THE GATE: every non-voided item must be fully checked
      const pending = order.items.filter((i) => !i.isVoided && i.checkedCount < i.qty)
      if (pending.length > 0) {
        const remaining = pending.reduce((s, i) => s + (i.qty - i.checkedCount), 0)
        throw new Error(`Sisa ${remaining} cup belum dicentang`)
      }
      await db.order.update({ where: { id: orderId }, data: { status: 'READY', readyAt: now } })
      if (!order.isTraining && settings.stock.deductionTrigger === 'READY') {
        const shortfalls = await deductRecipesForOrder(orderId, actor)
        if (shortfalls.length > 0) await recordShortfalls(shortfalls, order.code)
      }
      break
    }
    case 'OUT_FOR_DELIVERY': {
      if (order.type !== 'DELIVERY') throw new Error('Pesanan ini bukan pesanan antar')
      if (order.status !== 'READY') throw new Error('Pesanan harus SIAP dulu sebelum diantar')
      await db.order.update({
        where: { id: orderId },
        data: { status: 'OUT_FOR_DELIVERY', outForDeliveryAt: now, courierName: order.courierName },
      })
      break
    }
    case 'COMPLETED': {
      if (!['READY', 'OUT_FOR_DELIVERY'].includes(order.status))
        throw new Error('Pesanan harus SIAP dulu')
      await db.order.update({
        where: { id: orderId },
        data: { status: 'COMPLETED', completedAt: now, servedById: actor.id },
      })
      break
    }
    case 'CANCELLED': {
      if (['COMPLETED', 'CANCELLED'].includes(order.status))
        throw new Error('Pesanan sudah selesai/dibatalkan')
      if (!reason?.trim()) throw new Error('Alasan pembatalan wajib diisi')
      await db.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason },
      })
      break
    }
    default:
      throw new Error('Transisi status tidak valid')
  }

  const updated = await getOrderDTO(orderId)
  await audit(actor, `order.status:${next}`, 'Order', {
    entityId: orderId,
    label: order.code,
    after: { status: next, reason: reason ?? null },
  })
  await emitRealtime('order:status', { id: orderId, code: order.code, status: next })
  return updated!
}

export async function voidItem(
  orderId: string,
  itemId: string,
  reason: string,
  actor: SessionUser
): Promise<OrderDTO> {
  const item = await db.orderItem.findUnique({ where: { id: itemId }, include: { order: true } })
  if (!item || item.orderId !== orderId) throw new Error('Item tidak ditemukan')
  if (item.isVoided) throw new Error('Item sudah dibatalkan')
  if (!reason?.trim()) throw new Error('Alasan wajib diisi')
  if (item.order.status === 'COMPLETED') throw new Error('Pesanan sudah selesai')

  await db.orderItem.update({ where: { id: itemId }, data: { isVoided: true, voidReason: reason, checkedCount: 0 } })
  // kitchen must acknowledge the change (blink-until-ack)
  await db.order.update({ where: { id: orderId }, data: { needsAck: true } })
  await audit(actor, 'order.voidItem', 'OrderItem', {
    entityId: itemId,
    label: `${item.order.code} — ${item.nameSnapshot}`,
    after: { reason },
  })
  await emitRealtime('order:needsAck', { id: orderId, code: item.order.code })
  return (await getOrderDTO(orderId))!
}

export async function cancelOrder(orderId: string, reason: string, actor: SessionUser): Promise<OrderDTO> {
  // Post-payment cancel records the manual refund note (SPEC §3.9: cash returned
  // from drawer / QRIS refund tracked outside the system).
  const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: true } })
  if (!order) throw new Error('Pesanan tidak ditemukan')
  let refundNote: string | null = null
  const confirmed = order.payments.filter((p) => p.status === 'CONFIRMED')
  if (confirmed.length > 0) {
    const cashSum = confirmed.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amount, 0)
    const qrisSum = confirmed.filter((p) => p.method === 'QRIS').reduce((s, p) => s + p.amount, 0)
    const parts: string[] = []
    if (cashSum > 0) parts.push(`Refund tunai manual ${formatIDRSafe(cashSum)} dikembalikan dari laci`)
    if (qrisSum > 0) parts.push(`Refund QRIS ${formatIDRSafe(qrisSum)} dicatat manual di luar sistem`)
    refundNote = parts.join(' · ')
  }
  const fullReason = refundNote ? `${reason} — ${refundNote}` : reason
  const updated = await transitionOrder(orderId, 'CANCELLED', actor, fullReason)
  await audit(actor, 'order.cancel', 'Order', {
    entityId: orderId,
    label: updated.code,
    after: { reason, refundNote },
  })
  return updated
}

function formatIDRSafe(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID')
}

export async function ackOrder(orderId: string): Promise<OrderDTO> {
  await db.order.update({ where: { id: orderId }, data: { needsAck: false } })
  return (await getOrderDTO(orderId))!
}

export async function assignCourier(orderId: string, name: string, actor: SessionUser): Promise<OrderDTO> {
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Pesanan tidak ditemukan')
  await db.order.update({ where: { id: orderId }, data: { courierName: name.slice(0, 40) } })
  await audit(actor, 'order.courier', 'Order', { entityId: orderId, label: order.code, after: { courier: name } })
  return (await getOrderDTO(orderId))!
}

// ---------- Listing ----------
export async function listOrders(filters: {
  from?: string
  to?: string
  status?: string
  type?: string
  paymentMethod?: string
  cashierId?: string
  search?: string
  page?: number
  pageSize?: number
  sort?: 'time' | 'total'
  dir?: 'asc' | 'desc'
}): Promise<OrderListResult> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 50))
  const where: Record<string, unknown> = {}
  if (filters.from || filters.to) {
    const bd: { gte?: string; lte?: string } = {}
    if (filters.from) bd.gte = filters.from
    if (filters.to) bd.lte = filters.to
    where.businessDate = bd
  }
  if (filters.status) where.status = filters.status
  if (filters.type) where.type = filters.type
  if (filters.cashierId) where.cashierId = filters.cashierId
  if (filters.search) {
    const q = filters.search.trim()
    where.OR = [
      { code: { contains: q.toUpperCase() } },
      { customerName: { contains: q } },
      { deliveryLocation: { contains: q } },
      { tableLabel: { contains: q } },
    ]
  }
  if (filters.paymentMethod === 'CASH' || filters.paymentMethod === 'QRIS') {
    where.payments = { some: { method: filters.paymentMethod } }
  } else if (filters.paymentMethod === 'UNPAID') {
    where.payments = { none: {} }
  }

  const orderBy: Record<string, 'asc' | 'desc'> =
    filters.sort === 'total'
      ? { total: filters.dir ?? 'desc' }
      : { createdAt: filters.dir ?? 'desc' }

  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { items: true, payments: true, cashier: { select: { name: true } } },
    }),
    db.order.count({ where }),
  ])

  return {
    rows: rows.map((o) => {
      const paidSum = o.payments.filter((p) => p.status !== 'REJECTED').reduce((s, p) => s + p.amount, 0)
      return {
        id: o.id,
        code: o.code,
        type: o.type as OrderType,
        status: o.status as OrderStatus,
        total: o.total,
        itemCount: o.items.reduce((s, i) => s + (i.isVoided ? 0 : i.qty), 0),
        customerLabel: o.customerName || o.tableLabel || o.deliveryLocation || '—',
        paymentLabel:
          o.payments.length === 0
            ? 'Belum bayar'
            : o.payments.some((p) => p.status === 'PENDING_VERIFICATION')
              ? 'Verifikasi QRIS'
              : o.payments.map((p) => p.method).join(' + ') + (paidSum < o.total ? ' (kurang)' : ''),
        cashier: o.cashier?.name ?? null,
        createdAt: o.createdAt.toISOString(),
      }
    }),
    total,
    page,
    pageSize,
  }
}

// ---------- Held orders (park/recall) ----------
export async function holdOrder(
  label: string,
  items: DraftLine[],
  meta: Record<string, unknown>,
  actor: SessionUser
) {
  const businessDate = currentBusinessDate()
  // cap 20 active
  const count = await db.heldOrder.count({ where: { businessDate } })
  if (count >= 20) throw new Error('Maksimal 20 pesanan ditahan — selesaikan dulu')
  const held = await db.heldOrder.create({
    data: {
      label: label.slice(0, 40),
      itemsSnapshot: items as never,
      metaSnapshot: meta as never,
      businessDate,
      createdById: actor.id,
    },
  })
  await audit(actor, 'order.hold', 'HeldOrder', { entityId: held.id, label })
  return held
}

export async function listHeld() {
  const rows = await db.heldOrder.findMany({
    where: { businessDate: currentBusinessDate() },
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { name: true } } },
  })
  return rows.map((h) => ({
    id: h.id,
    label: h.label,
    itemCount: ((h.itemsSnapshot as unknown as DraftLine[]) ?? []).reduce((s, l) => s + l.qty, 0),
    createdAt: h.createdAt.toISOString(),
    createdBy: h.createdBy.name,
  }))
}

export async function getHeld(id: string) {
  return db.heldOrder.findUnique({ where: { id } })
}

export async function deleteHeld(id: string, actor: SessionUser) {
  await db.heldOrder.delete({ where: { id } })
  await audit(actor, 'order.heldDelete', 'HeldOrder', { entityId: id })
}

/** Purge expired held orders (called on day close + listing) */
export async function purgeExpiredHeld() {
  const today = currentBusinessDate()
  await db.heldOrder.deleteMany({ where: { businessDate: { lt: today } } })
}

export { ACTIVE_STATUSES }
