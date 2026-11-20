// Server-side auth: bcrypt hashes + JWT session cookie (jose) + login rate limiting.
import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { db } from './db'
import { effectiveGrants } from './grants'
import type { SessionUser } from './types'

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'sekelas-cafe-dev-secret-change-in-production'
)
export const SESSION_COOKIE = 'sekelas_session'
const SESSION_HOURS = 12

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10)
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash)
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    username: user.username,
    name: user.name,
    role: user.role,
    grants: user.grants,
    isTraining: user.isTraining,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(SECRET)
}

export async function setSessionCookie(token: string) {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 3600,
  })
}

export async function clearSessionCookie() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}

/** Read + verify session from cookie. Does NOT hit DB. */
export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, SECRET)
    if (!payload.sub) return null
    return {
      id: payload.sub,
      username: String(payload.username ?? ''),
      name: String(payload.name ?? ''),
      role: payload.role as SessionUser['role'],
      grants: Array.isArray(payload.grants) ? (payload.grants as string[]) : [],
      isTraining: Boolean(payload.isTraining),
    }
  } catch {
    return null
  }
}

/** Session + DB freshness check (isActive). Use for sensitive mutations. */
export async function getFreshSession(): Promise<SessionUser | null> {
  const s = await getSession()
  if (!s) return null
  const user = await db.user.findUnique({ where: { id: s.id } })
  if (!user || !user.isActive) return null
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role as SessionUser['role'],
    grants: effectiveGrants(user),
    isTraining: user.isTraining,
  }
}

// ---------- Login rate limit: 5 fails -> 30s cooldown ----------
const attempts = new Map<string, { fails: number; lockedUntil: number }>()

export function checkRateLimit(key: string): { ok: boolean; retryAfterSec: number } {
  const a = attempts.get(key)
  if (a && a.lockedUntil > Date.now()) {
    return { ok: false, retryAfterSec: Math.ceil((a.lockedUntil - Date.now()) / 1000) }
  }
  return { ok: true, retryAfterSec: 0 }
}

export function recordFailedLogin(key: string) {
  const a = attempts.get(key) ?? { fails: 0, lockedUntil: 0 }
  a.fails += 1
  if (a.fails >= 5) {
    a.lockedUntil = Date.now() + 30_000
    a.fails = 0
  }
  attempts.set(key, a)
}

export function clearFailures(key: string) {
  attempts.delete(key)
}

/** Attempt login by username+password OR pin. Returns session user or null. */
export async function authenticate(
  identifier: string,
  secret: string,
  mode: 'PASSWORD' | 'PIN'
): Promise<SessionUser | null> {
  const user = await db.user.findFirst({
    where: { username: identifier.toLowerCase().trim(), isActive: true },
  })
  if (!user) return null
  if (mode === 'PIN') {
    if (!user.pin || user.pin !== secret.trim()) return null
  } else {
    const ok = await verifyPassword(secret, user.passwordHash)
    if (!ok) return null
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role as SessionUser['role'],
    grants: effectiveGrants(user),
    isTraining: user.isTraining,
  }
}
