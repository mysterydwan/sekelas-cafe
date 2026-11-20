'use client'

// Stock count (opname) tab (SPEC §3.11): blind entry grid → variance review →
// approval writes COUNT_VARIANCE. Resumable draft, printable count sheet.
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ClipboardCheck, Eye, EyeOff, Loader2, Printer, Save } from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { formatDateLong, todayJakarta } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/hooks/use-session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState, TableSkeleton } from '@/components/staff/primitives'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { printHtml, signedQty, formatQty, type StockItemDTO } from './shared'
import type { StockCountDTO } from '@/lib/types'

export function StockCountTab({ allItems }: { allItems: StockItemDTO[] }) {
  const { can } = useSession()
  const canManage = can('stock.manage')
  const canApprove = can('count.approve')
  const qc = useQueryClient()

  const [entries, setEntries] = useState<Record<string, string> | null>(null) // null = untouched, derive from draft
  const [revealed, setRevealed] = useState(false)
  const [showApprove, setShowApprove] = useState(false)

  const countQuery = useQuery({
    queryKey: ['stock', 'count'],
    queryFn: () => apiFetch<StockCountDTO | null>('/api/stock/counts'),
  })
  const draft = countQuery.data ?? null

  const values: Record<string, string> = useMemo(() => {
    if (entries) return entries
    if (!draft) return {}
    const map: Record<string, string> = {}
    for (const l of draft.lines) map[l.stockItemId] = l.countedQty === null ? '' : String(l.countedQty)
    return map
  }, [entries, draft])

  // draft lines + any items created after the draft was started. Extras are
  // visually flagged — in a scoped ("10 item tercepat") draft they only join
  // the count once actually counted.
  const grid = useMemo(() => {
    if (!draft) return []
    const seen = new Set(draft.lines.map((l) => l.stockItemId))
    const draftRows = draft.lines.map((l) => ({ ...l, isExtra: false }))
    const extra = allItems
      .filter((i) => !seen.has(i.id))
      .map((i) => ({
        stockItemId: i.id,
        sku: i.sku,
        name: i.name,
        unit: i.unit,
        systemQty: i.qty,
        isExtra: true,
      }))
    return [...draftRows, ...extra]
  }, [draft, allItems])

  const countedOf = (id: string): number | null => {
    const v = values[id]
    if (v === undefined || v === '') return null
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }

  const countedCount = grid.filter((l) => countedOf(l.stockItemId) !== null).length
  const varianceCount = grid.filter((l) => {
    const c = countedOf(l.stockItemId)
    return c !== null && Math.abs(c - l.systemQty) > 0.0001
  }).length

  const startMutation = useMutation({
    mutationFn: (preset: 'all' | 'quick') =>
      apiFetch('/api/stock/counts', {
        method: 'POST',
        body: JSON.stringify({ lines: [], preset }),
      }),
    onSuccess: (_d, preset) => {
      toast.success(
        preset === 'quick'
          ? 'Opname cepat dimulai — 10 bahan tercepat minggu ini, sistem menyembunyikan jumlahnya'
          : 'Opname dimulai — sistem menyembunyikan jumlah agar hitungan jujur'
      )
      qc.invalidateQueries({ queryKey: ['stock', 'count'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      // Post draft lines + extras the user actually counted. Untouched extras
      // carry null counts (a no-op server-side) and — worse — would inflate a
      // scoped "10 item tercepat" draft back to a full-scope draft.
      const draftIds = new Set(draft?.lines.map((l) => l.stockItemId) ?? [])
      const lines = grid
        .filter((l) => draftIds.has(l.stockItemId) || countedOf(l.stockItemId) !== null)
        .map((l) => ({ stockItemId: l.stockItemId, countedQty: countedOf(l.stockItemId) }))
      return apiFetch('/api/stock/counts', {
        method: 'POST',
        body: JSON.stringify({ lines }),
      })
    },
    onSuccess: () => {
      toast.success(`Draf opname tersimpan — ${countedCount}/${grid.length} bahan terhitung`)
      qc.invalidateQueries({ queryKey: ['stock', 'count'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const approveMutation = useMutation({
    mutationFn: () => apiFetch('/api/stock/counts/approve', { method: 'POST' }),
    onSuccess: () => {
      toast.success('Opname disetujui — selisih diterapkan sebagai mutasi Penyesuaian Opname')
      setEntries(null)
      setRevealed(false)
      qc.invalidateQueries({ queryKey: ['stock'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const printSheet = () => {
    const body = `
      <h1>Lembar Opname</h1>
      <p class="muted">${formatDateLong(new Date())} — Sekelas Cafe</p>
      <table>
        <thead><tr><th>SKU</th><th>Bahan</th><th>Satuan</th><th style="width:90px">Hitung</th><th style="width:70px">Selisih</th></tr></thead>
        <tbody>
          ${allItems
            .map(
              (i) =>
                `<tr><td class="mono">${i.sku}</td><td>${i.name}</td><td>${i.unit}</td><td>&nbsp;</td><td>&nbsp;</td></tr>`
            )
            .join('')}
        </tbody>
      </table>
      <p class="muted" style="margin-top:10px">Hitung fisik tanpa melihat sistem. Serahkan ke penyetuju untuk input & persetujuan.</p>
    `
    if (!printHtml('Lembar Opname', body)) toast.error('Izinkan pop-up untuk mencetak')
  }

  if (countQuery.isLoading) {
    return <TableSkeleton rows={6} cols={4} />
  }

  if (!draft) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={<ClipboardCheck className="h-10 w-10" aria-hidden />}
          title="Belum ada opname hari ini"
          description={
            canManage
              ? 'Mulai opname untuk mencocokkan stok fisik dengan catatan sistem. Hitungan berlangsung buta (jumlah sistem disembunyikan).'
              : 'Opname belum dimulai. Pegawai dengan izin Stok dapat memulainya.'
          }
        />
        {canManage && (
          <div
            className="grid gap-3 sm:grid-cols-2"
            role="group"
            aria-label="Pilih cakupan opname"
          >
            <button
              type="button"
              onClick={() => startMutation.mutate('all')}
              disabled={startMutation.isPending}
              className="min-h-28 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-caramel/60 hover:bg-cream disabled:cursor-not-allowed disabled:opacity-60"
            >
              <p className="font-display text-base font-semibold">Semua bahan</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Cocokkan seluruh persediaan — ideal untuk tutup bulan atau audit menyeluruh.
              </p>
            </button>
            <button
              type="button"
              onClick={() => startMutation.mutate('quick')}
              disabled={startMutation.isPending}
              className="min-h-28 rounded-xl border border-caramel/40 bg-cream p-4 text-left shadow-sm transition-colors hover:border-caramel hover:bg-caramel/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <p className="font-display text-base font-semibold">
                10 item tercepat
                <span className="ml-2 rounded-full bg-caramel/20 px-2 py-0.5 align-middle text-[11px] font-semibold uppercase tracking-wide text-espresso">
                  cepat
                </span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Fokus pada bahan yang paling sering terpakai minggu ini — selesai lebih cepat.
              </p>
            </button>
          </div>
        )}
        {canManage && startMutation.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Menyiapkan lembar opname…
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4">
        <div>
          <p className="font-display text-base font-semibold">
            Opname {formatDateLong(draft.createdAt)}
          </p>
          <p className="text-xs text-muted-foreground">
            Draf tersimpan otomatis bisa dilanjutkan · {countedCount}/{grid.length} bahan terhitung
            {varianceCount > 0 && revealed && ` · ${varianceCount} selisih`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-11" onClick={printSheet}>
            <Printer className="mr-2 h-4 w-4" aria-hidden /> Cetak Lembar
          </Button>
          <Button
            variant={revealed ? 'outline' : 'default'}
            className={cn('h-11', !revealed && 'bg-caramel text-espresso-deep hover:bg-caramel-light')}
            onClick={() => setRevealed((r) => !r)}
            aria-pressed={revealed}
          >
            {revealed ? (
              <>
                <EyeOff className="mr-2 h-4 w-4" aria-hidden /> Kembali Menghitung
              </>
            ) : (
              <>
                <Eye className="mr-2 h-4 w-4" aria-hidden /> Selesaikan Hitung
              </>
            )}
          </Button>
        </div>
      </div>

      {/* entry grid / variance review */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-cream/60 text-left">
              <th className="p-3 font-medium">Bahan</th>
              <th className="p-3 font-medium">Satuan</th>
              <th className="p-3 text-right font-medium">
                {revealed ? 'Sistem' : 'Sistem (tersembunyi)'}
              </th>
              <th className="p-3 font-medium">Hitungan fisik</th>
              {revealed && <th className="p-3 text-right font-medium">Selisih</th>}
            </tr>
          </thead>
          <tbody>
            {grid.map((l) => {
              const counted = countedOf(l.stockItemId)
              const variance = counted === null ? null : counted - l.systemQty
              return (
                <tr key={l.stockItemId} className="border-b last:border-0">
                  <td className="p-3">
                    <p className="font-medium">
                      {l.name}
                      {l.isExtra && (
                        <span className="ml-1.5 rounded-full bg-caramel/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          tambahan
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">{l.sku}</p>
                  </td>
                  <td className="p-3 text-muted-foreground">{l.unit}</td>
                  <td className="p-3 text-right font-mono tabular-nums">
                    {revealed ? (
                      formatQty(l.systemQty)
                    ) : (
                      <span className="tracking-widest text-muted-foreground" aria-label="jumlah tersembunyi">
                        •••
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      className="h-11 w-32 font-mono tabular-nums"
                      value={values[l.stockItemId] ?? ''}
                      onChange={(e) =>
                        setEntries((en) => ({
                          ...(en ?? values),
                          [l.stockItemId]: e.target.value,
                        }))
                      }
                      disabled={!canManage}
                      placeholder="—"
                      aria-label={`Hitungan fisik ${l.name}`}
                    />
                  </td>
                  {revealed && (
                    <td
                      className={cn(
                        'p-3 text-right font-mono font-semibold tabular-nums',
                        variance === null
                          ? 'text-muted-foreground'
                          : Math.abs(variance) < 0.0001
                            ? 'text-muted-foreground'
                            : variance > 0
                              ? 'text-success'
                              : 'text-destructive'
                      )}
                    >
                      {variance === null ? '—' : signedQty(variance)}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canManage && (
          <Button
            variant="outline"
            className="h-11"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden />
            )}
            Simpan Draf
          </Button>
        )}
        {revealed && canApprove && (
          <Button
            className="h-11 bg-espresso text-cream hover:bg-espresso-soft"
            onClick={() => setShowApprove(true)}
            disabled={countedCount === 0}
          >
            Ajukan Persetujuan
          </Button>
        )}
        {revealed && !canApprove && (
          <Badge variant="outline" className="border-caramel/40 bg-caramel/10 py-2 text-warning">
            Persetujuan butuh izin “Menyetujui hasil opname”
          </Badge>
        )}
        {!canManage && (
          <p className="text-sm text-muted-foreground">Hanya lihat — mengisi hitungan butuh izin Stok.</p>
        )}
      </div>

      <AlertDialog open={showApprove} onOpenChange={setShowApprove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Setujui opname hari ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {countedCount} bahan terhitung, {varianceCount} di antaranya berselisih. Menyetujui
              akan mengubah stok sistem sesuai hitungan fisik dan mencatatnya sebagai mutasi
              Penyesuaian Opname atas nama kamu. Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-espresso text-cream hover:bg-espresso-soft"
              onClick={() => {
                approveMutation.mutate()
                setShowApprove(false)
              }}
            >
              Setujui & Terapkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
