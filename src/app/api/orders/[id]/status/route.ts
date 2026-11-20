// Status machine transitions. Gates (e.g. "Sisa X cup belum dicentang") are
// enforced server-side — errors surface to the caller.
// Serve/deliver transitions (OUT_FOR_DELIVERY, COMPLETED) are open to Cashiers
// too (SPEC §1.7: /orders Cashier = "View + take payment + mark served");
// kitchen transitions (PREPARING/READY) stay Admin+Barista.
import { z } from 'zod'
import { ok, fail, parseBody, withAuth } from '@/lib/api'
import { assignCourier, transitionOrder } from '@/lib/orders'

const schema = z.object({
  status: z.enum(['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED']),
  reason: z.string().max(500).optional(),
  courierName: z.string().max(40).optional(),
})

const SERVE_TARGETS = new Set(['OUT_FOR_DELIVERY', 'COMPLETED'])

export const POST = withAuth<{ params: Promise<{ id: string }> }>(
  async (req, ctx) => {
    const { id } = await ctx.params
    const body = await parseBody(req, schema)
    const isServe = SERVE_TARGETS.has(body.status)
    const allowedRoles = isServe ? ['ADMIN', 'BARISTA', 'CASHIER'] : ['ADMIN', 'BARISTA']
    if (!allowedRoles.includes(ctx.session.role)) {
      return fail('Aksi ini khusus ' + allowedRoles.join('/'), 403)
    }
    if (body.courierName?.trim()) {
      await assignCourier(id, body.courierName.trim(), ctx.session)
    }
    const order = await transitionOrder(id, body.status, ctx.session, body.reason)
    return ok(order)
  },
  { roles: ['ADMIN', 'BARISTA', 'CASHIER'] }
)
