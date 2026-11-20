// GET /api/reports/summary?from&to — range summary (ReportSummaryDTO).
// Cashier without report.viewAll is clamped to today (server-side).
import { ok, fail, withAuth } from '@/lib/api'
import { hasGrant } from '@/lib/grants'
import { getReportSummary } from '@/lib/reports'
import { todayJakarta } from '@/lib/format'
import type { NextRequest } from 'next/server'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const GET = withAuth(async (req: NextRequest, { session }) => {
  if (!hasGrant(session, 'data.report') && !hasGrant(session, 'report.viewAll')) {
    return fail('Kamu tidak punya izin untuk melihat laporan', 403)
  }
  const sp = req.nextUrl.searchParams
  let from = sp.get('from') ?? ''
  let to = sp.get('to') ?? ''
  if (!hasGrant(session, 'report.viewAll')) {
    from = todayJakarta()
    to = from
  }
  if (!from) from = todayJakarta()
  if (!to) to = from
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return fail('Format tanggal tidak valid (YYYY-MM-DD)', 422)
  }
  if (from > to) {
    const t = from
    from = to
    to = t
  }
  const data = await getReportSummary(from, to)
  return ok(data)
})
