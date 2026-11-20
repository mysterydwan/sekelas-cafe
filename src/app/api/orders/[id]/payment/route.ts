import { z } from 'zod'
import { ok, parseBody, withAuth } from '@/lib/api'
import { takePayment } from '@/lib/payments'

const schema = z.object({
  method: z.enum(['CASH', 'QRIS', 'SPLIT']),
  cashReceived: z.number().int().nonnegative().optional(),
  cashPortion: z.number().int().nonnegative().optional(),
  qrReference: z.string().max(60).optional(),
})

export const POST = withAuth<{ params: Promise<{ id: string }> }>(
  async (req, ctx) => {
    const { id } = await ctx.params
    const body = await parseBody(req, schema)
    const order = await takePayment(id, body, ctx.session)
    return ok(order)
  },
  { grants: ['payment.confirm'] }
)
