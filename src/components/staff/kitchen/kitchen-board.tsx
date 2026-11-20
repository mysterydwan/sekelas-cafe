'use client'

// KDS board (SPEC §3.7): always-dark kanban — Menunggu / Dimasak / Siap —
// with FIFO ordering, type filter, text-size + sound toggles (per device),
// connection chip, cashier view-only banner, completed-today drawer, and a
// sticky performance strip (rolling 30-min avg prep + waiting count).
// Data: GET /api/orders?from={today}&full=1 + realtime events + 5s poll.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, Eye, Printer, TriangleAlert, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { useSession } from '@/hooks/use-session'
import { useRealtime, useRealtimeStatus } from '@/hooks/use-realtime'
import { getSoundVolume, isSoundEnabled, playChime, setSoundEnabled, setSoundVolume } from '@/hooks/use-sound'
import { formatTime, todayJakarta } from '@/lib/format'
import type { OrderDTO, OrderItemDTO, OrderType, SettingsDTO, StockItemDTO } from '@/lib/types'
import { printKot } from '@/components/staff/receipt'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { KitchenCard } from './kitchen-card'

type TypeFilter = 'ALL' | OrderType
const TEXT_SIZE_KEY = 'kds-text-large'
const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: 'ALL', label: 'Semua' },
  { id: 'DINE_IN', label: 'Dine-in' },
  { id: 'TAKE_AWAY', label: 'Bungkus' },
  { id: 'DELIVERY', label: 'Antar' },
]

interface KitchenRows {
  rows: OrderDTO[]
  total: number
  page: number
  pageSize: number
}

