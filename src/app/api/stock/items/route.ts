// GET /api/stock/items?search&lowOnly&unit → { items, totalValue } (any staff).
// POST /api/stock/items — create w/ opening qty — stock.manage.
import { z } from 'zod'
import { ok, withAuth, parseBody } from '@/lib/api'
import { listStockItems, upsertStockItem } from '@/lib/stock'

export const GET = withAuth(async (req) => {
  const url = new URL(req.url)
  const result = await listStockItems({
    search: url.searchParams.get('search')?.trim() || undefined,
    lowOnly: url.searchParams.get('lowOnly') === '1',
    unit: url.searchParams.get('unit') || undefined,
  })
  return ok(result)
})

const createSchema = z.object({
  sku: z.string().trim().min(1, 'SKU wajib diisi'),
  name: z.string().trim().min(1, 'Nama bahan wajib diisi'),
  unit: z.string().trim().min(1, 'Satuan wajib dipilih'),
  qty: z.number().min(0, 'Jumlah awal tidak boleh negatif').default(0),
  lowThreshold: z.number().min(0, 'Batas rendah tidak boleh negatif').default(0),
  unitCost: z.number().min(0, 'Harga satuan tidak boleh negatif').default(0),
})

export const POST = withAuth(
  async (req, { session }) => {
    const body = await parseBody(req, createSchema)
    const item = await upsertStockItem(
      { sku: body.sku, name: body.name, unit: body.unit, qty: body.qty, lowThreshold: body.lowThreshold, unitCost: body.unitCost },
      session
    )
    return ok(item)
  },
  { grants: ['stock.manage'] }
)
