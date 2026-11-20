// Acknowledge a modified ticket (kitchen blink-until-acknowledge).
import { ok, withAuth } from '@/lib/api'
import { ackOrder } from '@/lib/orders'

export const POST = withAuth<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params
  const order = await ackOrder(id)
  return ok(order)
}, { roles: ['ADMIN', 'BARISTA'] })
