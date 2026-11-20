// GET /api/users — staff list w/ UserDTO shape — user.manage.
// POST /api/users — create staff account — user.manage.
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, fail, withAuth, parseBody } from '@/lib/api'
import { audit } from '@/lib/audit'
import { hashPassword } from '@/lib/auth'
import type { UserDTO } from '@/lib/types'

function toUserDTO(u: {
  id: string
  name: string
  username: string
  role: string
  grants: unknown
  isActive: boolean
  isTraining: boolean
  pin: string | null
  lastLoginAt: Date | null
}): UserDTO {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role as UserDTO['role'],
    grants: Array.isArray(u.grants) ? (u.grants as string[]) : null,
    isActive: u.isActive,
    isTraining: u.isTraining,
    hasPin: !!u.pin,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  }
}

export const GET = withAuth(async () => {
  const users = await db.user.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] })
  return ok({ users: users.map(toUserDTO) })
}, { grants: ['user.manage'] })

const createSchema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi'),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username minimal 3 karakter')
    .regex(/^[a-z0-9._-]+$/, 'Username hanya boleh huruf kecil, angka, titik, garis bawah, strip'),
  password: z.string().min(4, 'Password minimal 4 karakter'),
  role: z.enum(['ADMIN', 'CASHIER', 'BARISTA']),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN harus 4–6 digit').optional().nullable(),
  grants: z.array(z.string()).optional().nullable(),
  isTraining: z.boolean().default(false),
})

export const POST = withAuth(
  async (req, { session }) => {
    const body = await parseBody(req, createSchema)
    const dupe = await db.user.findUnique({ where: { username: body.username } })
    if (dupe) return fail(`Username "${body.username}" sudah dipakai`, 409)
    const created = await db.user.create({
      data: {
        name: body.name,
        username: body.username,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        pin: body.pin ?? null,
        grants: (body.grants ?? null) as never,
        isTraining: body.isTraining,
      },
    })
    await audit(session, 'user.create', 'User', {
      entityId: created.id,
      label: created.name,
      after: { username: created.username, role: created.role, isTraining: created.isTraining, hasPin: !!created.pin },
    })
    return ok(toUserDTO(created))
  },
  { grants: ['user.manage'] }
)
