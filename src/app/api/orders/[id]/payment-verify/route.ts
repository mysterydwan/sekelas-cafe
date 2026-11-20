import { z } from 'zod'
import { ok, fail, parseBody, withAuth } from '@/lib/api'
import { rejectQrisPayment, verifyQrisPayment } from '@/lib/payments'

const schema = z.object({
  action: z.enum(['CONFIRM', 'REJECT']),
  note: z.string().max(200).optional(),
})

export const POST = withAuth<{ params: Promise<{ id: string }> }>(
  async (req, ctx) => {
    const { id } = await ctx.params
    const body = await parseBody(req, schema)
    if (body.action === 'CONFIRM') {
      const order = await verifyQrisPayment(id, ctx.session)
      return ok(order)
    }
    if (!body.note?.trim()) return fail('Catatan penolakan wajib diisi', 422)
    const order = await rejectQrisPayment(id, body.note.trim(), ctx.session)
    return ok(order)
  },
  { grants: ['payment.confirm'] }
)
