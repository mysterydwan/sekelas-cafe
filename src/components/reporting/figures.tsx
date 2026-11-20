'use client'

// Figure rows + full day-snapshot sheet (shared by X dialog, Z wizard, history view).
import { formatIDR, formatNumber } from '@/lib/format'
import { Money } from '@/components/staff/money'
import { cn } from '@/lib/utils'
import type { DayReportSnapshot } from '@/lib/types'

export function FigureRow({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string
  value: React.ReactNode
  strong?: boolean
  tone?: 'success' | 'warning' | 'destructive'
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 border-b border-dashed py-1.5',
        strong && 'border-solid border-border'
      )}
    >
      <span className={cn('text-sm', strong ? 'font-medium' : 'text-muted-foreground')}>{label}</span>
      <span
        className={cn(
          'font-mono text-sm tabular-nums',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          tone === 'destructive' && 'text-destructive'
        )}
      >
        {value}
      </span>
    </div>
  )
}

function varianceTone(v: number): 'success' | 'warning' | 'destructive' {
  if (v === 0) return 'success'
  if (Math.abs(v) <= 2000) return 'warning'
  return 'destructive'
}

const TYPE_LABELS: Record<string, string> = {
  DINE_IN: 'Makan di Tempat',
  TAKE_AWAY: 'Bungkus',
  DELIVERY: 'Antar',
}

/** Full figures sheet from a day snapshot (X / Z). */
export function SnapshotFigures({ snap }: { snap: DayReportSnapshot }) {
  const productRevenue = snap.topProducts.reduce((s, p) => s + p.revenue, 0)
  return (
    <div className="space-y-5">
      <section aria-label="Penjualan">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Penjualan</p>
        <FigureRow label="Pendapatan kotor" value={formatIDR(snap.gross)} />
        <FigureRow label="Diskon" value={`− ${formatIDR(snap.discounts)}`} />
        <FigureRow label="Pembatalan (void)" value={`− ${formatIDR(snap.voids)}`} />
        <FigureRow label="Ongkir antar" value={`+ ${formatIDR(snap.deliveryFees)}`} />
        <FigureRow label="Pajak" value={`+ ${formatIDR(snap.taxTotal)}`} />
        <FigureRow label="Pendapatan bersih" value={formatIDR(snap.net)} strong />
      </section>

      <section aria-label="Transaksi">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transaksi</p>
        <FigureRow label="Jumlah pesanan" value={formatNumber(snap.orderCount)} />
        <FigureRow label="Item terjual" value={formatNumber(snap.itemCount)} />
      </section>

      <section aria-label="Pembayaran">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pembayaran</p>
        <FigureRow label="Tunai" value={formatIDR(snap.cashTotal)} />
        <FigureRow label="QRIS" value={formatIDR(snap.qrisTotal)} />
      </section>

      <section aria-label="Kas">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kas</p>
        <FigureRow label="Modal awal" value={formatIDR(snap.openingFloat)} />
        <FigureRow label="Uang masuk" value={`+ ${formatIDR(snap.cashIn)}`} />
        <FigureRow label="Uang keluar" value={`− ${formatIDR(snap.cashOut)}`} />
        <FigureRow label="Kas diharapkan" value={formatIDR(snap.expectedCash)} strong />
        {snap.countedCash !== null && (
          <>
            <FigureRow label="Kas dihitung" value={formatIDR(snap.countedCash)} />
            <FigureRow
              label="Selisih kas"
              value={<Money value={snap.variance ?? 0} signed />}
              tone={varianceTone(snap.variance ?? 0)}
              strong
            />
          </>
        )}
      </section>

      {snap.merchantQrisTotal !== null && (
        <section aria-label="Rekonsiliasi QRIS">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rekonsiliasi QRIS</p>
          <FigureRow label="Mutasi aplikasi merchant" value={formatIDR(snap.merchantQrisTotal)} />
          <FigureRow
            label="Selisih QRIS"
            value={<Money value={snap.merchantQrisVariance ?? 0} signed />}
            tone={varianceTone(snap.merchantQrisVariance ?? 0)}
            strong
          />
        </section>
      )}

      <section aria-label="Tipe layanan">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipe layanan</p>
        {Object.entries(snap.byType).length === 0 && (
          <p className="text-sm text-muted-foreground">Tidak ada pesanan.</p>
        )}
        {Object.entries(snap.byType).map(([type, v]) => (
          <FigureRow
            key={type}
            label={`${TYPE_LABELS[type] ?? type} (${v.count} pesanan)`}
            value={formatIDR(v.revenue)}
          />
        ))}
      </section>

      <section aria-label="Produk terlaris">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Produk terlaris</p>
        {snap.topProducts.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada penjualan.</p>}
        <div className="max-h-56 space-y-1 overflow-y-auto scrollbar-warm pr-1">
          {snap.topProducts.map((p, i) => (
            <div key={p.name} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">
                <span className="mr-1.5 text-xs text-muted-foreground">{i + 1}.</span>
                {p.name}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {p.qty}× · {formatIDR(p.revenue)}
                {productRevenue > 0 && (
                  <span className="ml-1 text-foreground">
                    ({Math.round((p.revenue / productRevenue) * 100)}%)
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
