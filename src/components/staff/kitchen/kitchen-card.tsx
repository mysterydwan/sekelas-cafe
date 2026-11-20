'use client'

// KDS order ticket (SPEC §3.7): big mono code, type badge, escalating elapsed
// timer, per-unit check-off lines (THE GATE) with long-press decrement,
// complete/serve/courier actions, needsAck blink, overflow menu with
// cancel-ready + cancel-order dialogs. Fixed dark palette — KDS ignores theme.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Ban,
  Bike,
  Check,
  CheckCheck,
  Lock,
  LockOpen,
  Minus,
  MoreHorizontal,
  Printer,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { elapsedSince, formatDurationMinutes, formatIDR } from '@/lib/format'
import { playChime } from '@/hooks/use-sound'
import type { OrderDTO, OrderItemDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

// Fixed KDS palette (SPEC §1.5 — KDS is always dark regardless of theme)
const GREEN = '#7BC494'
const AMBER = '#D98A1F'
const RED = '#D95648'

const UNREADY_REASONS = ['Salah klik', 'Ada item belum lengkap', 'Perlu dimasak ulang', 'Lainnya']
const CANCEL_REASONS = ['Salah pesanan', 'Pelanggan membatalkan', 'Stok habis', 'Lainnya']

function composeReason(reason: string, note: string): string {
  const n = note.trim()
  return n ? `${reason} — ${n}` : reason
}

function kitchenTypeLabel(order: OrderDTO): string {
  if (order.type === 'DINE_IN') return order.tableLabel ? `MEJA ${order.tableLabel}` : 'MAKAN DI TEMPAT'
  if (order.type === 'TAKE_AWAY') return 'BUNGKUS'
  return order.deliveryLocation ? `ANTAR — ${order.deliveryLocation}` : 'ANTAR'
}

function cancelImpactText(order: OrderDTO): string {
  const effective = order.payments.filter((p) => p.status !== 'REJECTED')
  if (effective.length === 0) return `Pesanan ${formatIDR(order.total)} belum dibayar.`
  const cash = effective.some((p) => p.method === 'CASH')
  const qris = effective.some((p) => p.method === 'QRIS')
  const parts: string[] = []
  if (cash) parts.push('kembalikan tunai dari laci')
  if (qris) parts.push('refund QRIS dicatat manual di luar sistem')
  return `Pesanan ${formatIDR(order.total)} sudah dibayar — ${parts.join(', ')}.`
}

/** Elapsed time since PAID; color escalates green -> amber -> red (SPEC §3.7). */
function ElapsedTimer({ mins, amberMin, redMin }: { mins: number; amberMin: number; redMin: number }) {
  const color = mins >= redMin ? RED : mins >= amberMin ? AMBER : GREEN
  return (
    <span
      role="timer"
      aria-label={`Menunggu ${formatDurationMinutes(mins)} sejak dibayar`}
      className="font-mono text-sm font-bold tabular-nums md:text-base"
      style={{ color }}
    >
      {formatDurationMinutes(mins)}
    </span>
  )
}

/**
 * One kitchen line: tap (or +) increments the checked count, long-press
 * (500ms hold / right-click) or the visible minus chip decrements it.
 * Targets are 48px+ for wet hands (SPEC §3.7).
 */
function ItemLine({
  item,
  large,
  disabled,
  onDelta,
}: {
  item: OrderItemDTO
  large: boolean
  disabled: boolean
  onDelta: (delta: 1 | -1) => void
}) {
  const holdTimer = useRef<number | null>(null)
  const consumed = useRef(false)

  const clearHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }
  useEffect(() => clearHold, [])

  if (item.isVoided) {
    return (
      <div className="flex min-h-12 items-center gap-2.5 rounded-lg border border-white/5 px-2 py-1.5 opacity-35">
        <span
          aria-hidden
          className="flex h-9 min-w-11 shrink-0 items-center justify-center rounded-md border border-white/15 font-mono text-sm font-bold"
        >
          ×
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug line-through">
            <span className="font-mono">{item.qty}×</span> {item.name}
          </span>
          {item.voidReason && <span className="block text-xs text-white/40">Dibatalkan: {item.voidReason}</span>}
        </span>
      </div>
    )
  }

  const complete = item.checkedCount >= item.qty

  return (
    <div className="flex items-stretch gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (consumed.current) {
            consumed.current = false
            return
          }
          onDelta(1)
        }}
        onPointerDown={() => {
          if (disabled) return
          consumed.current = false
          clearHold()
          holdTimer.current = window.setTimeout(() => {
            if (consumed.current) return
            consumed.current = true
            onDelta(-1)
          }, 500)
        }}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
        onContextMenu={(e) => {
          e.preventDefault()
          if (disabled) return
          if (!consumed.current) {
            consumed.current = true
            clearHold()
            onDelta(-1)
          }
        }}
        aria-label={`${item.qty}× ${item.name} — ${item.checkedCount} dari ${item.qty} siap. Ketuk untuk menambah, tahan untuk mengurangi.`}
        className={cn(
          'flex min-h-12 flex-1 touch-manipulation items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left transition-colors',
          complete
            ? 'border-[#4C9A6E]/50 bg-[#4C9A6E]/10'
            : 'border-white/10 bg-white/[0.04] hover:bg-white/10 active:bg-white/15',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex h-9 min-w-11 shrink-0 items-center justify-center gap-0.5 rounded-md font-mono text-sm font-bold tabular-nums',
            complete ? 'bg-[#4C9A6E] text-[#171210]' : 'border border-white/20'
          )}
        >
          {complete ? <Check className="h-4 w-4" /> : `${item.checkedCount}/${item.qty}`}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block font-semibold leading-snug',
              large ? 'text-lg' : 'text-[15px]',
              complete && 'line-through opacity-60'
            )}
          >
            <span className="font-mono">{item.qty}×</span> {item.name}
          </span>
          {item.variantLabels.length > 0 && (
            <span className={cn('mt-0.5 block leading-snug text-white/55', large ? 'text-sm' : 'text-xs')}>
              {item.variantLabels.join(', ')}
            </span>
          )}
          {item.note && (
            <span className="mt-0.5 block text-xs font-bold uppercase tracking-wide text-[#D98A1F]">
              {item.note.toUpperCase()}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        disabled={disabled || item.checkedCount === 0}
        onClick={() => onDelta(-1)}
        aria-label={`Kurangi centangan ${item.name}`}
        className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
      >
        <Minus className="h-5 w-5" aria-hidden />
      </button>
    </div>
  )
}

