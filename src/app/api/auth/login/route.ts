import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  authenticate,
  checkRateLimit,
  clearFailures,
  createSessionToken,
  recordFailedLogin,
  setSessionCookie,
} from '@/lib/auth'
import { fail } from '@/lib/api'
import { audit } from '@/lib/audit'
import { getSettings } from '@/lib/settings'

const schema = z.object({
  username: z.string().min(1, 'Isi username dulu'),
  password: z.string().min(1, 'Isi password dulu'),
  mode: z.enum(['PASSWORD', 'PIN']).default('PASSWORD'),
})

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json())
    const settings = await getSettings()

    // practice mode: only allow entering practice with any staff account
    const key = body.username.toLowerCase().trim()
    const rl = checkRateLimit(key)
    if (!rl.ok) {
      return fail(`Terlalu banyak percobaan — coba lagi dalam ${rl.retryAfterSec} detik`, 429)
    }

    const user = await authenticate(body.username, body.password, body.mode)
    if (!user) {
      recordFailedLogin(key)
      return fail(body.mode === 'PIN' ? 'Username atau PIN salah' : 'Username atau password salah', 401)
    }
    clearFailures(key)

    const token = await createSessionToken(user)
    await setSessionCookie(token)
    await audit(user, 'auth.login', 'User', { entityId: user.id, label: user.username, after: { mode: body.mode } })

    const isPracticeAccount = settings.system.practiceMode
    return NextResponse.json({ data: { ...user, isTraining: isPracticeAccount ? user.isTraining : false } })
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? 'Data tidak valid', 422)
    console.error('[login]', e)
    return fail('Terjadi kesalahan saat masuk', 500)
  }
}
