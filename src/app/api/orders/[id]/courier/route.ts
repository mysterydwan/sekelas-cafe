import { z } from 'zod'
import { ok, parseBody, withAuth } from '@/lib/api'
import { assignCourier } from '@/lib/orders'

const schema = z.object({
  name: z.string().min(1, 'Nama kurir wajib diisi').max(40),
})

export const POST = withAuth<{ params: Promise<{ id: string }> }>(
  async (req, ctx) => {
    const { id } = await ctx.params
    const body = await parseBody(req, schema)
    const order = await assignCourier(id, body.name.trim(), ctx.session)
    return ok(order)
  },
  // courier assignment is part of the delivery serve flow — Cashiers included
  // (SPEC §1.7 Cashier: "View + take payment + mark served")
  { roles: ['ADMIN', 'BARISTA', 'CASHIER'] }
)
