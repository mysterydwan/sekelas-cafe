import { z } from 'zod'
import { ok, withAuth } from '@/lib/api'
import { getCashStatus, recordCashMovement } from '@/lib/payments'
import { purgeExpiredHeld } from '@/lib/orders'
import { hasGrant } from '@/lib/grants'

// Authenticated staff only (cash drawer state is financial data).
// Expected-cash visibility follows report.viewAll (SPEC §1.7);
// the Z-wizard surfaces it via /api/reports/x|z instead (data.report).
export const GET = withAuth(async (req, { session }) => {
  await purgeExpiredHeld()
  const status = await getCashStatus()
  if (!hasGrant(session, 'report.viewAll')) {
    return ok({ ...status, expectedCash: null })
  }
  return ok(status)
})

const schema = z.object({
  type: z.enum(['OPENING_FLOAT', 'CASH_IN', 'CASH_OUT']),
  amount: z.number().int().positive('Jumlah harus lebih dari 0'),
  reason: z.string().optional(),
})

export const POST = withAuth(async (req, { session }) => {
  const body = schema.parse(await req.json())
  const status = await recordCashMovement(body.type, body.amount, body.reason, session)
  return ok(status)
}, { grants: ['order.create'] })
