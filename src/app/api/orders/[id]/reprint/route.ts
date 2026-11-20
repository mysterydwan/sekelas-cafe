// Reprint audit log — every print action logged (order, template, actor, time).
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, parseBody, withAuth } from '@/lib/api'
import { audit } from '@/lib/audit'

const schema = z.object({
  template: z.enum(['KOT', 'RECEIPT']),
})

export const POST = withAuth<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params
  const body = await parseBody(req, schema)
  const order = await db.order.findUnique({ where: { id }, select: { code: true } })
  if (!order) return fail('Pesanan tidak ditemukan', 404)
  await audit(ctx.session, 'print.reprint', 'Order', {
    entityId: id,
    label: order.code,
    after: { template: body.template },
  })
  return ok({ ok: true })
})
