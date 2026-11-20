// GET /api/stock/recipes?productId → recipe lines w/ stock item info — recipe.manage.
// PUT /api/stock/recipes — replace recipe lines for a product — recipe.manage.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, withAuth, parseBody } from '@/lib/api'
import { getRecipes, saveRecipes } from '@/lib/stock'

export const GET = withAuth(
  async (req) => {
    const url = new URL(req.url)
    const productId = url.searchParams.get('productId') ?? ''
    const rows = await getRecipes(productId)
    const product = await db.product.findUnique({ where: { id: productId }, select: { name: true } })
    return ok({
      productId,
      productName: product?.name ?? null,
      lines: rows.map((r) => ({
        stockItemId: r.stockItemId,
        qtyPerUnit: r.qtyPerUnit,
        sku: r.stockItem.sku,
        name: r.stockItem.name,
        unit: r.stockItem.unit,
      })),
    })
  },
  { grants: ['recipe.manage'] }
)

const putSchema = z.object({
  productId: z.string().min(1, 'Pilih produk dulu'),
  lines: z
    .array(
      z.object({
        stockItemId: z.string().min(1, 'Pilih bahan'),
        qtyPerUnit: z.number().positive('Jumlah per porsi harus lebih dari 0'),
      })
    )
    .default([]),
})

export const PUT = withAuth(
  async (req, { session }) => {
    const body = await parseBody(req, putSchema)
    const product = await db.product.findUnique({ where: { id: body.productId } })
    if (!product) return fail('Produk tidak ditemukan', 404)
    await saveRecipes(body.productId, body.lines, session)
    return ok({ productId: body.productId, lines: body.lines.length })
  },
  { grants: ['recipe.manage'] }
)
