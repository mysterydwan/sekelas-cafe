// POST /api/data/import/commit — transactional apply of a confirmed preview.
import { z } from 'zod'
import { ok, withAuth, parseBody } from '@/lib/api'
import { applyImport } from '@/lib/excel'

const schema = z.object({
  type: z.enum(['PRODUCTS', 'STOCK', 'RECIPES', 'USERS']),
  rows: z
    .array(
      z.object({
        row: z.number().int(),
        data: z.record(z.string(), z.string()),
        status: z.enum(['NEW', 'UPDATE', 'ERROR']),
        message: z.string().optional(),
        current: z.record(z.string(), z.string()).optional(),
      })
    )
    .max(2000, 'Maksimal 2.000 baris'),
  fileName: z.string().max(200).optional(),
})

export const POST = withAuth(async (req, { session }) => {
  const body = await parseBody(req, schema)
  const result = await applyImport(body.type, body.rows, session, body.fileName)
  return ok(result)
}, { grants: ['data.import'] })
