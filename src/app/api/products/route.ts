// GET /api/products — menu catalog w/ variant groups + categories (any staff).
// POST /api/products — create product (+variant groups) — product.manage.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, withAuth, parseBody } from '@/lib/api'
import { audit } from '@/lib/audit'

function serializeProduct(p: {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  basePrice: number
  unitCost: number | null
  isActive: boolean
  isAvailable: boolean
  sortOrder: number
  category: { id: string; name: string }
  _count: { orderItems: number }
  variantGroups: {
    id: string
    name: string
    selectionType: string
    isRequired: boolean
    minSelect: number
    maxSelect: number
    sortOrder: number
    options: { id: string; label: string; priceDelta: number; isDefault: boolean; sortOrder: number }[]
  }[]
}) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    basePrice: p.basePrice,
    unitCost: p.unitCost,
    isActive: p.isActive,
    isAvailable: p.isAvailable,
    sortOrder: p.sortOrder,
    category: p.category,
    orderCount: p._count.orderItems,
    variantGroups: p.variantGroups.map((g) => ({
      id: g.id,
      name: g.name,
      selectionType: g.selectionType as 'SINGLE' | 'MULTI',
      isRequired: g.isRequired,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      sortOrder: g.sortOrder,
      options: g.options.map((o) => ({
        id: o.id,
        label: o.label,
        priceDelta: o.priceDelta,
        isDefault: o.isDefault,
        sortOrder: o.sortOrder,
      })),
    })),
  }
}

const productInclude = {
  category: { select: { id: true, name: true } },
  variantGroups: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' as const },
    include: { options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' as const } } },
  },
  _count: { select: { orderItems: true } },
}

export const GET = withAuth(async (req) => {
  const url = new URL(req.url)
  const search = url.searchParams.get('search')?.trim() ?? ''
  const categoryId = url.searchParams.get('categoryId') ?? ''
  const includeInactive = url.searchParams.get('includeInactive') === '1'
  const where: Record<string, unknown> = {}
  if (!includeInactive) where.isActive = true
  if (search) where.name = { contains: search }
  if (categoryId) where.categoryId = categoryId
  const [products, categories] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: productInclude,
    }),
    db.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { products: { where: { isActive: true }, select: { id: true } } },
    }),
  ])
  return ok({
    products: products.map(serializeProduct),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      productCount: c.products.length,
    })),
  })
})

// ---------- POST ----------

const optionSchema = z.object({
  label: z.string().trim().min(1, 'Label opsi wajib diisi'),
  priceDelta: z.number().int('Selisih harga harus angka bulat'),
  isDefault: z.boolean(),
  sortOrder: z.number().int().default(0),
})

const groupSchema = z.object({
  name: z.string().trim().min(1, 'Nama grup variasi wajib diisi'),
  selectionType: z.enum(['SINGLE', 'MULTI']),
  isRequired: z.boolean(),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  sortOrder: z.number().int().default(0),
  options: z.array(optionSchema).default([]),
})

export const productCreateSchema = z.object({
  name: z.string().trim().min(1, 'Nama produk wajib diisi'),
  categoryId: z.string().min(1, 'Kategori wajib dipilih'),
  description: z.string().trim().optional().nullable(),
  imageUrl: z.string().trim().optional().nullable(),
  basePrice: z.number().int().min(0, 'Harga dasar tidak boleh negatif'),
  unitCost: z.number().int().min(0, 'HPP tidak boleh negatif').optional().nullable(),
  isActive: z.boolean(),
  isAvailable: z.boolean(),
  sortOrder: z.number().int().default(0),
  variantGroups: z.array(groupSchema).optional().default([]),
})

export const POST = withAuth(
  async (req, { session }) => {
    const body = await parseBody(req, productCreateSchema)
    const category = await db.category.findUnique({ where: { id: body.categoryId } })
    if (!category) return fail('Kategori tidak ditemukan', 404)

    const product = await db.product.create({
      data: {
        name: body.name,
        categoryId: body.categoryId,
        description: body.description || null,
        imageUrl: body.imageUrl || null,
        basePrice: body.basePrice,
        unitCost: body.unitCost ?? null,
        isActive: body.isActive,
        isAvailable: body.isAvailable,
        sortOrder: body.sortOrder,
        variantGroups: {
          create: body.variantGroups.map((g, gi) => ({
            name: g.name,
            selectionType: g.selectionType,
            isRequired: g.isRequired,
            minSelect: g.selectionType === 'SINGLE' ? Math.min(g.minSelect, 1) : g.minSelect,
            maxSelect: g.selectionType === 'SINGLE' ? 1 : g.maxSelect,
            sortOrder: g.sortOrder || gi,
            options: {
              create: g.options.map((o, oi) => ({
                label: o.label,
                priceDelta: o.priceDelta,
                isDefault: o.isDefault,
                sortOrder: o.sortOrder || oi,
              })),
            },
          })),
        },
      },
      include: productInclude,
    })
    await audit(session, 'product.create', 'Product', {
      entityId: product.id,
      label: product.name,
      after: {
        name: product.name,
        basePrice: product.basePrice,
        category: category.name,
        groups: body.variantGroups.length,
      },
    })
    return ok(serializeProduct(product))
  },
  { grants: ['product.manage'] }
)
