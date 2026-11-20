// GET /api/public/board — today's counter display data (SPEC §3.3).
// Today's businessDate (Asia/Jakarta), non-training orders only:
//   preparing       = PAID | PREPARING (created today, oldest first)
//   ready           = READY | OUT_FOR_DELIVERY (readyAt asc)
//   recentCompleted = COMPLETED within the last 15 minutes
// tableLabel is included additively so the board can render "MEJA X" badges.
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { todayJakarta } from '@/lib/format'
import type { BoardDTO } from '@/components/public/types'
import type { OrderType } from '@/lib/types'

export async function GET() {
  try {
    const today = todayJakarta()
    const since15Min = new Date(Date.now() - 15 * 60 * 1000)

    const [preparing, ready, recentCompleted] = await Promise.all([
      db.order.findMany({
        where: { businessDate: today, isTraining: false, status: { in: ['PAID', 'PREPARING'] } },
        orderBy: { createdAt: 'asc' },
        select: { code: true, type: true, tableLabel: true, createdAt: true },
      }),
      db.order.findMany({
        where: { businessDate: today, isTraining: false, status: { in: ['READY', 'OUT_FOR_DELIVERY'] } },
        orderBy: { readyAt: 'asc' },
        select: { code: true, type: true, tableLabel: true, readyAt: true, createdAt: true },
      }),
      db.order.findMany({
        where: {
          businessDate: today,
          isTraining: false,
          status: 'COMPLETED',
          completedAt: { gte: since15Min },
        },
        orderBy: { completedAt: 'desc' },
        select: { code: true, completedAt: true, createdAt: true },
      }),
    ])

    const board: BoardDTO = {
      preparing: preparing.map((o) => ({
        code: o.code,
        type: o.type as OrderType,
        tableLabel: o.tableLabel,
        createdAt: o.createdAt.toISOString(),
      })),
      ready: ready.map((o) => ({
        code: o.code,
        type: o.type as OrderType,
        tableLabel: o.tableLabel,
        readyAt: (o.readyAt ?? o.createdAt).toISOString(),
      })),
      recentCompleted: recentCompleted.map((o) => ({
        code: o.code,
        completedAt: (o.completedAt ?? o.createdAt).toISOString(),
      })),
    }

    return ok(board)
  } catch {
    return fail('Gagal memuat papan pesanan — coba lagi sebentar', 500)
  }
}
