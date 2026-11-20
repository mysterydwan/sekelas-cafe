// PATCH /api/categories/[id] — rename / reorder / activate — product.manage.
// DELETE /api/categories/[id] — guarded: 409 while active products exist — product.manage.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, withAuth, parseBody } from '@/lib/api'
import { audit } from '@/lib/audit'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  name: z.string().trim().min(1, 'Nama kategori wajib diisi').optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

export const PATCH = withAuth<Ctx>(
  async (req, { params, session }) => {
    const { id } = await params
    const body = await parseBody(req, patchSchema)
    const existing = await db.category.findUnique({ where: { id } })
    if (!existing) return fail('Kategori tidak ditemukan', 404)
    if (body.name && body.name !== existing.name) {
      const dupe = await db.category.findFirst({ where: { name: body.name, id: { not: id } } })
      if (dupe) return fail(`Kategori "${body.name}" sudah ada`, 409)
    }
    const updated = await db.category.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    })
    await audit(session, 'category.update', 'Category', {
      entityId: id,
      label: updated.name,
      before: { name: existing.name, sortOrder: existing.sortOrder, isActive: existing.isActive },
      after: { name: updated.name, sortOrder: updated.sortOrder, isActive: updated.isActive },
    })
    return ok({ id: updated.id, name: updated.name, sortOrder: updated.sortOrder, isActive: updated.isActive })
  },
  { grants: ['product.manage'] }
)

export const DELETE = withAuth<Ctx>(
  async (req, { params, session }) => {
    const { id } = await params
    const existing = await db.category.findUnique({
      where: { id },
      include: { products: { select: { id: true, isActive: true } } },
    })
    if (!existing) return fail('Kategori tidak ditemukan', 404)
    const activeCount = existing.products.filter((p) => p.isActive).length
    if (activeCount > 0) {
      return fail(`Kategori masih punya ${activeCount} produk aktif`, 409)
    }
    if (existing.products.length > 0) {
      // Inactive products still reference this category — soft-delete keeps FK intact.
      await db.category.update({ where: { id }, data: { isActive: false } })
      await audit(session, 'category.deactivate', 'Category', {
        entityId: id,
        label: existing.name,
        after: { isActive: false, note: 'masih dipakai produk nonaktif' },
      })
      return ok({ id, isActive: false, soft: true })
    }
    await db.category.delete({ where: { id } })
    await audit(session, 'category.delete', 'Category', { entityId: id, label: existing.name })
    return ok({ id, deleted: true })
  },
  { grants: ['product.manage'] }
)
