// Cancel a whole order. Grant-gated + reason required; keeps full history.
import { z } from 'zod'
import { ok, parseBody, withAuth } from '@/lib/api'
import { cancelOrder } from '@/lib/orders'

const schema = z.object({
  reason: z.string().min(1, 'Alasan pembatalan wajib diisi').max(300),
})

export const POST = withAuth<{ params: Promise<{ id: string }> }>(
  async (req, ctx) => {
    const { id } = await ctx.params
    const body = await parseBody(req, schema)
    const order = await cancelOrder(id, body.reason, ctx.session)
    return ok(order)
  },
  { grants: ['order.cancel'] }
)
