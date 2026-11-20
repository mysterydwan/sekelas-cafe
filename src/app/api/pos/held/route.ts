// Held (parked) orders: list, full recall by id, park current cart.
import { z } from 'zod'
import { ok, parseBody, withAuth } from '@/lib/api'
import { holdOrder, listHeld, getHeld, purgeExpiredHeld } from '@/lib/orders'
import type { DraftLine } from '@/lib/types'

function serializeHeld(h: {
  id: string
  label: string
  itemsSnapshot: unknown
  metaSnapshot: unknown
  createdAt: Date
}) {
  const items = (Array.isArray(h.itemsSnapshot) ? h.itemsSnapshot : []) as DraftLine[]
  return {
    id: h.id,
    label: h.label,
    items,
    meta: (h.metaSnapshot && typeof h.metaSnapshot === 'object' ? h.metaSnapshot : {}) as Record<string, unknown>,
    itemCount: items.reduce((s, l) => s + (l.qty ?? 0), 0),
    createdAt: h.createdAt.toISOString(),
  }
}

export const GET = withAuth(async (req) => {
  await purgeExpiredHeld()
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const held = await getHeld(id)
    if (!held) return ok(null)
    return ok(serializeHeld(held))
  }
  const rows = await listHeld()
  return ok(rows)
})

const lineSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().optional(),
  qty: z.number().int().min(1).max(99),
  optionIds: z.array(z.string()).default([]),
  note: z.string().max(200).optional(),
})

const schema = z.object({
  label: z.string().min(1, 'Label pesanan wajib diisi').max(40),
  items: z.array(lineSchema).min(1, 'Tidak ada item untuk ditahan'),
  meta: z.record(z.string(), z.unknown()).optional(),
})

export const POST = withAuth(
  async (req, { session }) => {
    const body = await parseBody(req, schema)
    const held = await holdOrder(body.label.trim(), body.items, body.meta ?? {}, session)
    return ok(serializeHeld(held))
  },
  { grants: ['order.create'] }
)
