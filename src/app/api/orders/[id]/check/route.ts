// Kitchen per-unit check-off (THE GATE). Barista/Admin only — cashier is view-only.
import { z } from 'zod'
import { ok, parseBody, withAuth } from '@/lib/api'
import { checkItem } from '@/lib/orders'

const schema = z.object({
  itemId: z.string().min(1),
  delta: z.union([z.literal(1), z.literal(-1)]),
})

export const POST = withAuth<{ params: Promise<{ id: string }> }>(
  async (req, ctx) => {
    const { id } = await ctx.params
    const body = await parseBody(req, schema)
    const order = await checkItem(id, body.itemId, body.delta, ctx.session)
    return ok(order)
  },
  { roles: ['ADMIN', 'BARISTA'] }
)
