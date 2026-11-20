// GET /api/reports/warnings?businessDate — Z wizard step 1: blockers + cash context.
import { ok, fail, withAuth } from '@/lib/api'
import { db } from '@/lib/db'
import { getCashStatus } from '@/lib/payments'
import { getDayWarnings } from '@/lib/reports'
import { todayJakarta } from '@/lib/format'
import type { NextRequest } from 'next/server'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const GET = withAuth(async (req: NextRequest) => {
  const businessDate = req.nextUrl.searchParams.get('businessDate') || todayJakarta()
  if (!DATE_RE.test(businessDate)) {
    return fail('Format tanggal tidak valid (YYYY-MM-DD)', 422)
  }
  const [warnings, closed, cash] = await Promise.all([
    getDayWarnings(businessDate),
    db.dailyReport.findFirst({ where: { businessDate, kind: 'Z' }, select: { id: true } }),
    getCashStatus(businessDate),
  ])
  return ok({ ...warnings, closed: !!closed, cash })
}, { grants: ['data.report'] })
