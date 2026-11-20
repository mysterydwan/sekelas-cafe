// GET /api/public/settings — public subset of settings (profile/hours/ordering/
// QRIS bits) via the canonical settings lib. Public: no auth.
import { ok, fail } from '@/lib/api'
import { getSettings, toPublicSettings } from '@/lib/settings'

export async function GET() {
  try {
    const settings = await getSettings()
    return ok(toPublicSettings(settings))
  } catch {
    return fail('Gagal memuat pengaturan — coba lagi sebentar', 500)
  }
}
