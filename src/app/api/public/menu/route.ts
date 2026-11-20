// GET /api/public/menu — active categories (sortOrder) with active products
// (sold-out included with isAvailable:false) + variant groups/options.
// Public: no auth. Envelope: { data: MenuDTO } / { error }.
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import type { MenuDTO } from '@/lib/types'

export async function GET() {
  try {
    const categories = await db.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            variantGroups: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: {
                options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
    })

    const menu: MenuDTO = {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        products: c.products.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl,
          basePrice: p.basePrice,
          isAvailable: p.isAvailable,
          variantGroups: p.variantGroups.map((g) => ({
            id: g.id,
            name: g.name,
            selectionType: g.selectionType === 'MULTI' ? 'MULTI' : 'SINGLE',
            isRequired: g.isRequired,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            isActive: g.isActive,
            options: g.options.map((o) => ({
              id: o.id,
              label: o.label,
              priceDelta: o.priceDelta,
              isDefault: o.isDefault,
            })),
          })),
        })),
      })),
    }

    return ok(menu)
  } catch {
    return fail('Gagal memuat menu — coba lagi sebentar', 500)
  }
}
