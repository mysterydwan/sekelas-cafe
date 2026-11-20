// Payments: take payment (cash/QRIS/split), QRIS verification protocol, cash drawer math.
import 'server-only'
import { db } from './db'
import { audit } from './audit'
import { emitRealtime } from './realtime'
import { getSettings } from './settings'
import { currentBusinessDate } from './business-day'
import type { CashStatusDTO, OrderDTO, PaymentInput, SessionUser } from './types'
import { getOrderDTO } from './orders'

export async function takePayment(
  orderId: string,
  input: PaymentInput,
  actor: SessionUser
): Promise<OrderDTO> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: true } })
  if (!order) throw new Error('Pesanan tidak ditemukan')
  if (['COMPLETED', 'CANCELLED'].includes(order.status)) throw new Error('Pesanan sudah ditutup')
  if (order.payments.some((p) => p.status === 'PENDING_VERIFICATION'))
    throw new Error('Masih ada pembayaran menunggu verifikasi')
  if (order.payments.filter((p) => p.status !== 'REJECTED').length > 0)
    throw new Error('Pesanan ini sudah dibayar')

  const settings = await getSettings()
  const rows: {
    method: string
    amount: number
    cashReceived: number | null
    changeDue: number | null
    qrReference: string | null
    status: string
  }[] = []

  if (input.method === 'CASH') {
    const received = input.cashReceived ?? 0
    if (received < order.total) throw new Error('Uang tunai kurang dari total')
    rows.push({ method: 'CASH', amount: order.total, cashReceived: received, changeDue: received - order.total, qrReference: null, status: 'CONFIRMED' })
  } else if (input.method === 'QRIS') {
    if (!settings.payments.qrisImageUrl) throw new Error('QRIS belum diatur')
    rows.push({ method: 'QRIS', amount: order.total, cashReceived: null, changeDue: null, qrReference: input.qrReference ?? null, status: 'CONFIRMED' })
  } else if (input.method === 'SPLIT') {
    if (!settings.payments.splitEnabled) throw new Error('Pembayaran campuran tidak diaktifkan')
    const cashPortion = input.cashPortion ?? 0
    if (cashPortion <= 0 || cashPortion >= order.total) throw new Error('Porsi tunai harus antara Rp 1 dan total')
    rows.push(
      { method: 'CASH', amount: cashPortion, cashReceived: cashPortion, changeDue: 0, qrReference: null, status: 'CONFIRMED' },
      { method: 'QRIS', amount: order.total - cashPortion, cashReceived: null, changeDue: null, qrReference: input.qrReference ?? null, status: 'CONFIRMED' }
    )
  } else {
    throw new Error('Metode pembayaran tidak valid')
  }

  await db.payment.createMany({
    data: rows.map((r) => ({
      orderId,
      method: r.method,
      amount: r.amount,
      cashReceived: r.cashReceived,
      changeDue: r.changeDue,
      qrReference: r.qrReference,
      status: r.status,
      verifiedById: actor.id,
    })),
  })
  await db.order.update({ where: { id: orderId }, data: { status: 'PAID', paidAt: new Date(), cashierId: order.cashierId ?? actor.id } })
  await audit(actor, 'payment.take', 'Order', {
    entityId: orderId,
    label: order.code,
    after: { method: input.method, amount: order.total },
  })
  await emitRealtime('payment:updated', { id: orderId, code: order.code, paymentStatus: 'CONFIRMED', status: 'PAID' })

  // recipe deduction if trigger = PAID
  if (!order.isTraining && settings.stock.deductionTrigger === 'PAID') {
    const { deductRecipesForOrder } = await import('./stock')
    await deductRecipesForOrder(orderId, actor)
  }
  return (await getOrderDTO(orderId))!
}

export async function verifyQrisPayment(orderId: string, actor: SessionUser): Promise<OrderDTO> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: true } })
  if (!order) throw new Error('Pesanan tidak ditemukan')
  const pending = order.payments.filter((p) => p.status === 'PENDING_VERIFICATION')
  if (pending.length === 0) throw new Error('Tidak ada pembayaran menunggu verifikasi')
  await db.payment.updateMany({
    where: { id: { in: pending.map((p) => p.id) } },
    data: { status: 'CONFIRMED', verifiedById: actor.id },
  })
  const allConfirmed = order.payments.every((p) => p.status === 'CONFIRMED' || pending.some((q) => q.id === p.id))
  if (allConfirmed) {
    await db.order.update({ where: { id: orderId }, data: { status: 'PAID', paidAt: new Date() } })
  }
  await audit(actor, 'payment.verifyQris', 'Order', {
    entityId: orderId,
    label: order.code,
    after: { confirmed: pending.length },
  })
  await emitRealtime('payment:updated', { id: orderId, code: order.code, paymentStatus: 'CONFIRMED', status: 'PAID' })
  return (await getOrderDTO(orderId))!
}

