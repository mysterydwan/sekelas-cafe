// Small pure helpers for the public experience (client-safe).
import type { ProductDTO } from '@/lib/types'

/** Order codes look like SKC-012 (padStart(3) — 4 digits after #999 still valid). */
export const ORDER_CODE_RE = /^SKC-\d{3,}$/

export function normalizeOrderCode(input: string): string {
  return input.toUpperCase().replace(/\s+/g, '')
}

/** wa.me link from a local phone number ("0851 5182 3036" -> https://wa.me/6285151823036). */
export function waLink(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return 'https://wa.me/'
  if (digits.startsWith('62')) return `https://wa.me/${digits}`
  if (digits.startsWith('0')) return `https://wa.me/62${digits.slice(1)}`
  return `https://wa.me/${digits}`
}

/** "mulai Rp X" when any variant option shifts the price. */
export function hasPricedVariants(p: ProductDTO): boolean {
  return p.variantGroups.some((g) => g.options.some((o) => o.priceDelta !== 0))
}

/** Client-side uuid (idempotency keys, cart line ids). */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'k-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
}

export function scrollToId(id: string): void {
  if (typeof document === 'undefined') return
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
