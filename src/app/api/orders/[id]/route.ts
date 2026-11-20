import { ok, fail, withAuth } from '@/lib/api'
import { getOrderDTO } from '@/lib/orders'

export const GET = withAuth<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params
  const order = await getOrderDTO(id)
  if (!order) return fail('Pesanan tidak ditemukan', 404)
  return ok(order)
})
