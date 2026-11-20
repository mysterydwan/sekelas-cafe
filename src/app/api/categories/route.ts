// GET /api/categories — all categories w/ active product count (any staff).
// POST /api/categories — create — product.manage.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, withAuth, parseBody } from '@/lib/api'
import { audit } from '@/lib/audit'

async function listCategories() {
  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { products: { where: { isActive: true }, select: { id: true } } },
  })
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    productCount: c.products.length,
  }))
}

export const GET = withAuth(async () => {
  return ok({ categories: await listCategories() })
})

const createSchema = z.object({
  name: z.string().trim().min(1, 'Nama kategori wajib diisi'),
  sortOrder: z.number().int().default(0),
})

export const POST = withAuth(
  async (req, { session }) => {
    const body = await parseBody(req, createSchema)
    const dupe = await db.category.findFirst({ where: { name: body.name } })
    if (dupe) return fail(`Kategori "${body.name}" sudah ada`, 409)
    const created = await db.category.create({
      data: { name: body.name, sortOrder: body.sortOrder },
    })
    await audit(session, 'category.create', 'Category', {
      entityId: created.id,
      label: created.name,
      after: { name: created.name, sortOrder: created.sortOrder },
    })
    return ok({
      id: created.id,
      name: created.name,
      sortOrder: created.sortOrder,
      isActive: created.isActive,
      productCount: 0,
    })
  },
  { grants: ['product.manage'] }
)
