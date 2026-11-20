// PATCH /api/stock/items/[id] — edit meta only (qty changes go through movements!) — stock.manage.
// DELETE /api/stock/items/[id] — deactivate — stock.delete.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, withAuth, parseBody } from '@/lib/api'
import { upsertStockItem, deactivateStockItem } from '@/lib/stock'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  sku: z.string().trim().min(1, 'SKU wajib diisi').optional(),
  name: z.string().trim().min(1, 'Nama bahan wajib diisi').optional(),
  unit: z.string().trim().min(1, 'Satuan wajib dipilih').optional(),
  lowThreshold: z.number().min(0, 'Batas rendah tidak boleh negatif').optional(),
  unitCost: z.number().min(0, 'Harga satuan tidak boleh negatif').optional(),
})

export const PATCH = withAuth<Ctx>(
  async (req, { params, session }) => {
    const { id } = await params
    const body = await parseBody(req, patchSchema)
    const current = await db.stockItem.findUnique({ where: { id } })
    if (!current) return fail('Item stok tidak ditemukan', 404)
    // Qty is intentionally NOT editable here — every qty change must be a movement.
    const item = await upsertStockItem(
      {
        id,
        sku: body.sku ?? current.sku,
        name: body.name ?? current.name,
        unit: body.unit ?? current.unit,
        lowThreshold: body.lowThreshold ?? current.lowThreshold,
        unitCost: body.unitCost ?? current.unitCost,
      },
      session
    )
    return ok(item)
  },
  { grants: ['stock.manage'] }
)

export const DELETE = withAuth<Ctx>(
  async (req, { params, session }) => {
    const { id } = await params
    await deactivateStockItem(id, session)
    return ok({ id, isActive: false })
  },
  { grants: ['stock.delete'] }
)
