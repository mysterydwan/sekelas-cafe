// GET /api/public/orders/[code] — order tracking by daily code (SKC-###).
// Public: no auth (codes are random-ish daily sequences; no PII beyond what
// the customer themselves entered). 404 => { error: 'Pesanan tidak ditemukan' }.
import { NextRequest, NextResponse } from 'next/server'
import { ok, fail } from '@/lib/api'
import { getOrderDTO } from '@/lib/orders'

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ code: string }> }
): Promise<NextResponse> {
  try {
    const { code } = await ctx.params
    const order = await getOrderDTO(decodeURIComponent(code))
    if (!order) return fail('Pesanan tidak ditemukan', 404)
    return ok(order)
  } catch {
    return fail('Gagal memuat pesanan — coba lagi sebentar', 500)
  }
}
