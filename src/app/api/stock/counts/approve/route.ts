// POST /api/stock/counts/approve — approve today's draft opname, write COUNT_VARIANCE — count.approve.
import { ok, withAuth } from '@/lib/api'
import { approveCount } from '@/lib/stock'

export const POST = withAuth(
  async (_req, { session }) => {
    const count = await approveCount(session)
    return ok(count)
  },
  { grants: ['count.approve'] }
)