export interface KitchenCardProps {
  order: OrderDTO
  large: boolean
  amberMin: number
  redMin: number
  canOperate: boolean
  canCancel: boolean
  flashing: boolean
  showUndo: boolean
  /** Registers the card's focusable article for board-level arrow-key navigation. */
  registerCard?: (id: string, el: HTMLElement | null) => void
  onCheck: (order: OrderDTO, item: OrderItemDTO, delta: 1 | -1) => void
  onAck: (order: OrderDTO) => void
  onComplete: (order: OrderDTO) => void
  onUndoReady: (order: OrderDTO) => void
  onServe: (order: OrderDTO) => void
  onDeliver: (order: OrderDTO, courierName: string) => void
  onArrive: (order: OrderDTO) => void
  onReprintKot: (order: OrderDTO) => void
  onCancelReady: (order: OrderDTO, reason: string) => void
  onCancelOrder: (order: OrderDTO, reason: string) => void
}

export function KitchenCard(props: KitchenCardProps) {
  const {
    order,
    large,
    amberMin,
    redMin,
    canOperate,
    canCancel,
    flashing,
    showUndo,
    registerCard,
    onCheck,
    onAck,
    onComplete,
    onUndoReady,
    onServe,
    onDeliver,
    onArrive,
    onReprintKot,
    onCancelReady,
    onCancelOrder,
  } = props

  const [cancelReadyOpen, setCancelReadyOpen] = useState(false)
  const [cancelOrderOpen, setCancelOrderOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [readyReason, setReadyReason] = useState(UNREADY_REASONS[0])
  const [readyNote, setReadyNote] = useState('')
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0])
  const [cancelNote, setCancelNote] = useState('')
  const [courier, setCourier] = useState(order.courierName ?? '')

  const articleRef = useRef<HTMLElement | null>(null)
  // Stable identity so React doesn't detach/reattach the ref on every board tick.
  const setArticleRef = useCallback(
    (el: HTMLElement | null) => {
      articleRef.current = el
      registerCard?.(order.id, el)
    },
    [order.id, registerCard]
  )

  const activeItems = order.items.filter((i) => !i.isVoided)
  const remainingUnits = activeItems.reduce((s, i) => s + Math.max(0, i.qty - i.checkedCount), 0)
  const allChecked = activeItems.length > 0 && remainingUnits === 0
  const isDelivery = order.type === 'DELIVERY'
  const inQueue = order.status === 'PAID' || order.status === 'PREPARING'

  // ---- escalating timer + one-time chime when crossing the red threshold ----
  const elapsedMin = elapsedSince(order.paidAt ?? order.createdAt)
  // Cards that mount already past red must not chime — only live crossings do.
  const redChimedRef = useRef(elapsedMin >= redMin)
  useEffect(() => {
    if (elapsedMin >= redMin) {
      if (!redChimedRef.current) {
        redChimedRef.current = true
        playChime('low-stock') // playChime itself respects isSoundEnabled
      }
    } else {
      redChimedRef.current = false // allow a fresh chime if it re-crosses later
    }
  }, [elapsedMin, redMin])

  return (
    <article
      ref={setArticleRef}
      data-order-id={order.id}
      tabIndex={0}
      aria-label={`Pesanan ${order.code}`}
      onKeyDown={(e) => {
        // Enter opens the action menu when the card itself holds focus;
        // inner controls keep their native Enter behavior.
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault()
          setMenuOpen(true)
        }
      }}
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-[#D9A441]',
        flashing && 'chime-flash',
        order.needsAck && 'ticket-blink'
      )}
    >
      {/* Code + type + timer + overflow menu */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn('font-mono font-bold leading-none tracking-wide', large ? 'text-3xl' : 'text-2xl')}>
            {order.code}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-md bg-[#D9A441] px-2 py-0.5 text-[10px] font-bold tracking-wide text-[#241610] md:text-[11px]"
            >
              {kitchenTypeLabel(order)}
            </span>
            {order.isTraining && (
              <span className="rounded-md border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold text-white/60">
                LATIHAN
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <ElapsedTimer mins={elapsedMin} amberMin={amberMin} redMin={redMin} />
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Menu pesanan ${order.code}`}
                className="size-11 rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
              >
                <MoreHorizontal className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              onCloseAutoFocus={(e) => {
                // Escape (or any close) returns focus to the card, not the trigger.
                e.preventDefault()
                articleRef.current?.focus()
              }}
            >
              <DropdownMenuItem onClick={() => onReprintKot(order)}>
                <Printer className="mr-2 h-4 w-4" aria-hidden /> Cetak Ulang KOT
              </DropdownMenuItem>
              {order.status === 'READY' && (
                <DropdownMenuItem
                  onClick={() => {
                    setReadyReason(UNREADY_REASONS[0])
                    setReadyNote('')
                    setCancelReadyOpen(true)
                  }}
                >
                  <Undo2 className="mr-2 h-4 w-4" aria-hidden /> Batalkan Siap
                </DropdownMenuItem>
              )}
              {canCancel && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      setCancelReason(CANCEL_REASONS[0])
                      setCancelNote('')
                      setCancelOrderOpen(true)
                    }}
                  >
                    <Ban className="mr-2 h-4 w-4" aria-hidden /> Batalkan Pesanan
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isDelivery && order.customerName && (
        <p className="-mt-1.5 text-xs text-white/60">
          Untuk: <span className="font-semibold text-white/85">{order.customerName}</span>
        </p>
      )}
      {order.note && (
        <p className="-mt-1.5 text-xs font-bold uppercase tracking-wide text-[#D98A1F]">
          Catatan: {order.note.toUpperCase()}
        </p>
      )}

      {/* Modified-ticket acknowledge (blink-until-ack, Lightspeed pattern) */}
      {order.needsAck && canOperate && (
        <button
          type="button"
          onClick={() => onAck(order)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#D98A1F]/60 bg-[#D98A1F]/15 px-2 text-xs font-bold text-[#D98A1F]"
        >
          PERUBAHAN — ketuk untuk konfirmasi
        </button>
      )}

      {/* Item lines (THE GATE) */}
      <ul className="space-y-1.5">
        {order.items.map((item) => (
          <li key={item.id}>
            <ItemLine item={item} large={large} disabled={!canOperate} onDelta={(d) => onCheck(order, item, d)} />
          </li>
        ))}
      </ul>

      {/* Complete gate */}
      {inQueue && (
        <Button
          type="button"
          disabled={!allChecked || !canOperate}
          onClick={() => onComplete(order)}
          className={cn(
            'min-h-12 w-full text-sm font-bold',
            allChecked
              ? 'bg-[#4C9A6E] text-white hover:bg-[#4C9A6E]/85'
              : 'bg-white/10 text-white/55 hover:bg-white/10'
          )}
          aria-label={
            allChecked
              ? `Selesaikan pesanan ${order.code}`
              : `Terkunci — sisa ${remainingUnits} cup belum dicentang`
          }
        >
          {allChecked ? <LockOpen className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
          {allChecked ? 'Selesaikan Pesanan' : `Sisa ${remainingUnits} cup belum dicentang`}
        </Button>
      )}

      {/* 5-second undo right after completing (Lightspeed pattern) */}
      {order.status === 'READY' && showUndo && canOperate && (
        <button
          type="button"
          onClick={() => onUndoReady(order)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#D98A1F]/60 bg-[#D98A1F]/15 px-2 text-xs font-bold text-[#D98A1F]"
        >
          <Undo2 className="h-4 w-4" aria-hidden /> Undo — kembalikan ke Dimasak
        </button>
      )}

      {/* Serve / deliver actions */}
      {order.status === 'READY' && !isDelivery && (
        <Button
          type="button"
          disabled={!canOperate}
          onClick={() => onServe(order)}
          className="min-h-12 w-full bg-[#4C9A6E] text-sm font-bold text-white hover:bg-[#4C9A6E]/85"
        >
          <CheckCheck className="h-4 w-4" aria-hidden /> Sudah Diserahkan
        </Button>
      )}

      {order.status === 'READY' && isDelivery && (
        <div className="flex gap-1.5">
          <Input
            value={courier}
            onChange={(e) => setCourier(e.target.value)}
            placeholder="Nama kurir"
            aria-label={`Nama kurir untuk ${order.code}`}
            maxLength={40}
            className="min-h-12 flex-1 border-white/15 bg-white/5 text-[#F0E7DA] placeholder:text-white/30"
          />
          <Button
            type="button"
            disabled={!canOperate || !courier.trim()}
            onClick={() => onDeliver(order, courier.trim())}
            className="min-h-12 bg-[#D9A441] px-4 text-sm font-bold text-[#241610] hover:bg-[#D9A441]/85"
          >
            <Bike className="h-4 w-4" aria-hidden /> Antar
          </Button>
        </div>
      )}

      {order.status === 'OUT_FOR_DELIVERY' && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs text-white/60">
            <Bike className="h-3.5 w-3.5" aria-hidden /> Kurir:{' '}
            <span className="font-semibold text-white/85">{order.courierName ?? '—'}</span>
          </p>
          <Button
            type="button"
            disabled={!canOperate}
            onClick={() => onArrive(order)}
            className="min-h-12 w-full bg-[#4C9A6E] text-sm font-bold text-white hover:bg-[#4C9A6E]/85"
          >
            <CheckCheck className="h-4 w-4" aria-hidden /> Tiba
          </Button>
        </div>
      )}

      {/* Batalkan Siap — reason required, checks preserved */}
      <Dialog open={cancelReadyOpen} onOpenChange={setCancelReadyOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Batalkan status siap {order.code}?</DialogTitle>
            <DialogDescription>
              Pesanan kembali ke kolom Dimasak — centangan tetap tersimpan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`unready-reason-${order.id}`}>Alasan</Label>
              <Select value={readyReason} onValueChange={setReadyReason}>
                <SelectTrigger id={`unready-reason-${order.id}`} className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNREADY_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`unready-note-${order.id}`}>Catatan (opsional)</Label>
              <Input
                id={`unready-note-${order.id}`}
                value={readyNote}
                onChange={(e) => setReadyNote(e.target.value)}
                maxLength={200}
                placeholder="mis. 1 cup tertinggal di meja"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-11 flex-1" onClick={() => setCancelReadyOpen(false)}>
              Batal
            </Button>
            <Button
              className="min-h-11 flex-1 bg-espresso text-cream hover:bg-espresso-soft"
              onClick={() => {
                setCancelReadyOpen(false)
                onCancelReady(order, composeReason(readyReason, readyNote))
              }}
            >
              Kembalikan ke Dimasak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batalkan Pesanan — typed reason, destructive confirm */}
      <AlertDialog open={cancelOrderOpen} onOpenChange={setCancelOrderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan pesanan {order.code}?</AlertDialogTitle>
            <AlertDialogDescription>{cancelImpactText(order)} Pesanan tetap tersimpan di riwayat dan kodenya tidak dipakai ulang.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`cancel-reason-${order.id}`}>Alasan pembatalan</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger id={`cancel-reason-${order.id}`} className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CANCEL_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`cancel-note-${order.id}`}>Catatan (wajib bila “Lainnya”)</Label>
              <Input
                id={`cancel-note-${order.id}`}
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                maxLength={200}
                placeholder="mis. salah pilih ukuran"
              />
            </div>
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-11 flex-1">Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelReason === 'Lainnya' && !cancelNote.trim()}
              className="min-h-11 flex-1 bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                setCancelOrderOpen(false)
                onCancelOrder(order, composeReason(cancelReason, cancelNote))
              }}
            >
              Ya, Batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  )
}
