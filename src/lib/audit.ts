// Audit trail — append-only, every mutation writes here with actor + before/after.
import 'server-only'
import { db } from './db'
import type { SessionUser } from './types'

export async function audit(
  actor: SessionUser | null,
  action: string,
  entity: string,
  opts: { entityId?: string; label?: string; before?: unknown; after?: unknown } = {}
) {
  try {
    await db.auditLog.create({
      data: {
        userId: actor?.id ?? null,
        action,
        entity,
        entityId: opts.entityId ?? null,
        label: opts.label ?? null,
        before: (opts.before ?? undefined) as never,
        after: (opts.after ?? undefined) as never,
      },
    })
  } catch (e) {
    console.error('[audit] failed to write', e)
  }
}
