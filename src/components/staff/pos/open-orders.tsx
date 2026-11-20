'use client'

// POS "Pesanan Aktif" tab (SPEC §3.6): today's non-completed orders —
// unpaid w/ take-payment, PENDING_VERIFICATION QRIS rail w/ age + buyer
// reference + confirm reminder, ready unserved w/ serve + reprint.

import { useState } from 'react'
import {
  BadgeCheck,
  Bike,
  CheckCheck,
  ChevronDown,
  Clock,
  CookingPot,
  MoreHorizontal,
  Printer,
  QrCode,
  ReceiptText,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/staff/primitives'
import { ORDER_TYPE_LABEL, type OrderDTO } from '@/lib/types'
import { elapsedSince, formatDurationMinutes, formatIDR, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'

function TypeTag({ order }: { order: OrderDTO }) {
  const label =
    order.type === 'DINE_IN'
      ? order.tableLabel
        ? `Meja ${order.tableLabel}`
        : 'Makan di Tempat'
      : ORDER_TYPE_LABEL[order.type]
  return (
    <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-espresso dark:bg-secondary dark:text-caramel-light">
      {label}
      {order.type === 'DELIVERY' && order.deliveryLocation ? ` · ${order.deliveryLocation}` : ''}
    </span>
  )
}

export function OpenOrdersPanel({
  orders,
  loading,
  onPayOrder,
  onVerifyQris,
  onServe,
  onDeliver,
  onArrive,
  onReprint,
}: {
  orders: OrderDTO[]
  loading: boolean
  onPayOrder: (order: OrderDTO) => void
  onVerifyQris: (order: OrderDTO) => void
  onServe: (order: OrderDTO) => void
  onDeliver: (order: OrderDTO, courierName: string) => void
  onArrive: (order: OrderDTO) => void
  onReprint: (order: OrderDTO, template: 'KOT' | 'RECEIPT') => void
}) {
  const [courierDrafts, setCourierDrafts] = useState<Record<string, string>>({})

  if (loading && orders.length === 0) {
    return (
      <div className="space-y-3 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  const pendingVerify = orders.filter((o) => o.status === 'PENDING_VERIFICATION')
  const unpaid = orders.filter((o) => o.status === 'PENDING_PAYMENT')
  const inProgress = orders.filter((o) => o.status === 'PAID' || o.status === 'PREPARING')
  const ready = orders.filter((o) => o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY')

  if (orders.length === 0) {
    return (
      <div className="p-3">
        <EmptyState
          title="Tidak ada pesanan aktif"
          description="Pesanan baru dari kasir maupun pelanggan mandiri akan muncul di sini."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-3">
      {/* QRIS verification rail */}
      {pendingVerify.length > 0 && (
        <section aria-label="Menunggu verifikasi QRIS">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-warning">
            <QrCode className="h-4 w-4" aria-hidden /> Verifikasi QRIS ({pendingVerify.length})
          </h4>
          <ul className="space-y-2">
            {pendingVerify.map((o) => {
              const ref = o.payments.find((p) => p.status === 'PENDING_VERIFICATION')?.qrReference
              return (
                <li key={o.id} className="rounded-xl border border-warning/40 bg-caramel/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold">{o.code}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" aria-hidden />
                        {formatDurationMinutes(elapsedSince(o.createdAt))} lalu · Ref:{' '}
                        <span className="font-medium text-foreground">{ref || '—'}</span>
                      </p>
                    </div>
                    <p className="font-mono text-sm font-bold tabular-nums">{formatIDR(o.total)}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <TypeTag order={o} />
                    <Button
                      size="sm"
                      onClick={() => onVerifyQris(o)}
                      className="ml-auto min-h-[40px] bg-espresso text-cream hover:bg-espresso-soft"
                    >
                      Konfirmasi
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Unpaid */}
      {unpaid.length > 0 && (
        <section aria-label="Belum dibayar">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <Wallet className="h-4 w-4" aria-hidden /> Belum Bayar ({unpaid.length})
          </h4>
          <ul className="space-y-2">
            {unpaid.map((o) => (
              <li key={o.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold">{o.code}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatTime(o.createdAt)} · {o.source === 'PUBLIC' ? 'Pesanan mandiri' : 'Kasir'} ·{' '}
                      {o.customerName || o.tableLabel || o.deliveryLocation || '—'}
                    </p>
                  </div>
                  <p className="font-mono text-sm font-bold tabular-nums">{formatIDR(o.total)}</p>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <TypeTag order={o} />
                  <Button
                    size="sm"
                    onClick={() => onPayOrder(o)}
                    className="ml-auto min-h-[40px] bg-success text-white hover:bg-success/90"
                  >
                    Terima Bayar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* In progress (kitchen handles these — awareness only) */}
      {inProgress.length > 0 && (
        <section aria-label="Sedang diproses dapur">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <CookingPot className="h-4 w-4" aria-hidden /> Dapur Bekerja ({inProgress.length})
          </h4>
          <ul className="space-y-1.5">
            {inProgress.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5 opacity-90"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold">{o.code}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatTime(o.paidAt ?? o.createdAt)} · {o.items.filter((i) => !i.isVoided).length} item
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <TypeTag order={o} />
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold',
                      o.status === 'PAID' ? 'bg-cream text-espresso dark:bg-secondary' : 'bg-caramel/20 text-warning'
                    )}
                  >
                    {o.status === 'PAID' ? 'ANTRE' : 'DIMASAK'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Ready to serve / deliver */}
      {ready.length > 0 && (
        <section aria-label="Siap diserahkan">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-success">
            <BadgeCheck className="h-4 w-4" aria-hidden /> Siap Diserahkan ({ready.length})
          </h4>
          <ul className="space-y-2">
            {ready.map((o) => {
              const isDelivery = o.type === 'DELIVERY'
              const isOut = o.status === 'OUT_FOR_DELIVERY'
              return (
                <li key={o.id} className="rounded-xl border border-success/40 bg-success/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold">{o.code}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatTime(o.readyAt ?? o.createdAt)}
                        {isDelivery && o.customerName ? ` · ${o.customerName}` : ''}
                        {isDelivery && o.deliveryLocation ? ` · ${o.deliveryLocation}` : ''}
                      </p>
                    </div>
                    <p className="font-mono text-sm font-bold tabular-nums">{formatIDR(o.total)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <TypeTag order={o} />
                    {isDelivery && o.courierName && (
                      <span className="flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold dark:bg-secondary">
                        <Bike className="h-3 w-3" aria-hidden /> {o.courierName}
                      </span>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Menu cetak">
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onReprint(o, 'RECEIPT')}>
                          <ReceiptText className="mr-2 h-4 w-4" aria-hidden /> Cetak Struk
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onReprint(o, 'KOT')}>
                          <Printer className="mr-2 h-4 w-4" aria-hidden /> Cetak KOT
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {isDelivery ? (
                      isOut ? (
                        <Button
                          size="sm"
                          onClick={() => onArrive(o)}
                          className="ml-auto min-h-[40px] bg-success text-white hover:bg-success/90"
                        >
                          <CheckCheck className="mr-1 h-4 w-4" aria-hidden /> Tiba
                        </Button>
                      ) : (
                        <div className="ml-auto flex items-center gap-1.5">
                          <Input
                            value={courierDrafts[o.id] ?? o.courierName ?? ''}
                            onChange={(e) => setCourierDrafts((d) => ({ ...d, [o.id]: e.target.value }))}
                            placeholder="Nama kurir"
                            className="h-10 w-32 text-xs"
                            aria-label={`Nama kurir untuk ${o.code}`}
                            maxLength={40}
                          />
                          <Button
                            size="sm"
                            onClick={() => onDeliver(o, (courierDrafts[o.id] ?? o.courierName ?? '').trim())}
                            disabled={!(courierDrafts[o.id] ?? o.courierName ?? '').trim()}
                            className="min-h-[40px] bg-espresso text-cream hover:bg-espresso-soft"
                          >
                            <Bike className="mr-1 h-4 w-4" aria-hidden /> Antar
                          </Button>
                        </div>
                      )
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => onServe(o)}
                        className="ml-auto min-h-[40px] bg-success text-white hover:bg-success/90"
                      >
                        <CheckCheck className="mr-1 h-4 w-4" aria-hidden /> Sudah Diserahkan
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {orders.length > 0 && (
        <p className="flex items-center justify-center gap-1 pb-2 text-center text-[11px] text-muted-foreground">
          <ChevronDown className="h-3 w-3" aria-hidden />
          Diperbarui otomatis tiap 15 detik · pesanan selesai pindah ke riwayat
        </p>
      )}
    </div>
  )
}
