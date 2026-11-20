// GET /api/reports/x?businessDate — X-report snapshot (non-destructive preview).
import { ok, fail, withAuth } from '@/lib/api'
import { hasGrant } from '@/lib/grants'
import { computeDayReport } from '@/lib/reports'
import { todayJakarta } from '@/lib/format'
import type { NextRequest } from 'next/server'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const GET = withAuth(async (req: NextRequest, { session }) => {
  if (!hasGrant(session, 'data.report') && !hasGrant(session, 'report.viewAll')) {
    return fail('Kamu tidak punya izin untuk melihat laporan', 403)
  }
  const businessDate = req.nextUrl.searchParams.get('businessDate') || todayJakarta()
  if (!DATE_RE.test(businessDate)) {
    return fail('Format tanggal tidak valid (YYYY-MM-DD)', 422)
  }
  const snapshot = await computeDayReport(businessDate)
  return ok(snapshot)
})
