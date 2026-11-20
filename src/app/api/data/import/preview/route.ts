// POST /api/data/import/preview — parse + validate an upload (FormData: file, type).
import { ok, fail, withAuth } from '@/lib/api'
import { parseImportFile, IMPORT_TYPES } from '@/lib/excel'
import type { ImportType } from '@/lib/excel'

const MAX_BYTES = 5 * 1024 * 1024

export const POST = withAuth(async (req) => {
  const form = await req.formData().catch(() => null)
  if (!form) return fail('Berkas tidak valid — kirim ulang form', 422)
  const type = String(form.get('type') ?? '') as ImportType
  if (!IMPORT_TYPES.includes(type)) return fail('Jenis impor tidak dikenal', 422)

  const file = form.get('file')
  if (!(file instanceof File)) return fail('Pilih berkas .xlsx atau .csv terlebih dulu', 422)
  const name = file.name.toLowerCase()
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
    return fail('Format berkas harus .xlsx atau .csv', 422)
  }
  if (file.size === 0) return fail('Berkas kosong', 422)
  if (file.size > MAX_BYTES) return fail('Ukuran berkas melebihi 5 MB', 422)

  const buffer = Buffer.from(await file.arrayBuffer())
  const preview = await parseImportFile(buffer, type)
  return ok(preview)
}, { grants: ['data.import'] })
