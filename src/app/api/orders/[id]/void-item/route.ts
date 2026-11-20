// Void a single order line (post-payment). Grant-gated + reason required.
import { z } from 'zod'
import { ok, parseBody, withAuth } from '@/lib/api'
import { voidItem } from '@/lib/orders'

const schema = z.object({
  itemId: z.string().min(1),
  reason: z.string().min(1, 'Alasan pembatalan item wajib diisi').max(200),
})

export const POST = withAuth<{ params: Promise<{ id: string }> }>(
  async (req, ctx) => {
    const { id } = await ctx.params
    const body = await parseBody(req, schema)
    const order = await voidItem(id, body.itemId, body.reason, ctx.session)
    return ok(order)
  },
  { grants: ['order.voidItem'] }
)
