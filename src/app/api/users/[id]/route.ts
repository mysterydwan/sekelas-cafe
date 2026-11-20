// PATCH /api/users/[id] — edit staff account — user.manage.
// Guards: cannot deactivate/demote the last active ADMIN; cannot deactivate self.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, withAuth, parseBody } from '@/lib/api'
import { audit } from '@/lib/audit'
import { hashPassword } from '@/lib/auth'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  username: z.string().optional(),
  name: z.string().trim().min(1, 'Nama wajib diisi').optional(),
  role: z.enum(['ADMIN', 'CASHIER', 'BARISTA']).optional(),
  password: z.string().min(4, 'Password minimal 4 karakter').optional(),
  pin: z
    .union([z.string().regex(/^\d{4,6}$/, 'PIN harus 4–6 digit'), z.null()])
    .optional(),
  isActive: z.boolean().optional(),
  isTraining: z.boolean().optional(),
  grants: z.union([z.array(z.string()), z.null()]).optional(),
})

export const PATCH = withAuth<Ctx>(
  async (req, { params, session }) => {
    const { id } = await params
    const body = await parseBody(req, patchSchema)
    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) return fail('Pengguna tidak ditemukan', 404)

    if (body.isActive === false && id === session.id) {
      return fail('Tidak bisa menonaktifkan akun yang sedang dipakai', 409)
    }

    const demoting = existing.role === 'ADMIN' && body.role !== undefined && body.role !== 'ADMIN'
    const deactivating = existing.role === 'ADMIN' && existing.isActive && body.isActive === false
    if (demoting || deactivating) {
      const otherActiveAdmins = await db.user.count({
        where: { role: 'ADMIN', isActive: true, id: { not: id } },
      })
      if (otherActiveAdmins === 0) {
        return fail(
          demoting
            ? 'Admin aktif terakhir tidak bisa diturunkan perannya — jadikan admin lain dulu'
            : 'Admin aktif terakhir tidak bisa dinonaktifkan — jadikan admin lain dulu',
          409
        )
      }
    }

    if (body.username !== undefined) {
      // username is immutable by design — snapshots keep attribution
      return fail('Username tidak bisa diubah setelah akun dibuat', 400)
    }

    const updated = await db.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.password !== undefined ? { passwordHash: await hashPassword(body.password) } : {}),
        ...(body.pin !== undefined ? { pin: body.pin } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.isTraining !== undefined ? { isTraining: body.isTraining } : {}),
        ...(body.grants !== undefined ? { grants: body.grants as never } : {}),
      },
    })

    await audit(session, 'user.update', 'User', {
      entityId: id,
      label: updated.name,
      before: {
        name: existing.name,
        role: existing.role,
        isActive: existing.isActive,
        isTraining: existing.isTraining,
        grants: existing.grants,
        hasPin: !!existing.pin,
      },
      after: {
        name: updated.name,
        role: updated.role,
        isActive: updated.isActive,
        isTraining: updated.isTraining,
        grants: updated.grants,
        hasPin: !!updated.pin,
        passwordChanged: body.password !== undefined,
      },
    })
    return ok({
      id: updated.id,
      name: updated.name,
      username: updated.username,
      role: updated.role as 'ADMIN' | 'CASHIER' | 'BARISTA',
      grants: Array.isArray(updated.grants) ? (updated.grants as string[]) : null,
      isActive: updated.isActive,
      isTraining: updated.isTraining,
      hasPin: !!updated.pin,
      lastLoginAt: updated.lastLoginAt ? updated.lastLoginAt.toISOString() : null,
    })
  },
  { grants: ['user.manage'] }
)
