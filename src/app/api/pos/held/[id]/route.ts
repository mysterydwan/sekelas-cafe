import { ok, withAuth } from '@/lib/api'
import { deleteHeld } from '@/lib/orders'

export const DELETE = withAuth<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params
  await deleteHeld(id, ctx.session)
  return ok({ ok: true })
}, { grants: ['order.create'] })
