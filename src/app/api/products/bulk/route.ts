// POST /api/products/bulk — { ids, action: AVAILABILITY|CATEGORY, value }
// AVAILABILITY → availability.toggle; CATEGORY → product.manage.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, withAuth, parseBody } from '@/lib/api'
import { audit } from '@/lib/audit'
import { hasGrant } from '@/lib/grants'
import { emitRealtime } from '@/lib/realtime'

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Pilih minimal satu produk'),
  action: z.enum(['AVAILABILITY', 'CATEGORY']),
  value: z.union([z.boolean(), z.string().min(1)]),
})

export const POST = withAuth(async (req, { session }) => {
  const body = await parseBody(req, schema)
  const products = await db.product.findMany({ where: { id: { in: body.ids } } })
  if (products.length === 0) return fail('Produk tidak ditemukan', 404)

  if (body.action === 'AVAILABILITY') {
    if (!hasGrant(session, 'availability.toggle')) {
      return fail('Kamu tidak punya izin untuk mengubah ketersediaan produk', 403)
    }
    const isAvailable = body.value === true
    await db.product.updateMany({ where: { id: { in: body.ids } }, data: { isAvailable } })
    for (const p of products) {
      if (p.isAvailable !== isAvailable) {
        await emitRealtime('menu:availability', { productId: p.id, isAvailable })
      }
    }
    await audit(session, 'product.availability', 'Product', {
      label: `${products.length} produk — ${isAvailable ? 'tersedia' : 'habis'}`,
      after: { ids: products.map((p) => p.id), isAvailable },
    })
    return ok({ updated: products.length, isAvailable })
  }

  if (!hasGrant(session, 'product.manage')) {
    return fail('Kamu tidak punya izin untuk memindahkan kategori produk', 403)
  }
  const categoryId = String(body.value)
  const category = await db.category.findUnique({ where: { id: categoryId } })
  if (!category) return fail('Kategori tidak ditemukan', 404)
  await db.product.updateMany({ where: { id: { in: body.ids } }, data: { categoryId } })
  await audit(session, 'product.update', 'Product', {
    label: `${products.length} produk dipindah ke ${category.name}`,
    after: { ids: products.map((p) => p.id), categoryId, category: category.name },
  })
  return ok({ updated: products.length, categoryId })
})
