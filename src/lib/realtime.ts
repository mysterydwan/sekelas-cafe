// Server-side realtime emitter. Forwards events to the socket.io mini-service
// on port 3030 (browsers connect via gateway: io('/?XTransformPort=3030')).
import 'server-only'

const REALTIME_URL = 'http://127.0.0.1:3031'
const SECRET = process.env.REALTIME_SECRET || 'sekelas-realtime-internal'

/**
 * Fire-and-forget emit. Never throws — realtime is best-effort;
 * clients also poll as fallback (SPEC: offline tolerance).
 */
export async function emitRealtime(event: string, payload: unknown) {
  try {
    await fetch(`${REALTIME_URL}/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-realtime-secret': SECRET },
      body: JSON.stringify({ event, payload }),
      signal: AbortSignal.timeout(2500),
    })
  } catch {
    // mini-service down or busy — polling fallback keeps UI correct
  }
}
