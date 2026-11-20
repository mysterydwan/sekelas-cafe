'use client'

// Per-item movement history drawer (SPEC §3.11 "Riwayat").
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  MOVEMENT_LABELS,
  formatQty,
  signedQty,
  type MovementsResponse,
  type StockItemDTO,
} from './shared'

export function HistoryDrawer({ item, onClosed }: { item: StockItemDTO; onClosed: () => void }) {
  const [open, setOpen] = useState(true)
  const close = () => {
    setOpen(false)
    setTimeout(onClosed, 260)
  }

  const q = useQuery({
    queryKey: ['stock', 'movements', 'item', item.id],
    queryFn: () =>
      apiFetch<MovementsResponse>('/api/stock/movements?itemId=' + item.id + '&pageSize=100'),
    enabled: open,
  })

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md scrollbar-warm">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 font-display">
            <History className="h-5 w-5 text-caramel" aria-hidden />
            Riwayat {item.name}
          </SheetTitle>
          <SheetDescription>
            <span className="font-mono text-xs">{item.sku}</span> · 100 mutasi terakhir — catatan
            hanya bisa ditambah, tidak bisa diubah.
          </SheetDescription>
        </SheetHeader>
        <div className="p-4">
          {q.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Memuat riwayat…</p>
          ) : q.isError ? (
            <p className="py-8 text-center text-sm text-destructive" role="alert">
              Gagal memuat —{' '}
              <button className="underline" onClick={() => q.refetch()}>
                coba lagi
              </button>
            </p>
          ) : (q.data?.rows.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada mutasi untuk bahan ini.
            </p>
          ) : (
            <ol className="max-h-[calc(100vh-10rem)] space-y-2 overflow-y-auto pr-1 scrollbar-warm" aria-label="Daftar mutasi">
              {q.data!.rows.map((m) => (
                <li key={m.id} className="rounded-xl border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="border-caramel/30 bg-cream text-espresso">
                      {MOVEMENT_LABELS[m.type] ?? m.type}
                    </Badge>
                    <span
                      className={cn(
                        'font-mono text-sm font-semibold tabular-nums',
                        m.qtyDelta > 0 ? 'text-success' : m.qtyDelta < 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}
                    >
                      {signedQty(m.qtyDelta)} {item.unit}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
                    <span>{formatDateTime(m.createdAt)}</span>
                    <span className="font-mono tabular-nums">
                      sisa: {formatQty(m.resultingQty)} {item.unit}
                    </span>
                  </div>
                  {(m.reason || m.note || m.refOrderCode) && (
                    <p className="mt-1 text-xs">
                      {m.refOrderCode && <span className="mr-2 font-mono font-semibold">{m.refOrderCode}</span>}
                      {m.reason}
                      {m.note && <span className="text-muted-foreground"> — {m.note}</span>}
                    </p>
                  )}
                  {m.user && <p className="mt-0.5 text-xs text-muted-foreground">oleh {m.user}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
