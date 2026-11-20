import { z } from 'zod'
import { ok, withAuth } from '@/lib/api'
import { getSettings, patchSettings, type SettingsSection } from '@/lib/settings'
import { audit } from '@/lib/audit'
import { emitRealtime } from '@/lib/realtime'

const schema = z.object({
  section: z.enum(['profile', 'hours', 'ordering', 'payments', 'receipts', 'stock', 'system']),
  patch: z.record(z.string(), z.unknown()),
})

// Full settings are staff-only (public subset lives at /api/public/settings).
// All staff roles read: POS needs receipts/payments, KDS needs system thresholds,
// login needs practice-mode state. Mutations stay settings.manage-gated below.
export const GET = withAuth(async () => {
  const settings = await getSettings()
  return ok(settings)
})

export const PATCH = withAuth(async (req, { session }) => {
  const body = schema.parse(await req.json())
  const before = await getSettings()
  const after = await patchSettings(body.section as SettingsSection, body.patch)
  await audit(session, 'settings.update', 'Setting', {
    entityId: body.section,
    before: before[body.section as SettingsSection],
    after: after[body.section as SettingsSection],
  })
  // settings changes relevant to other screens broadcast (SPEC §3.15)
  if (body.section === 'ordering' || body.section === 'hours') {
    await emitRealtime('day:closed', { businessDate: 'refresh' })
  }
  return ok(after)
}, { grants: ['settings.manage'] })
