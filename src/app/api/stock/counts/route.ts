// GET /api/stock/counts — today's draft opname (null when none) — any staff (read).
// POST /api/stock/counts — save/resume today's draft — stock.manage.
// Body accepts an optional scope: `preset: 'quick'` (server picks the 10
// fastest-moving items of the last 7 days) or an explicit `itemIds` list;
// without either, the draft covers all active items (SPEC §3.11).
import { z } from 'zod'
import { ok, withAuth, parseBody } from '@/lib/api'
import { getCount, quickPickItemIds, saveCount } from '@/lib/stock'
import { todayJakarta } from '@/lib/format'

export const GET = withAuth(async () => {
  const count = await getCount(todayJakarta())
  return ok(count) // null when no draft today
})

const schema = z.object({
  lines: z
    .array(
      z.object({
        stockItemId: z.string().min(1),
        countedQty: z.number().nullable(),
      })
    )
    .default([]),
  preset: z.enum(['all', 'quick']).optional(),
  itemIds: z.array(z.string().min(1)).optional(),
})

export const POST = withAuth(
  async (req, { session }) => {
    const body = await parseBody(req, schema)
    let itemIds = body.itemIds
    if (!itemIds && body.preset === 'quick') itemIds = await quickPickItemIds()
    const count = await saveCount(
      body.lines,
      session,
      itemIds && itemIds.length > 0 ? { itemIds } : undefined
    )
    return ok(count)
  },
  { grants: ['stock.manage'] }
)
