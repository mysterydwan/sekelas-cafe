// GET /api/stock/movements?itemId&type&userId&from&to&page → { rows, total, page, pageSize } (any staff).
// POST /api/stock/movements — record RESTOCK_IN/WASTE/MANUAL_OUT/ADJUSTMENT — stock.manage.
import { z } from 'zod'
import { ok, withAuth, parseBody } from '@/lib/api'
import { listMovements, recordMovement } from '@/lib/stock'

export const GET = withAuth(async (req) => {
  const url = new URL(req.url)
  const page = parseInt(url.searchParams.get('page') ?? '1', 10)
  const result = await listMovements({
    itemId: url.searchParams.get('itemId') || undefined,
    type: url.searchParams.get('type') || undefined,
    userId: url.searchParams.get('userId') || undefined,
    from: url.searchParams.get('from') || undefined,
    to: url.searchParams.get('to') || undefined,
    page: Number.isFinite(page) ? page : 1,
    pageSize: url.searchParams.get('pageSize') ? parseInt(url.searchParams.get('pageSize')!, 10) : undefined,
  })
  return ok(result)
})

const createSchema = z.object({
  itemId: z.string().min(1, 'Pilih bahan dulu'),
  type: z.enum(['RESTOCK_IN', 'WASTE', 'MANUAL_OUT', 'ADJUSTMENT']),
  qty: z.number().positive('Jumlah harus lebih dari 0'),
  reason: z.string().trim().optional(),
  note: z.string().trim().optional(),
})

export const POST = withAuth(
  async (req, { session }) => {
    const body = await parseBody(req, createSchema)
    const result = await recordMovement(body, session)
    return ok(result)
  },
  { grants: ['stock.manage'] }
)
