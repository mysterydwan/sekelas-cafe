// POST /api/reports/z — close a business day (Z-report, immutable).
import { z } from 'zod'
import { ok, fail, withAuth, parseBody } from '@/lib/api'
import { closeDay } from '@/lib/reports'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const schema = z.object({
  businessDate: z.string().regex(DATE_RE, 'Format tanggal tidak valid (YYYY-MM-DD)').optional(),
  countedCash: z.number().int().min(0, 'Nominal hitung kas tidak valid'),
  merchantQrisTotal: z.number().int().nullable().optional(),
  override: z.boolean().optional(),
})

export const POST = withAuth(async (req, { session }) => {
  const body = await parseBody(req, schema)
  if (body.override && session.role !== 'ADMIN') {
    return fail('Tutup paksa hanya untuk Admin', 403)
  }
  const row = await closeDay(body, session)
  return ok(row)
}, { grants: ['data.report'] })
