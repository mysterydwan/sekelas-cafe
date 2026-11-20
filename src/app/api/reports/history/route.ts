// GET /api/reports/history — last 30 closed Z reports (DailyReportRow[]).
import { ok, fail, withAuth } from '@/lib/api'
import { hasGrant } from '@/lib/grants'
import { listDailyReports } from '@/lib/reports'

export const GET = withAuth(async (_req, { session }) => {
  if (!hasGrant(session, 'data.report') && !hasGrant(session, 'report.viewAll')) {
    return fail('Kamu tidak punya izin untuk melihat riwayat laporan', 403)
  }
  const rows = await listDailyReports(30)
  return ok(rows)
})