export async function rejectQrisPayment(orderId: string, note: string, actor: SessionUser): Promise<OrderDTO> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: true } })
  if (!order) throw new Error('Pesanan tidak ditemukan')
  const pending = order.payments.filter((p) => p.status === 'PENDING_VERIFICATION')
  if (pending.length === 0) throw new Error('Tidak ada pembayaran menunggu verifikasi')
  if (!note?.trim()) throw new Error('Catatan penolakan wajib diisi')
  await db.payment.updateMany({
    where: { id: { in: pending.map((p) => p.id) } },
    data: { status: 'REJECTED' },
  })
  // return to unpaid unless another confirmed payment covers it
  const confirmed = order.payments.filter((p) => p.status === 'CONFIRMED')
  const covered = confirmed.reduce((s, p) => s + p.amount, 0) >= order.total
  await db.order.update({
    where: { id: orderId },
    data: { status: covered ? order.status : 'PENDING_PAYMENT' },
  })
  await audit(actor, 'payment.rejectQris', 'Order', {
    entityId: orderId,
    label: order.code,
    after: { note, rejected: pending.length },
  })
  await emitRealtime('payment:updated', { id: orderId, code: order.code, paymentStatus: 'REJECTED', status: covered ? order.status : 'PENDING_PAYMENT' })
  return (await getOrderDTO(orderId))!
}

// ---------- Cash drawer ----------
export async function recordCashMovement(
  type: 'OPENING_FLOAT' | 'CASH_IN' | 'CASH_OUT',
  amount: number,
  reason: string | undefined,
  actor: SessionUser
): Promise<CashStatusDTO> {
  if (!amount || amount <= 0) throw new Error('Jumlah tidak valid')
  const businessDate = currentBusinessDate()
  if (type === 'OPENING_FLOAT') {
    const existing = await db.cashMovement.findFirst({ where: { businessDate, type: 'OPENING_FLOAT' } })
    if (existing) throw new Error('Modal awal hari ini sudah diatur')
  }
  if (type !== 'OPENING_FLOAT' && !reason?.trim()) throw new Error('Alasan wajib diisi')
  await db.cashMovement.create({
    data: { businessDate, type, amount: Math.round(amount), reason: reason?.slice(0, 120) ?? null, userId: actor.id },
  })
  await audit(actor, `cash.${type.toLowerCase()}`, 'CashMovement', { after: { amount, reason } })
  return getCashStatus()
}

export async function getCashStatus(businessDate: string = currentBusinessDate()): Promise<CashStatusDTO> {
  const [movements, cashPayments] = await Promise.all([
    db.cashMovement.findMany({
      where: { businessDate },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { name: true } } },
    }),
    db.payment.aggregate({
      where: {
        method: 'CASH',
        status: 'CONFIRMED',
        order: { businessDate, isTraining: false, status: { not: 'CANCELLED' } },
      },
      _sum: { amount: true },
    }),
  ])
  const float = movements.find((m) => m.type === 'OPENING_FLOAT')?.amount ?? 0
  const cashIn = movements.filter((m) => m.type === 'CASH_IN').reduce((s, m) => s + m.amount, 0)
  const cashOut = movements.filter((m) => m.type === 'CASH_OUT').reduce((s, m) => s + m.amount, 0)
  const cashPaymentTotal = cashPayments._sum.amount ?? 0
  return {
    businessDate,
    hasFloat: movements.some((m) => m.type === 'OPENING_FLOAT'),
    openingFloat: float,
    cashIn,
    cashOut,
    cashPayments: cashPaymentTotal,
    expectedCash: float + cashPaymentTotal + cashIn - cashOut,
    movements: movements.map((m) => ({
      id: m.id,
      type: m.type as CashStatusDTO['movements'][number]['type'],
      amount: m.amount,
      reason: m.reason,
      user: m.user?.name ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  }
}
