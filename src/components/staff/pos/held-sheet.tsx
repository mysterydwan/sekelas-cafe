'use client'

// Held orders sheet (SPEC §3.6): park/recall in 2 taps — label, item count,
// age; recall loads items+meta back into the cart (then deletes the hold).
// Auto-expires at business-day close.

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Clock, History, Play, Trash2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
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
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/staff/primitives'
import { apiFetch } from '@/lib/client'
import { elapsedSince, formatDurationMinutes, formatTime } from '@/lib/format'
import type { DraftLine, HeldOrderDTO } from '@/lib/types'

interface HeldFull {
  id: string
  label: string
  items: DraftLine[]
  meta: Record<string, unknown>
  itemCount: number
  createdAt: string
}

export function HeldSheet({
  open,
  onOpenChange,
  onRecall,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecall: (items: DraftLine[], meta: Record<string, unknown>) => void
}) {
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [discardTarget, setDiscardTarget] = useState<HeldOrderDTO | null>(null)

  const { data: held, isLoading } = useQuery({
    queryKey: ['pos-held'],
    queryFn: () => apiFetch<HeldOrderDTO[]>('/api/pos/held'),
    enabled: open,
    refetchInterval: 30_000,
  })

  const recall = async (id: string) => {
    if (busyId) return
    setBusyId(id)
    try {
      const full = await apiFetch<HeldFull | null>(`/api/pos/held?id=${encodeURIComponent(id)}`)
      if (!full) {
        toast.error('Pesanan ditahan tidak ditemukan — mungkin sudah hangus')
        void queryClient.invalidateQueries({ queryKey: ['pos-held'] })
        return
      }
      await apiFetch(`/api/pos/held/${id}`, { method: 'DELETE' })
      void queryClient.invalidateQueries({ queryKey: ['pos-held'] })
      onRecall(full.items, full.meta)
      onOpenChange(false)
      toast.success(`“${full.label}” dikembalikan ke keranjang`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memuat pesanan ditahan')
    } finally {
      setBusyId(null)
    }
  }

  const discard = async (id: string) => {
    if (busyId) return
    setBusyId(id)
    try {
      await apiFetch(`/api/pos/held/${id}`, { method: 'DELETE' })
      void queryClient.invalidateQueries({ queryKey: ['pos-held'] })
      toast.success('Pesanan ditahan dibuang')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal membuang')
    } finally {
      setBusyId(null)
      setDiscardTarget(null)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-caramel" aria-hidden /> Pesanan Ditahan
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Hangus otomatis saat tutup hari (Z-report). Maksimal 20 pesanan aktif.
            </p>
          </SheetHeader>
          <div className="space-y-2 p-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
            ) : (held?.length ?? 0) === 0 ? (
              <EmptyState
                title="Tidak ada pesanan ditahan"
                description="Tahan keranjang aktif lewat tombol jeda di tab Pesanan Baru."
              />
            ) : (
              held?.map((h) => (
                <div key={h.id} className="rounded-xl border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{h.label}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" aria-hidden />
                        {formatTime(h.createdAt)} · {formatDurationMinutes(elapsedSince(h.createdAt))} lalu ·{' '}
                        {h.itemCount} item · oleh {h.createdBy}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDiscardTarget(h)}
                      disabled={busyId === h.id}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Buang pesanan ditahan ${h.label}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <Button
                    onClick={() => void recall(h.id)}
                    disabled={busyId === h.id}
                    className="mt-2 min-h-[44px] w-full bg-espresso text-cream hover:bg-espresso-soft"
                  >
                    <Play className="mr-2 h-4 w-4" aria-hidden /> Panggil ke Keranjang
                  </Button>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Destructive discard confirm — explicit copy, no reason needed */}
      <AlertDialog open={discardTarget !== null} onOpenChange={(o) => !o && setDiscardTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buang pesanan ditahan?</AlertDialogTitle>
            <AlertDialogDescription>
              Buang pesanan ditahan “{discardTarget?.label}”? Tidak bisa dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (discardTarget) void discard(discardTarget.id)
              }}
            >
              Ya, Buang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
