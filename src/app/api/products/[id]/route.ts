// PATCH /api/products/[id] — two modes:
//  (a) availability-only { isAvailable } → availability.toggle (all staff roles)
//  (b) full edit (POST shape, replaces variant groups) → product.manage
// DELETE /api/products/[id] — soft-delete → product.manage.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, withAuth } from '@/lib/api'
import { audit } from '@/lib/audit'
import { emitRealtime } from '@/lib/realtime'
import { hasGrant } from '@/lib/grants'

type Ctx = { params: Promise<{ id: string }> }

const availabilitySchema = z.object({
  isAvailable: z.boolean(),
})

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

const fullEditSchema = z.object({
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

export const PATCH = withAuth<Ctx>(async (req, { params, session }) => {
  const { id } = await params
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return fail('Data tidak valid', 422)
  }
  const keys = Object.keys((raw ?? {}) as Record<string, unknown>)
  const availabilityOnly = keys.length > 0 && keys.every((k) => k === 'isAvailable')

  const existing = await db.product.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true } } },
  })
  if (!existing) return fail('Produk tidak ditemukan', 404)

  if (availabilityOnly) {
    if (!hasGrant(session, 'availability.toggle')) {
      return fail('Kamu tidak punya izin untuk mengubah ketersediaan produk', 403)
    }
    const body = availabilitySchema.parse(raw)
    await db.product.update({ where: { id }, data: { isAvailable: body.isAvailable } })
    await audit(session, 'product.availability', 'Product', {
      entityId: id,
      label: existing.name,
      before: { isAvailable: existing.isAvailable },
      after: { isAvailable: body.isAvailable },
    })
    await emitRealtime('menu:availability', { productId: id, isAvailable: body.isAvailable })
    return ok({ id, isAvailable: body.isAvailable })
  }

  if (!hasGrant(session, 'product.manage')) {
    return fail('Kamu tidak punya izin untuk mengubah produk', 403)
  }
  const body = fullEditSchema.parse(raw)
  const category = await db.category.findUnique({ where: { id: body.categoryId } })
  if (!category) return fail('Kategori tidak ditemukan', 404)

  // Full edit: replace variant groups transactionally.
  // Order items keep name/variant snapshots, so a delete + recreate is safe (SPEC §3.10).
  const updated = await db.$transaction(async (tx) => {
    await tx.variantOption.deleteMany({ where: { group: { productId: id } } })
    await tx.variantGroup.deleteMany({ where: { productId: id } })
    return tx.product.update({
      where: { id },
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
      include: {
        category: { select: { id: true, name: true } },
        variantGroups: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
        _count: { select: { orderItems: true } },
      },
    })
  })

  await audit(session, 'product.update', 'Product', {
    entityId: id,
    label: updated.name,
    before: {
      name: existing.name,
      basePrice: existing.basePrice,
      unitCost: existing.unitCost,
      categoryId: existing.categoryId,
      isActive: existing.isActive,
      isAvailable: existing.isAvailable,
      sortOrder: existing.sortOrder,
    },
    after: {
      name: updated.name,
      basePrice: updated.basePrice,
      unitCost: updated.unitCost,
      categoryId: updated.categoryId,
      isActive: updated.isActive,
      isAvailable: updated.isAvailable,
      sortOrder: updated.sortOrder,
      groups: body.variantGroups.length,
    },
  })
  if (existing.isAvailable !== updated.isAvailable) {
    await emitRealtime('menu:availability', { productId: id, isAvailable: updated.isAvailable })
  }
  return ok({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    imageUrl: updated.imageUrl,
    basePrice: updated.basePrice,
    unitCost: updated.unitCost,
    isActive: updated.isActive,
    isAvailable: updated.isAvailable,
    sortOrder: updated.sortOrder,
    category: updated.category,
    orderCount: updated._count.orderItems,
    variantGroups: updated.variantGroups.map((g) => ({
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
  })
})

export const DELETE = withAuth<Ctx>(
  async (req, { params, session }) => {
    const { id } = await params
    const existing = await db.product.findUnique({ where: { id }, include: { _count: { select: { orderItems: true } } } })
    if (!existing) return fail('Produk tidak ditemukan', 404)
    if (!existing.isActive) return fail('Produk sudah tidak aktif', 409)
    // Soft-delete always — order history keeps its references (SPEC §3.10).
    await db.product.update({ where: { id }, data: { isActive: false } })
    await audit(session, 'product.deactivate', 'Product', {
      entityId: id,
      label: existing.name,
      before: { isActive: true },
      after: { isActive: false },
    })
    return ok({ id, isActive: false })
  },
  { grants: ['product.manage'] }
)
