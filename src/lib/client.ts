// Client-side fetch helper. All API calls go through this.
// Handles the session-expiry contract (SPEC §3.17): 401 on a staff page →
// toast "Sesi berakhir" + redirect to /login preserving the attempted URL.
import type { SessionUser } from './types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const STAFF_PREFIXES = [
  '/dashboard',
  '/pos',
  '/kitchen',
  '/orders',
  '/products',
  '/stock',
  '/reports',
  '/data',
  '/users',
  '/settings',
  '/activity',
]

let redirecting = false

function handleSessionExpiry() {
  if (typeof window === 'undefined' || redirecting) return
  const path = window.location.pathname
  const onStaffPage = STAFF_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))
  if (!onStaffPage) return
  redirecting = true
  const next = encodeURIComponent(path + window.location.search)
  // soft notice first (toast shows on pages that survive; login page shows its own notice)
  try {
    window.sessionStorage.setItem('sekelas-session-expired', '1')
  } catch {
    /* private mode */
  }
  window.location.href = `/login?next=${next}`
}

export async function apiFetch<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* no body */
  }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) handleSessionExpiry()
    const msg =
      (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : null) || `Terjadi kesalahan (${res.status})`
    throw new ApiError(msg, res.status)
  }
  return (body as { data: T }).data
}

export async function login(username: string, password: string): Promise<SessionUser> {
  return apiFetch<SessionUser>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' })
}

export async function fetchMe(): Promise<SessionUser | null> {
  try {
    return await apiFetch<SessionUser>('/api/auth/me')
  } catch {
    return null
  }
}
