// POST /api/reports/autoclose — auto-close forgotten past business days.
import { ok, withAuth } from '@/lib/api'
import { ensureClosedDates } from '@/lib/reports'

export const POST = withAuth(async () => {
  const closed = await ensureClosedDates()
  return ok({ closed })
}, { grants: ['data.report'] })
