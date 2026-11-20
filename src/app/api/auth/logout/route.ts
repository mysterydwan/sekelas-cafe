import { NextResponse } from 'next/server'
import { clearSessionCookie, getSession } from '@/lib/auth'
import { audit } from '@/lib/audit'

export async function POST() {
  const session = await getSession()
  if (session) await audit(session, 'auth.logout', 'User', { entityId: session.id, label: session.username })
  await clearSessionCookie()
  return NextResponse.json({ data: { ok: true } })
}
