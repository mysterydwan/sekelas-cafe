// GET /api/data/templates?type=PRODUCTS|STOCK|RECIPES|USERS — download import template.
import { ok, fail, withAuth } from '@/lib/api'
import { buildTemplate, IMPORT_TYPES, xlsxResponse } from '@/lib/excel'
import { todayJakarta } from '@/lib/format'
import type { ImportType } from '@/lib/excel'
import type { NextRequest } from 'next/server'

export const GET = withAuth(async (req: NextRequest) => {
  const type = (req.nextUrl.searchParams.get('type') ?? '') as ImportType
  if (!IMPORT_TYPES.includes(type)) {
    return fail('Jenis template tidak dikenal', 422)
  }
  const buf = await buildTemplate(type)
  return xlsxResponse(buf, `sekelas-template-${type.toLowerCase()}-${todayJakarta()}.xlsx`)
}, { grants: ['data.import'] })
