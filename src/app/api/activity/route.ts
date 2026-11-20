// GET /api/activity — filterable audit log with actors/entities facets.
import { ok, fail, withAuth } from '@/lib/api'
import { db } from '@/lib/db'
import type { NextRequest } from 'next/server'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const GET = withAuth(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams
  const userId = sp.get('userId')?.trim() || undefined
  const action = sp.get('action')?.trim() || undefined
  const entity = sp.get('entity')?.trim() || undefined
  const from = sp.get('from')?.trim() || undefined
  const to = sp.get('to')?.trim() || undefined

  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
    return fail('Format tanggal tidak valid (YYYY-MM-DD)', 422)
  }

  const page = Math.max(1, Math.floor(Number(sp.get('page')) || 1))
  const pageSize = Math.min(100, Math.max(10, Math.floor(Number(sp.get('pageSize')) || 100)))

  const where: Record<string, unknown> = {}
  if (userId) where.userId = userId
  if (action) where.action = { contains: action }
  if (entity) where.entity = entity
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from + 'T00:00:00+07:00') } : {}),
      ...(to ? { lte: new Date(to + 'T23:59:59+07:00') } : {}),
    }
  }

  const [rows, total, recent] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { name: true, role: true } } },
    }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { user: { select: { id: true, name: true, role: true } } },
    }),
  ])

  const actorsMap = new Map<string, { id: string; name: string; role: string }>()
  const entities = new Set<string>()
  for (const r of recent) {
    entities.add(r.entity)
    if (r.user) actorsMap.set(r.user.id, { id: r.user.id, name: r.user.name, role: r.user.role })
  }

  return ok({
    rows: rows.map((r) => ({
      id: r.id,
      user: r.user?.name ?? null,
      role: r.user?.role ?? null,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      label: r.label,
      before: r.before ?? null,
      after: r.after ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    actors: [...actorsMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    entities: [...entities].sort(),
  })
}, { grants: ['activity.view'] })
