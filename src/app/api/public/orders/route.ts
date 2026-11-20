// POST /api/public/orders — customer self-ordering (SPEC §3.1 checkout).
// Public: no auth. Server gates: open-hours STRICT + selfOrderEnabled.
// Payment rules: null => bayar di kasir (PENDING_PAYMENT); QRIS =>
// PENDING_VERIFICATION (customer claims paid, cashier verifies the mutation).
// CASH/SPLIT from the public side are NEVER accepted.
import { z, ZodError } from 'zod'
import { ok, fail } from '@/lib/api'
import { createOrder } from '@/lib/orders'
import { getSettings, isCafeOpenNow } from '@/lib/settings'
import { dayName } from '@/lib/format'
import type { CreateOrderInput } from '@/lib/types'

const schema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().int().min(1).max(99),
        optionIds: z.array(z.string()).default([]),
        note: z.string().max(200).optional(),
      })
    )
    .min(1, 'Keranjang masih kosong'),
  type: z.enum(['DINE_IN', 'TAKE_AWAY', 'DELIVERY']),
  tableLabel: z.string().max(20).optional(),
  customerName: z.string().max(60).optional(),
  customerPhone: z.string().max(20).optional(),
  deliveryLocation: z.string().max(120).optional(),
  note: z.string().max(300).optional(),
  payment: z
    .object({
      method: z.enum(['CASH', 'QRIS', 'SPLIT']),
      qrReference: z.string().max(60).optional(),
    })
    .nullable()
    .optional(),
  idempotencyKey: z.string().min(8).max(64).optional(),
})

/** "Senin–Jumat 07.00–14.00" style summary for the closed message. */
function hoursSummary(hours: { days: { open: string; close: string; closed: boolean }[] }): string {
  const groups: { from: number; to: number; open: string; close: string }[] = []
  hours.days.forEach((d, i) => {
    if (d.closed) return
    const last = groups[groups.length - 1]
    if (last && last.to === i - 1 && last.open === d.open && last.close === d.close) {
      last.to = i
    } else {
      groups.push({ from: i, to: i, open: d.open, close: d.close })
    }
  })
  if (groups.length === 0) return 'sesuai jadwal'
  return groups
    .map(
      (g) =>
        `${dayName(g.from)}${g.to > g.from ? '–' + dayName(g.to) : ''} ${g.open.replace(':', '.')}–${g.close.replace(':', '.')}`
    )
    .join('; ')
}

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json())

    const settings = await getSettings()
    if (!settings.ordering.selfOrderEnabled) {
      return fail('Pesan mandiri sedang dinonaktifkan — silakan pesan langsung di kasir', 403)
    }

    const open = await isCafeOpenNow()
    if (!open.open && open.enforcement === 'STRICT') {
      return fail(
        `Kafe sedang tutup — pesanan dibuka ${hoursSummary(settings.hours)}`,
        403
      )
    }

    // Payment rules for the public side
    let payment: CreateOrderInput['payment'] = null
    if (body.payment) {
      if (body.payment.method !== 'QRIS') {
        return fail('Pembayaran tunai/campuran hanya bisa di kasir ya', 400)
      }
      payment = { method: 'QRIS', qrReference: body.payment.qrReference }
    }

    const input: CreateOrderInput = {
      items: body.items.map((i) => ({
        productId: i.productId,
        qty: i.qty,
        optionIds: i.optionIds,
        note: i.note,
      })),
      type: body.type,
      tableLabel: body.tableLabel,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      deliveryLocation: body.deliveryLocation,
      note: body.note,
      payment,
      source: 'PUBLIC',
      idempotencyKey: body.idempotencyKey,
    }

    const order = await createOrder(input, null)
    return ok(order)
  } catch (e) {
    if (e instanceof ZodError) {
      return fail(e.issues[0]?.message || 'Data pesanan tidak valid', 422)
    }
    return fail(e instanceof Error && e.message ? e.message : 'Gagal membuat pesanan', 400)
  }
}
