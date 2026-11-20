// API route helpers: uniform response envelope + auth guards + zod parsing.
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { ZodError, type ZodType } from 'zod'
import { getFreshSession } from './auth'
import { hasGrant } from './grants'
import type { SessionUser } from './types'

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init)
}

export function fail(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

interface AuthOptions {
  roles?: string[]
  grants?: string[]
}

type Handler<C> = (
  req: NextRequest,
  ctx: C & { session: SessionUser }
) => Promise<NextResponse> | NextResponse

/**
 * Wrap an API handler with session auth. Optionally require roles/grants.
 * The handler receives `session` injected into ctx.
 */
export function withAuth<C = { params: Promise<Record<string, string>> }>(
  handler: Handler<C>,
  opts: AuthOptions = {}
) {
  return async (req: NextRequest, ctx: C): Promise<NextResponse> => {
    try {
      const session = await getFreshSession()
      if (!session) return fail('Sesi berakhir — masuk kembali', 401)
      if (opts.roles && !opts.roles.includes(session.role)) {
        return fail('Halaman ini khusus ' + opts.roles.join('/'), 403)
      }
      if (opts.grants) {
        const missing = opts.grants.filter((g) => !hasGrant(session, g))
        if (missing.length > 0) return fail('Kamu tidak punya izin untuk aksi ini', 403)
      }
      return await handler(req, { ...(ctx as object), session } as C & { session: SessionUser })
    } catch (e) {
      console.error('[api]', e)
      if (e instanceof ZodError) {
        return fail(e.issues[0]?.message || 'Data tidak valid', 422)
      }
      const msg = e instanceof Error && e.message ? e.message : 'Terjadi kesalahan pada server'
      return fail(msg, 500)
    }
  }
}

/** Parse + validate JSON body with zod; throws ZodError handled by withAuth. */
export async function parseBody<S extends ZodType>(req: NextRequest, schema: S): Promise<ReturnType<S['parse']>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ZodError([])
  }
  return schema.parse(raw) as ReturnType<S['parse']>
}