/** Re-render every `intervalMs` so elapsed timers + rolling stats stay live. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(iv)
  }, [intervalMs])
  return now
}

function fifo(a: OrderDTO, b: OrderDTO): number {
  return new Date(a.paidAt ?? a.createdAt).getTime() - new Date(b.paidAt ?? b.createdAt).getTime()
}

export function KitchenBoard() {
  const { user, can } = useSession()
  const queryClient = useQueryClient()
  const today = todayJakarta()
  const now = useNow(30_000)

  const canOperate = user?.role === 'ADMIN' || user?.role === 'BARISTA'
  const isCashier = user?.role === 'CASHIER'

  // ---- server data ----
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['kitchen-orders', today],
    queryFn: () => apiFetch<KitchenRows>(`/api/orders?from=${today}&full=1`),
    refetchInterval: 5_000,
    placeholderData: (prev) => prev,
  })
  const { data: settings } = useQuery({
    queryKey: ['kitchen-settings'],
    queryFn: () => apiFetch<SettingsDTO>('/api/settings'),
    staleTime: 60_000,
  })
  // Low-stock awareness chip (SPEC §3.7): poll every 5 min + WS stock:low pushes.
  const { data: lowStock, refetch: refetchLowStock } = useQuery({
    queryKey: ['kds-low-stock'],
    queryFn: () => apiFetch<{ items: StockItemDTO[]; totalValue: number }>('/api/stock/items?lowOnly=1'),
    refetchInterval: 5 * 60_000,
    staleTime: 5 * 60_000,
  })
  const lowStockCount = lowStock?.items.length ?? 0
  const amberMin = settings?.system.kdsAmberMinutes ?? 10
  const redMin = settings?.system.kdsRedMinutes ?? 15

  const queryKey = useMemo(() => ['kitchen-orders', today] as const, [today])
  const applyUpdate = (updated: OrderDTO) => {
    queryClient.setQueryData<KitchenRows>(queryKey, (prev) =>
      prev ? { ...prev, rows: prev.rows.map((o) => (o.id === updated.id ? updated : o)) } : prev
    )
  }

  // ---- realtime signals (WS + 5s poll fallback) ----
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  useRealtime(
    ['order:created', 'order:status', 'order:itemChecked', 'order:needsAck', 'payment:updated', 'stock:low'],
    (event, payload) => {
      if (event === 'stock:low') {
        void refetchLowStock()
        return
      }
      if (event === 'order:created' && 'id' in payload) {
        playChime('new-order')
        const id = payload.id
        setFlashIds((prev) => {
          const next = new Set(prev)
          next.add(id)
          return next
        })
        window.setTimeout(() => {
          setFlashIds((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
        }, 2500)
      }
      void refetch()
    }
  )
  const { connected } = useRealtimeStatus()

  // ---- device preferences (persisted) ----
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
  const [large, setLarge] = useState(false)
  const [sound, setSound] = useState(true)
  const [volume, setVolume] = useState(1)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        setLarge(localStorage.getItem(TEXT_SIZE_KEY) === 'besar')
      } catch {
        /* storage unavailable — default size */
      }
      setSound(isSoundEnabled())
      setVolume(getSoundVolume())
    })
  }, [])

  const toggleLarge = () => {
    const next = !large
    setLarge(next)
    try {
      localStorage.setItem(TEXT_SIZE_KEY, next ? 'besar' : 'normal')
    } catch {
      /* storage unavailable — preference lives in memory */
    }
  }
  const toggleSound = () => {
    const next = !sound
    setSound(next)
    setSoundEnabled(next)
    if (next) playChime('ready')
  }

  // ---- 5-second undo window after completing an order ----
  const [undoId, setUndoId] = useState<string | null>(null)
  const undoTimer = useRef<number | null>(null)
  const scheduleUndoClear = () => {
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => setUndoId(null), 5000)
  }
  useEffect(
    () => () => {
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current)
    },
    []
  )

  // ---- mutations ----
  const check = async (order: OrderDTO, item: OrderItemDTO, delta: 1 | -1) => {
    if (!canOperate) return
    const snapshot = queryClient.getQueryData<KitchenRows>(queryKey)
    // Optimistic: bump count + auto-advance PAID -> PREPARING on first check.
    queryClient.setQueryData<KitchenRows>(queryKey, (prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((o) =>
              o.id === order.id
                ? {
                    ...o,
                    status: delta === 1 && o.status === 'PAID' ? 'PREPARING' : o.status,
                    items: o.items.map((it) =>
                      it.id === item.id
                        ? { ...it, checkedCount: Math.min(it.qty, Math.max(0, it.checkedCount + delta)) }
                        : it
                    ),
                  }
                : o
            ),
          }
        : prev
    )
    try {
      const updated = await apiFetch<OrderDTO>(`/api/orders/${order.id}/check`, {
        method: 'POST',
        body: JSON.stringify({ itemId: item.id, delta }),
      })
      applyUpdate(updated)
    } catch (e) {
      if (snapshot) queryClient.setQueryData<KitchenRows>(queryKey, snapshot)
      toast.error(e instanceof Error ? e.message : 'Gagal memperbarui centangan')
    }
  }

  const transition = async (
    order: OrderDTO,
    status: 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'COMPLETED',
    extra?: { reason?: string },
    successMsg?: string
  ) => {
    try {
      const updated = await apiFetch<OrderDTO>(`/api/orders/${order.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, reason: extra?.reason }),
      })
      applyUpdate(updated)
      if (status === 'READY') {
        playChime('ready')
        setUndoId(order.id)
        scheduleUndoClear()
      }
      toast.success(successMsg ?? `${order.code} diperbarui`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memperbarui status')
    }
  }

  const ack = async (order: OrderDTO) => {
    try {
      const updated = await apiFetch<OrderDTO>(`/api/orders/${order.id}/ack`, { method: 'POST' })
      applyUpdate(updated)
      toast.success(`Perubahan ${order.code} dikonfirmasi`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengonfirmasi perubahan')
    }
  }

  const deliver = async (order: OrderDTO, courierName: string) => {
    try {
      const updated = await apiFetch<OrderDTO>(`/api/orders/${order.id}/courier`, {
        method: 'POST',
        body: JSON.stringify({ name: courierName }),
      })
      applyUpdate(updated)
      await transition(order, 'OUT_FOR_DELIVERY', undefined, `${order.code} diantar oleh ${courierName}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengirim pesanan antar')
    }
  }

  const reprintKot = async (order: OrderDTO) => {
    if (!settings) {
      toast.error('Pengaturan belum termuat — coba lagi sebentar')
      return
    }
    try {
      await apiFetch(`/api/orders/${order.id}/reprint`, {
        method: 'POST',
        body: JSON.stringify({ template: 'KOT' }),
      })
    } catch {
      /* audit-log failure must never block printing */
    }
    printKot(order, settings.receipts)
    toast.success(`Mencetak ulang KOT ${order.code}`)
  }

  const cancelOrder = async (order: OrderDTO, reason: string) => {
    try {
      await apiFetch(`/api/orders/${order.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      toast.success(`${order.code} dibatalkan — tersimpan di riwayat`)
      await refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal membatalkan pesanan')
    }
  }

  // ---- derived columns (FIFO oldest-first) ----
  const rows = data?.rows ?? []
  const waiting = useMemo(
    () => rows.filter((o) => o.status === 'PAID' && (typeFilter === 'ALL' || o.type === typeFilter)).sort(fifo),
    [rows, typeFilter]
  )
  const cooking = useMemo(
    () => rows.filter((o) => o.status === 'PREPARING' && (typeFilter === 'ALL' || o.type === typeFilter)).sort(fifo),
    [rows, typeFilter]
  )
  const ready = useMemo(
    () =>
      rows
        .filter((o) => (o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY') && (typeFilter === 'ALL' || o.type === typeFilter))
        .sort(fifo),
    [rows, typeFilter]
  )
  const completedToday = useMemo(
    () =>
      rows
        .filter((o) => o.status === 'COMPLETED' && (typeFilter === 'ALL' || o.type === typeFilter))
        .sort((a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime()),
    [rows, typeFilter]
  )

  // Rolling 30-minute average prep time (readyAt - paidAt of orders made ready recently)
  const avgPrepMinutes = useMemo(() => {
    const cutoff = now - 30 * 60 * 1000
    const durations = rows
      .filter((o): o is OrderDTO & { readyAt: string; paidAt: string } => !!o.readyAt && !!o.paidAt && new Date(o.readyAt).getTime() >= cutoff)
      .map((o) => (new Date(o.readyAt).getTime() - new Date(o.paidAt).getTime()) / 60_000)
    if (durations.length === 0) return null
    return Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
  }, [rows, now])
  const waitingCount = waiting.length + cooking.length

  // ---- roving arrow-key navigation across the visible cards (SPEC §1.5) ----
  const cardEls = useRef(new Map<string, HTMLElement>())
  const registerCard = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cardEls.current.set(id, el)
    else cardEls.current.delete(id)
  }, [])

  const handleBoardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    const el = e.target as HTMLElement
    // Let text entry (courier name) keep its caret keys.
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable) return
    const card = el.closest<HTMLElement>('[data-order-id]')
    const id = card?.dataset.orderId
    if (!id) return
    const cols = [waiting, cooking, ready]
    const colIdx = cols.findIndex((col) => col.some((o) => o.id === id))
    if (colIdx === -1) return
    const rowIdx = cols[colIdx].findIndex((o) => o.id === id)
    let target: OrderDTO | undefined
    if (e.key === 'ArrowUp') target = cols[colIdx][rowIdx - 1]
    else if (e.key === 'ArrowDown') target = cols[colIdx][rowIdx + 1]
    else {
      // Left/Right hop columns, clamping the row when the target column is shorter.
      const col = e.key === 'ArrowRight' ? cols[colIdx + 1] : cols[colIdx - 1]
      if (col) target = col[Math.min(rowIdx, col.length - 1)]
    }
    if (target) {
      e.preventDefault()
      cardEls.current.get(target.id)?.focus()
    }
  }

  const cardProps = {
    large,
    amberMin,
    redMin,
    canOperate,
    canCancel: can('order.cancel'),
    registerCard,
    onCheck: (order: OrderDTO, item: OrderItemDTO, delta: 1 | -1) => void check(order, item, delta),
    onAck: (order: OrderDTO) => void ack(order),
    onComplete: (order: OrderDTO) =>
      void transition(order, 'READY', undefined, `${order.code} siap — pindah ke kolom Siap`),
    onUndoReady: (order: OrderDTO) => {
      setUndoId(null)
      void transition(order, 'PREPARING', { reason: 'Salah klik' }, `${order.code} dikembalikan ke Dimasak`)
    },
    onServe: (order: OrderDTO) =>
      void transition(order, 'COMPLETED', undefined, `${order.code} selesai — sudah diserahkan`),
    onDeliver: (order: OrderDTO, courierName: string) => void deliver(order, courierName),
    onArrive: (order: OrderDTO) => void transition(order, 'COMPLETED', undefined, `${order.code} tiba di tujuan`),
    onReprintKot: (order: OrderDTO) => void reprintKot(order),
    onCancelReady: (order: OrderDTO, reason: string) =>
      void transition(order, 'PREPARING', { reason }, `${order.code} kembali ke Dimasak`),
    onCancelOrder: (order: OrderDTO, reason: string) => void cancelOrder(order, reason),
  }

  const firstLoad = isPending && !data

  return (
    <div
      className="kds-surface flex min-h-[calc(100vh-57px)] flex-col p-3 md:p-5"
      onKeyDown={handleBoardKeyDown}
    >
      {/* Header strip */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Sekelas Cafe" className="h-8 w-auto object-contain" draggable={false} />
          <h1 className="font-display text-xl font-bold tracking-wide md:text-2xl">DAPUR</h1>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter tipe pesanan">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setTypeFilter(f.id)}
              aria-pressed={typeFilter === f.id}
              className={cn(
                'min-h-11 rounded-full border px-3.5 text-xs font-semibold transition-colors',
                typeFilter === f.id
                  ? 'border-transparent bg-[#D9A441] text-[#241610]'
                  : 'border-white/15 text-[#F0E7DA]/70 hover:bg-white/5'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {lowStockCount > 0 && (
            <Link
              href="/stock"
              className="flex min-h-11 items-center gap-1.5 rounded-full border border-[#D98A1F]/50 bg-[#D98A1F]/15 px-3 text-xs font-semibold text-[#D98A1F] transition-colors hover:bg-[#D98A1F]/25"
            >
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
              Stok rendah: {lowStockCount}
            </Link>
          )}

          <div
            className="flex rounded-full border border-white/15 p-0.5"
            role="group"
            aria-label="Ukuran teks kartu"
          >
            {(
              [
                { id: false, label: 'Normal' },
                { id: true, label: 'Besar' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  if (opt.id !== large) toggleLarge()
                }}
                aria-pressed={large === opt.id}
                className={cn(
                  'min-h-10 rounded-full px-3 text-xs font-semibold transition-colors',
                  large === opt.id ? 'bg-white/15 text-[#F0E7DA]' : 'text-white/50 hover:text-white/80'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={sound}
            aria-label={sound ? 'Matikan suara' : 'Nyalakan suara'}
            className="flex size-11 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {sound ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
          </button>

          {sound && (
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              aria-label="Volume suara"
              onChange={(e) => {
                const v = Number(e.target.value)
                setVolume(v)
                setSoundVolume(v)
              }}
              className="h-11 w-24 accent-[#D9A441]"
            />
          )}

          <span
            role="status"
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
              connected
                ? 'border-[#4C9A6E]/40 text-[#4C9A6E]'
                : 'border-[#D98A1F]/50 text-[#D98A1F]'
            )}
          >
            {connected ? <Wifi className="h-3.5 w-3.5" aria-hidden /> : <WifiOff className="h-3.5 w-3.5" aria-hidden />}
            {connected ? 'Tersambung' : 'Offline — data terakhir'}
          </span>
        </div>
      </header>

      {isCashier && (
        <div
          role="status"
          className="mt-3 flex items-center gap-2 rounded-lg border border-[#D98A1F]/60 bg-[#D98A1F]/15 px-3 py-2.5 text-xs font-semibold text-[#D98A1F]"
        >
          <Eye className="h-4 w-4 shrink-0" aria-hidden />
          MODE LIHAT — hanya barista yang bisa mencentang. Kamu tetap bisa lihat status untuk menjawab pelanggan.
        </div>
      )}

      {/* Board */}
      {firstLoad ? (
        <div className="mt-4 grid gap-4 md:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((col) => (
            <div key={col} className="space-y-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-64 rounded-xl bg-white/5" />
              ))}
            </div>
          ))}
        </div>
      ) : isError && !data ? (
        <div className="mt-10 flex flex-col items-center gap-3 text-center" role="alert">
          <p className="font-semibold">Gagal memuat antrean dapur</p>
          <p className="text-sm text-white/50">Periksa koneksi lalu coba lagi — data terakhir tetap aman.</p>
          <Button
            onClick={() => void refetch()}
            className="min-h-11 bg-[#D9A441] font-semibold text-[#241610] hover:bg-[#D9A441]/85"
          >
            Coba Lagi
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid flex-1 items-start gap-4 md:grid-cols-3">
          <KdsColumn title="Menunggu" count={waiting.length}>
            {waiting.map((order) => (
              <KitchenCard
                key={order.id}
                order={order}
                flashing={flashIds.has(order.id)}
                showUndo={undoId === order.id}
                {...cardProps}
              />
            ))}
            {waiting.length === 0 && <ColumnEmpty />}
          </KdsColumn>

          <KdsColumn title="Dimasak" count={cooking.length} tone="amber">
            {cooking.map((order) => (
              <KitchenCard
                key={order.id}
                order={order}
                flashing={flashIds.has(order.id)}
                showUndo={undoId === order.id}
                {...cardProps}
              />
            ))}
            {cooking.length === 0 && <ColumnEmpty />}
          </KdsColumn>

          <KdsColumn title="Siap" count={ready.length} tone="caramel">
            {ready.map((order) => (
              <KitchenCard
                key={order.id}
                order={order}
                flashing={flashIds.has(order.id)}
                showUndo={undoId === order.id}
                {...cardProps}
              />
            ))}
            {ready.length === 0 && <ColumnEmpty />}
          </KdsColumn>
        </div>
      )}

      {/* Completed today drawer (recall + KOT reprint until day close) */}
      <Collapsible open={drawerOpen} onOpenChange={setDrawerOpen} className="mt-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03]">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm font-semibold"
              aria-expanded={drawerOpen}
            >
              <ChevronDown
                className={cn('h-4 w-4 text-white/50 transition-transform', drawerOpen && 'rotate-180')}
                aria-hidden
              />
              Selesai hari ini
              <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-xs font-bold tabular-nums">
                {completedToday.length}
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-white/10 p-3">
              {completedToday.length === 0 ? (
                <p className="py-4 text-center text-sm text-white/30">Belum ada pesanan selesai hari ini</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {completedToday.map((order) => (
                    <li
                      key={order.id}
                      className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5"
                    >
                      <span className="font-mono text-sm font-semibold">{order.code}</span>
                      <span className="text-[11px] text-white/40">{formatTime(order.completedAt ?? order.createdAt)}</span>
                      <button
                        type="button"
                        onClick={() => void reprintKot(order)}
                        aria-label={`Cetak ulang KOT ${order.code}`}
                        className="flex size-9 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <Printer className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Performance strip (sticky, SPEC §3.7) */}
      <div
        role="status"
        className="sticky bottom-[calc(53px_+_env(safe-area-inset-bottom))] z-10 -mx-3 mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-white/10 bg-[#171210]/95 px-3 py-2.5 text-xs text-white/60 backdrop-blur md:-mx-5 md:px-5 lg:bottom-0"
      >
        <p>
          Rata-rata siap:{' '}
          <span className="font-mono font-bold tabular-nums text-[#F0E7DA]">
            {avgPrepMinutes !== null ? `${avgPrepMinutes} mnt` : '—'}
          </span>{' '}
          (30 mnt terakhir)
        </p>
        <p>
          Menunggu:{' '}
          <span className="font-mono font-bold tabular-nums text-[#D9A441]">{waitingCount}</span> pesanan
        </p>
        <p className="hidden md:inline" aria-hidden>
          ←→ pilih · Enter buka menu
        </p>
      </div>
    </div>
  )
}

function ColumnEmpty() {
  return <p className="py-10 text-center text-sm text-white/30">Antrean kosong — ambil napas dulu</p>
}

function KdsColumn({
  title,
  count,
  tone = 'cream',
  children,
}: {
  title: string
  count: number
  tone?: 'cream' | 'amber' | 'caramel'
  children: React.ReactNode
}) {
  const titleColor =
    tone === 'amber' ? 'text-[#D98A1F]' : tone === 'caramel' ? 'text-[#D9A441]' : 'text-[#F0E7DA]/75'
  return (
    <section
      aria-label={`${title} — ${count} pesanan`}
      className="flex min-w-0 flex-col rounded-xl border border-white/10 bg-black/20"
    >
      <header className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <h2 className={cn('text-xs font-bold uppercase tracking-[0.18em]', titleColor)}>{title}</h2>
        <span
          aria-label={`${count} pesanan`}
          className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-xs font-bold tabular-nums"
        >
          {count}
        </span>
      </header>
      <div className="flex-1 space-y-3 px-3 pb-3 scrollbar-warm md:max-h-[70vh] md:overflow-y-auto">
        {children}
      </div>
    </section>
  )
}
