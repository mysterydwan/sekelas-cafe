// Business-day logic: Asia/Jakarta dates, daily order-code sequence, in-memory idempotency.
import 'server-only'
import { db } from './db'
import { todayJakarta } from './format'

export function businessDateOf(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(d)
}

export function currentBusinessDate(): string {
  return todayJakarta()
}

/**
 * Reserve the next order code for a business date (atomic upsert-increment).
 * Codes are never reused, even for cancelled orders.
 */
export async function nextOrderCode(prefix = 'SKC'): Promise<{ code: string; number: number }> {
  const businessDate = currentBusinessDate()
  const seq = await db.$transaction(async (tx) => {
    const existing = await tx.dailySequence.findUnique({ where: { businessDate } })
    if (existing) {
      return tx.dailySequence.update({
        where: { businessDate },
        data: { lastNumber: { increment: 1 } },
      })
    }
    return tx.dailySequence.create({ data: { businessDate, lastNumber: 1 } })
  })
  const number = seq.lastNumber
  return { code: `${prefix}-${String(number).padStart(3, '0')}`, number }
}

// ---------- Idempotency keys for public order creation ----------
const seen = new Map<string, string>() // key -> orderId, 10-min TTL
const TTL = 10 * 60 * 1000

export function checkIdempotency(key: string | undefined): string | null {
  if (!key) return null
  const hit = seen.get(key)
  if (hit) return hit
  return null
}

export function rememberIdempotency(key: string | undefined, orderId: string) {
  if (!key) return
  seen.set(key, orderId)
  if (seen.size > 500) {
    const cutoff = Date.now() - TTL
    for (const k of seen.keys()) {
      // approximate cleanup: clear the whole map when oversized
      seen.delete(k)
      if (seen.size < 250) break
    }
    void cutoff
  }
}
