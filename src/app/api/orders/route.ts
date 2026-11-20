// Orders API: list (light rows or full=1 OrderDTOs) + POS order creation.
import { z } from 'zod'
import { ok, fail, parseBody, withAuth } from '@/lib/api'
import { db } from '@/lib/db'
import { hasGrant } from '@/lib/grants'
import { currentBusinessDate } from '@/lib/business-day'
import { createOrder, listOrders, toOrderDTO } from '@/lib/orders'
import { getSettings } from '@/lib/settings'
import type { OrderDTO } from '@/lib/types'

// same include pattern as getOrderDTO (full=1 kitchen/POS rows)
const fullInclude = {
  cashier: { select: { name: true } },
  preparer: { select: { name: true } },
  server: { select: { name: true } },
  items: true,
  payments: { include: { verifiedBy: { select: { name: true } } } },
} as const

function buildWhere(f: {
  from?: string
  to?: string
  status?: string
  type?: string
  paymentMethod?: string
  cashierId?: string
  search?: string
}): Record<string, unknown> {
  const where: Record<string, unknown> = {}
  if (f.from || f.to) {
    const bd: { gte?: string; lte?: string } = {}
    if (f.from) bd.gte = f.from
    if (f.to) bd.lte = f.to
    where.businessDate = bd
  }
  if (f.status) where.status = f.status
  if (f.type) where.type = f.type
  if (f.cashierId) where.cashierId = f.cashierId
  if (f.search) {
    const q = f.search.trim()
    where.OR = [
      { code: { contains: q.toUpperCase() } },
      { customerName: { contains: q } },
      { deliveryLocation: { contains: q } },
      { tableLabel: { contains: q } },
    ]
  }
  if (f.paymentMethod === 'CASH' || f.paymentMethod === 'QRIS') {
    where.payments = { some: { method: f.paymentMethod } }
  } else if (f.paymentMethod === 'UNPAID') {
    where.payments = { none: {} }
  }
  return where
}

export const GET = withAuth(async (req) => {
  const sp = req.nextUrl.searchParams
  const filters = {
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    status: sp.get('status') ?? undefined,
    type: sp.get('type') ?? undefined,
    paymentMethod: sp.get('paymentMethod') ?? undefined,
    cashierId: sp.get('cashierId') ?? undefined,
    search: sp.get('search') ?? undefined,
    page: sp.get('page') ? parseInt(sp.get('page')!, 10) : undefined,
    pageSize: sp.get('pageSize') ? parseInt(sp.get('pageSize')!, 10) : undefined,
    sort: sp.get('sort') === 'total' ? 'total' : sp.get('sort') === 'time' ? 'time' : undefined,
    dir: sp.get('dir') === 'asc' ? 'asc' : sp.get('dir') === 'desc' ? 'desc' : undefined,
  }

  if (sp.get('full') === '1') {
    // full OrderDTO rows for whatever filter is given (default: today onward).
    // Used by POS open-orders tab + KDS board.
    if (!filters.from && !filters.to) filters.from = currentBusinessDate()
    const where = buildWhere(filters)
    const rows = await db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: fullInclude,
    })
    const dtos = rows.map((r) => toOrderDTO(r))
    return ok({ rows: dtos as OrderDTO[], total: dtos.length, page: 1, pageSize: dtos.length })
  }

  const { sort, dir, ...rest } = filters
  const result = await listOrders({
    ...rest,
    sort: sort as 'time' | 'total' | undefined,
    dir: dir as 'asc' | 'desc' | undefined,
  })
  return ok(result)
})

const lineSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().optional(),
  qty: z.number().int().min(1, 'Jumlah item minimal 1').max(99),
  optionIds: z.array(z.string()).default([]),
  note: z.string().max(200).optional(),
})

const createSchema = z.object({
  items: z.array(lineSchema).min(1, 'Keranjang masih kosong'),
  type: z.enum(['DINE_IN', 'TAKE_AWAY', 'DELIVERY']),
  tableLabel: z.string().max(20).optional(),
  customerName: z.string().max(60).optional(),
  customerPhone: z.string().max(20).optional(),
  deliveryLocation: z.string().max(120).optional(),
  note: z.string().max(300).optional(),
  discount: z
    .object({
      type: z.enum(['RP', 'PERCENT']),
      value: z.number().int().positive('Nilai diskon tidak valid'),
      reason: z.string().min(1, 'Alasan diskon wajib diisi'),
    })
    .optional(),
  payment: z
    .object({
      method: z.enum(['CASH', 'QRIS', 'SPLIT']),
      cashReceived: z.number().int().nonnegative().optional(),
      cashPortion: z.number().int().nonnegative().optional(),
      qrReference: z.string().max(60).optional(),
    })
    .nullable()
    .optional(),
  isTraining: z.boolean().optional(),
  idempotencyKey: z.string().max(80).optional(),
})

export const POST = withAuth(
  async (req, { session }) => {
    const body = await parseBody(req, createSchema)
    if (body.discount && !hasGrant(session, 'order.discount')) {
      return fail('Kamu tidak punya izin memberi diskon', 403)
    }
    const settings = await getSettings()
    const order = await createOrder({ ...body, source: 'POS' }, session)
    return ok({
      order,
      printKot: settings.receipts.autoPrintKot && order.status === 'PAID',
      printReceipt: settings.receipts.autoPrintReceipt && order.paymentStatus === 'CONFIRMED',
    })
  },
  { grants: ['order.create'] }
)
