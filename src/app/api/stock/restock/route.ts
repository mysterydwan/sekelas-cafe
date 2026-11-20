// POST /api/stock/restock — record a purchase (multi-line RESTOCK_IN + weighted unit cost) — stock.manage.
// Optional `date` (YYYY-MM-DD, max 30 days back, never future) backdates the
// movements to the actual purchase date (SPEC §3.11 restock tab).
import { z } from 'zod'
import { ok, withAuth, parseBody, fail } from '@/lib/api'
import { recordRestock } from '@/lib/stock'
import { addDaysJakarta, todayJakarta } from '@/lib/format'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const schema = z.object({
  supplier: z.string().trim().min(1, 'Nama pemasok wajib diisi'),
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1, 'Pilih bahan'),
        qty: z.number().positive('Jumlah harus lebih dari 0'),
        unitCost: z.number().min(0, 'Harga satuan tidak boleh negatif'),
      })
    )
    .min(1, 'Tambahkan minimal satu baris'),
  date: z.string().trim().optional(),
})

/** Combine the picked date with the current Asia/Jakarta time-of-day. */
function movementDateFor(dateStr: string): Date {
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(new Date())
  return new Date(`${dateStr}T${time}+07:00`)
}

export const POST = withAuth(
  async (req, { session }) => {
    const body = await parseBody(req, schema)
    let date: Date | undefined
    if (body.date) {
      if (!DATE_RE.test(body.date)) return fail('Format tanggal tidak valid (YYYY-MM-DD)', 422)
      const today = todayJakarta()
      if (body.date > today) return fail('Tanggal pembelian tidak boleh di masa depan', 422)
      if (body.date < addDaysJakarta(today, -30)) {
        return fail('Tanggal pembelian maksimal 30 hari ke belakang', 422)
      }
      date = movementDateFor(body.date)
    }
    await recordRestock({ ...body, date }, session)
    return ok({
      supplier: body.supplier,
      lines: body.lines.length,
      total: body.lines.reduce((s, l) => s + l.qty * l.unitCost, 0),
    })
  },
  { grants: ['stock.manage'] }
)
