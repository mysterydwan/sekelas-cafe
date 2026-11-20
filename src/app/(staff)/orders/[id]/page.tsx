'use client'

// /orders/[id] — Order detail (SPEC §3.9): read-first inspection (items with
// variant snapshots + check progress, payments, totals, delivery info,
// timeline stepper) with every action grouped in a sticky bottom bar —
// fulfillment, receipts (+WhatsApp), payment (ChargeDialog / QRIS verify),
// item void + order cancel behind typed-reason dialogs.

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Ban,
  Banknote,
  Bike,
  CheckCheck,
  BellRing,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Printer,
  ReceiptText,
  ShieldAlert,
  User,
  XCircle,
} from 'lucide-react'
import { apiFetch, ApiError } from '@/lib/client'
import { useSession } from '@/hooks/use-session'
import { useRealtime } from '@/hooks/use-realtime'
import { formatDateTime, formatIDR } from '@/lib/format'
import type { OrderDTO, OrderItemDTO, PaymentInput, Role, SettingsDTO, TimelineEntry } from '@/lib/types'
import { ORDER_TYPE_LABEL } from '@/lib/types'
import { PageGuard, EmptyPanel } from '@/components/staff/page-guard'
import { Money } from '@/components/staff/money'
import { OrderStatusBadge, PaymentBadge } from '@/components/staff/status-badges'
import { ChargeDialog, QrisVerifyDialog, type ChargeResult } from '@/components/staff/charge-modals'
import { buildWhatsAppText, printKot, printReceipt } from '@/components/staff/receipt'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { cn } from '@/lib/utils'

const CANCEL_REASONS = ['Salah pesanan', 'Pelanggan membatalkan', 'Stok habis', 'Lainnya']
const VOID_REASONS = ['Salah pesanan', 'Stok habis', 'Rusak', 'Lainnya']

/** Normalize an Indonesian phone number into wa.me 62… form. */
function waDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return '62' + digits.slice(1)
  if (digits.startsWith('8')) return '62' + digits
  return digits
}

function composeReason(reason: string, note: string): string {
  const n = note.trim()
  return n ? `${reason} — ${n}` : reason
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

export default function OrderDetailPage() {
  return (
    <PageGuard page="/orders">
      <OrderDetailInner />
    </PageGuard>
  )
}

function OrderDetailInner() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const { can, user } = useSession()
  const queryClient = useQueryClient()

  const {
    data: order,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['order-detail', id],
    queryFn: () => apiFetch<OrderDTO>(`/api/orders/${id}`),
    refetchInterval: 15_000,
    placeholderData: (prev) => prev,
    retry: (failureCount, err) => {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) return false
      return failureCount < 2
    },
  })

  const { data: settings } = useQuery({
    queryKey: ['order-settings'],
    queryFn: () => apiFetch<SettingsDTO>('/api/settings'),
    staleTime: 60_000,
  })

  useRealtime(['order:status', 'order:itemChecked', 'order:needsAck', 'payment:updated'], () => {
    void refetch()
  })

  // ---- not found / error / loading ----
  if (isError && error instanceof ApiError && error.status === 404) {
    return (
      <EmptyPanel
        icon={<ReceiptText className="h-10 w-10" aria-hidden />}
        title="Pesanan tidak ditemukan"
        description="Kode atau tautan yang kamu buka mungkin sudah tidak valid — periksa lagi dari daftar pesanan."
        cta={{ label: 'Kembali ke Daftar Pesanan', href: '/orders' }}
      />
    )
  }

  if (isError && !order) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <Alert variant="destructive">
          <AlertTitle>Gagal memuat pesanan</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Terjadi kesalahan tak terduga.'}
            <Button variant="outline" size="sm" className="mt-2 min-h-11" onClick={() => void refetch()}>
              Coba Lagi
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6" aria-busy>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <OrderDetailBody
      order={order}
      settings={settings}
      refetch={refetch}
      queryClient={queryClient}
      can={can}
      role={user?.role}
    />
  )
}

function OrderDetailBody({
  order,
  settings,
  refetch,
  queryClient,
  can,
  role,
}: {
  order: OrderDTO
  settings: SettingsDTO | undefined
  refetch: () => Promise<unknown>
  queryClient: ReturnType<typeof useQueryClient>
  can: (grant: string) => boolean
  role: Role | undefined
}) {
  const [chargeOpen, setChargeOpen] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0])
  const [cancelNote, setCancelNote] = useState('')
  const [voidItem, setVoidItem] = useState<OrderItemDTO | null>(null)
  const [voidReason, setVoidReason] = useState(VOID_REASONS[0])
  const [voidNote, setVoidNote] = useState('')
  const [courier, setCourier] = useState(order.courierName ?? '')
  const [busy, setBusy] = useState(false)

  const paid = order.paymentStatus === 'CONFIRMED'
  const pendingVerify = order.paymentStatus === 'PENDING_VERIFICATION'
  const canPay = can('payment.confirm') && !paid
  const canCancel = can('order.cancel') && !['COMPLETED', 'CANCELLED'].includes(order.status)
  const canVoid = can('order.voidItem') && order.status !== 'COMPLETED'
  // Serve/deliver transitions accept cashiers too (API contract); marking an
  // order READY stays kitchen-only (server rejects cashiers for PREPARING/READY).
  const canServe = role === 'ADMIN' || role === 'BARISTA' || role === 'CASHIER'
  const canMarkReady = role === 'ADMIN' || role === 'BARISTA'

  const invalidate = () => {
    void refetch()
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    queryClient.invalidateQueries({ queryKey: ['kitchen'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const post = async (url: string, body?: unknown) => {
    setBusy(true)
    try {
      const result = await apiFetch<OrderDTO>(url, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      })
      invalidate()
      return result
    } finally {
      setBusy(false)
    }
  }

  const doReprint = async (template: 'KOT' | 'RECEIPT') => {
    try {
      await apiFetch(`/api/orders/${order.id}/reprint`, {
        method: 'POST',
        body: JSON.stringify({ template }),
      })
      if (!settings) {
        toast.error('Pengaturan belum termuat — coba lagi')
        return
      }
      if (template === 'KOT') printKot(order, settings.receipts)
      else printReceipt(order, settings.receipts)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mencetak')
    }
  }

  const sendWhatsApp = async () => {
    const text = buildWhatsAppText(order)
    const digits = waDigits(order.customerPhone ?? '')
    if (digits) {
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
    } else {
      try {
        await navigator.clipboard.writeText(text)
        toast.success('Nomor tidak tersedia — ringkasan pesanan disalin ke clipboard')
      } catch {
        toast.error('Gagal menyalin ringkasan')
      }
    }
  }

  const effective = order.payments.filter((p) => p.status !== 'REJECTED')
  const cashPortion = effective.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amount, 0)
  const qrisPortion = effective.filter((p) => p.method === 'QRIS').reduce((s, p) => s + p.amount, 0)

  const steps: TimelineEntry[] = order.timeline

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <Link
            href="/orders"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Pesanan
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-3xl font-bold tracking-wide">{order.code}</h1>
            <OrderStatusBadge status={order.status} />
            <PaymentBadge status={order.paymentStatus} />
            {order.isTraining && (
              <span className="rounded-full bg-caramel/15 px-2 py-0.5 text-xs font-semibold text-warning">
                LATIHAN
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {ORDER_TYPE_LABEL[order.type]}
            {order.tableLabel ? ` · ${order.tableLabel}` : ''}
            {order.customerName ? ` · ${order.customerName}` : ''} · Dibuat {formatDateTime(order.createdAt)}
            {order.source === 'PUBLIC' ? ' · Pesanan online' : ''}
          </p>
        </div>
        {(canPay || pendingVerify) && (
          <div className="flex flex-wrap gap-2">
            {pendingVerify && can('payment.confirm') ? (
              <Button className="min-h-11 bg-espresso text-cream hover:bg-espresso-soft" disabled={busy} onClick={() => setVerifyOpen(true)}>
                <ShieldAlert className="mr-2 h-4 w-4" aria-hidden /> Konfirmasi QRIS
              </Button>
            ) : canPay ? (
              <Button className="min-h-11 bg-espresso text-cream hover:bg-espresso-soft" disabled={busy} onClick={() => setChargeOpen(true)}>
                <Banknote className="mr-2 h-4 w-4" aria-hidden /> Terima Pembayaran
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="space-y-4 md:space-y-6 lg:col-span-2">
          {/* Items */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Item Pesanan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {order.items.map((item) => {
                const done = item.checkedCount >= item.qty
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-start justify-between gap-3 rounded-xl border p-3',
                      item.isVoided && 'opacity-50'
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className={cn('font-medium', item.isVoided && 'line-through')}>
                        {item.qty}× {item.name}
                      </p>
                      {item.variantLabels.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.variantLabels.map((v, i) => (
                            <span key={i} className="rounded bg-cream px-1.5 py-0.5 text-[11px] text-espresso-deep dark:bg-cream-deep dark:text-caramel-pale">
                              {v}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.note && (
                        <p className="text-xs font-semibold uppercase tracking-wide text-warning">{item.note}</p>
                      )}
                      {item.isVoided ? (
                        <p className="text-xs text-destructive">Dibatalkan — {item.voidReason}</p>
                      ) : (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                            done ? 'bg-success/15 text-success' : 'bg-caramel/15 text-warning'
                          )}
                        >
                          <CheckCheck className="h-3 w-3" aria-hidden />
                          {item.checkedCount}/{item.qty} dicentang
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Money value={item.lineTotal} className="text-sm font-semibold" />
                      {canVoid && !item.isVoided && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Menu item">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setVoidItem(item)
                                setVoidReason(VOID_REASONS[0])
                                setVoidNote('')
                              }}
                            >
                              <XCircle className="mr-2 h-4 w-4" aria-hidden /> Batalkan Item
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                )
              })}
              {order.note && (
                <div className="rounded-xl bg-cream p-3 text-sm dark:bg-cream-deep">
                  <span className="font-semibold">Catatan pesanan:</span> {order.note}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payments */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pembayaran</CardTitle>
            </CardHeader>
            <CardContent>
              {order.payments.length === 0 ? (
                <EmptyPanel
                  title="Belum dibayar"
                  description="Pesanan ini belum menerima pembayaran — gunakan tombol Terima Pembayaran."
                />
              ) : (
                <div className="space-y-2">
                  {order.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                      <div className="space-y-0.5">
                        <p className="font-medium">
                          {p.method === 'CASH' ? 'Tunai' : 'QRIS'} · <PaymentBadge status={p.status} />
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.verifiedBy ? `Diverifikasi ${p.verifiedBy}` : 'Belum diverifikasi'} · {formatDateTime(p.paidAt)}
                          {p.cashReceived !== null && p.cashReceived !== undefined
                            ? ` · Diterima ${formatIDR(p.cashReceived)}, kembali ${formatIDR(p.changeDue ?? 0)}`
                            : ''}
                          {p.qrReference ? ` · Ref ${p.qrReference}` : ''}
                        </p>
                      </div>
                      <Money value={p.amount} className="font-semibold" />
                    </div>
                  ))}
                  {pendingVerify && (
                    <Alert>
                      <BellRing className="h-4 w-4" aria-hidden />
                      <AlertTitle>Menunggu verifikasi QRIS</AlertTitle>
                      <AlertDescription>
                        Pelanggan mengaku sudah membayar. Periksa mutasi di aplikasi merchant sebelum
                        mengonfirmasi — bukti tangkapan layar bisa dipalsukan.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 md:space-y-6">
          {/* Totals */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Rincian Biaya</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <Money value={order.subtotal} />
              </div>
              {order.discountTotal > 0 && (
                <div className="flex justify-between text-success">
                  <span>Diskon{order.discountReason ? ` — ${order.discountReason}` : ''}</span>
                  <Money value={-order.discountTotal} />
                </div>
              )}
              {order.deliveryFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ongkir antar</span>
                  <Money value={order.deliveryFee} />
                </div>
              )}
              {order.taxTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pajak</span>
                  <Money value={order.taxTotal} />
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <Money value={order.total} />
              </div>
            </CardContent>
          </Card>

          {/* Delivery / customer info */}
          {order.type === 'DELIVERY' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Info Antar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="flex items-center gap-2">
                  <User className="h-4 w-4 text-caramel" aria-hidden /> {order.customerName ?? '—'}
                </p>
                {order.customerPhone && (
                  <a
                    className="flex min-h-11 items-center gap-2 text-caramel hover:underline"
                    href={`https://wa.me/${waDigits(order.customerPhone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Phone className="h-4 w-4" aria-hidden /> {order.customerPhone}
                  </a>
                )}
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-caramel" aria-hidden /> {order.deliveryLocation ?? '—'}
                </p>
                <div className="flex items-center gap-2">
                  <Bike className="h-4 w-4 text-caramel" aria-hidden />
                  {order.status === 'READY' && !order.courierName ? (
                    <span className="flex flex-1 items-center gap-2">
                      <Input
                        value={courier}
                        onChange={(e) => setCourier(e.target.value)}
                        placeholder="Nama kurir…"
                        className="min-h-11 flex-1"
                        aria-label="Nama kurir"
                      />
                      <Button
                        size="sm"
                        className="min-h-11"
                        disabled={!courier.trim() || busy}
                        onClick={async () => {
                          await post(`/api/orders/${order.id}/courier`, { name: courier.trim() })
                          toast.success(`Kurir: ${courier.trim()}`)
                        }}
                      >
                        Simpan
                      </Button>
                    </span>
                  ) : (
                    <span>{order.courierName ?? 'Belum ditentukan'}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Linimasa</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l-2 border-caramel/40 pl-5">
                {steps.map((step, i) => {
                  const reached = !!step.at
                  const isLast = i === steps.length - 1 || (reached && i === steps.findLastIndex((s) => !!s.at))
                  return (
                    <li key={`${step.status}-${i}`} className="relative">
                      <span
                        className={cn(
                          'absolute -left-[27px] top-0.5 h-3.5 w-3.5 rounded-full border-2',
                          reached
                            ? isLast
                              ? 'animate-pulse border-caramel bg-caramel'
                              : 'border-espresso bg-espresso'
                            : 'border-muted bg-background'
                        )}
                        aria-hidden
                      />
                      <p className={cn('text-sm font-medium', !reached && 'text-muted-foreground')}>{step.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {step.at ? formatDateTime(step.at) : '—'}
                        {step.by ? ` · oleh ${step.by}` : ''}
                      </p>
                    </li>
                  )
                })}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-16 z-20 lg:bottom-4">
        <Card className="border-caramel/40 shadow-lg">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            {/* Fulfillment */}
            {['PAID', 'PREPARING'].includes(order.status) && canMarkReady && (
              <Button
                className="min-h-11 bg-caramel text-espresso-deep hover:bg-caramel-light"
                disabled={busy}
                onClick={async () => {
                  try {
                    await post(`/api/orders/${order.id}/status`, { status: 'READY' })
                    toast.success(`${order.code} siap diambil`)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Gagal menandai siap')
                  }
                }}
              >
                <CheckCheck className="mr-2 h-4 w-4" aria-hidden /> Tandai Siap
              </Button>
            )}
            {order.status === 'READY' && order.type !== 'DELIVERY' && canServe && (
              <Button
                className="min-h-11 bg-success text-white hover:bg-success/90"
                disabled={busy}
                onClick={async () => {
                  await post(`/api/orders/${order.id}/status`, { status: 'COMPLETED' })
                  toast.success(`${order.code} selesai`)
                }}
              >
                <CheckCheck className="mr-2 h-4 w-4" aria-hidden /> Sudah Diserahkan
              </Button>
            )}
            {order.status === 'READY' && order.type === 'DELIVERY' && canServe && (
              <Button
                className="min-h-11 bg-caramel text-espresso-deep hover:bg-caramel-light"
                disabled={busy || !order.courierName}
                onClick={async () => {
                  await post(`/api/orders/${order.id}/status`, { status: 'OUT_FOR_DELIVERY' })
                  toast.success(`${order.code} sedang diantar`)
                }}
              >
                <Bike className="mr-2 h-4 w-4" aria-hidden /> Antar
              </Button>
            )}
            {order.status === 'OUT_FOR_DELIVERY' && canServe && (
              <Button
                className="min-h-11 bg-success text-white hover:bg-success/90"
                disabled={busy}
                onClick={async () => {
                  await post(`/api/orders/${order.id}/status`, { status: 'COMPLETED' })
                  toast.success(`${order.code} tiba di tujuan`)
                }}
              >
                <CheckCheck className="mr-2 h-4 w-4" aria-hidden /> Tiba
              </Button>
            )}

            {/* Receipts */}
            <Button variant="outline" className="min-h-11" onClick={() => void doReprint('RECEIPT')}>
              <Printer className="mr-2 h-4 w-4" aria-hidden /> Cetak Struk
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => void doReprint('KOT')}>
              <ReceiptText className="mr-2 h-4 w-4" aria-hidden /> Cetak KOT
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => void sendWhatsApp()}>
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden /> Kirim WhatsApp
            </Button>

            {/* Destructive */}
            {canCancel && (
              <Button
                variant="destructive"
                className="ml-auto min-h-11"
                onClick={() => {
                  setCancelReason(CANCEL_REASONS[0])
                  setCancelNote('')
                  setCancelOpen(true)
                }}
              >
                <Ban className="mr-2 h-4 w-4" aria-hidden /> Batalkan Pesanan
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charge dialog */}
      {settings && (
        <ChargeDialog
          open={chargeOpen}
          onOpenChange={setChargeOpen}
          total={order.total}
          settings={settings}
          title="Terima Pembayaran"
          subtitle={`${order.code} · ${ORDER_TYPE_LABEL[order.type]}`}
          onSubmit={async (payment): Promise<ChargeResult> => {
            const updated = await apiFetch<OrderDTO>(`/api/orders/${order.id}/payment`, {
              method: 'POST',
              body: JSON.stringify(payment),
            })
            invalidate()
            return {
              order: updated,
              printKot: !!settings.receipts.autoPrintKot && updated.status === 'PAID',
              printReceipt: !!settings.receipts.autoPrintReceipt,
            }
          }}
        />
      )}

      {/* QRIS verify dialog */}
      {settings && (
        <QrisVerifyDialog
          open={verifyOpen}
          onOpenChange={setVerifyOpen}
          orderCode={order.code}
          amount={order.total}
          buyerRef={order.payments.find((p) => p.status === 'PENDING_VERIFICATION')?.qrReference ?? null}
          reminderText={settings.payments.qrisReminderText}
          settings={settings}
          busy={busy}
          onConfirm={async () => {
            const updated = await post(`/api/orders/${order.id}/payment-verify`, { action: 'CONFIRM' })
            toast.success(`Pembayaran ${order.code} terverifikasi`)
            return updated
          }}
          onReject={async (note) => {
            await post(`/api/orders/${order.id}/payment-verify`, { action: 'REJECT', note })
            toast.success(`Pembayaran ${order.code} ditolak — pesanan kembali belum bayar`)
            setVerifyOpen(false)
          }}
        />
      )}

      {/* Cancel dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan {order.code}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{cancelImpactText(order)}</p>
                <div className="space-y-2">
                  <Label htmlFor="cancel-reason">Alasan pembatalan</Label>
                  <Select value={cancelReason} onValueChange={setCancelReason}>
                    <SelectTrigger id="cancel-reason" className="min-h-11">
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
                  <Input
                    id="cancel-note"
                    value={cancelNote}
                    onChange={(e) => setCancelNote(e.target.value)}
                    placeholder="Catatan tambahan (opsional)"
                    className="min-h-11"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-white hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault()
                try {
                  await post(`/api/orders/${order.id}/cancel`, {
                    reason: composeReason(cancelReason, cancelNote),
                  })
                  toast.success(`${order.code} dibatalkan`)
                  setCancelOpen(false)
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Gagal membatalkan')
                }
              }}
            >
              Ya, Batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Void item dialog */}
      <AlertDialog open={!!voidItem} onOpenChange={(o) => !o && setVoidItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan item “{voidItem?.name}”?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Item hilang dari antrean dapur dan perhitungan stok, tercatat di laporan void dengan
                  namamu. Nilai: {voidItem ? formatIDR(voidItem.lineTotal) : ''}.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="void-reason">Alasan</Label>
                  <Select value={voidReason} onValueChange={setVoidReason}>
                    <SelectTrigger id="void-reason" className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VOID_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="void-note"
                    value={voidNote}
                    onChange={(e) => setVoidNote(e.target.value)}
                    placeholder="Catatan tambahan (opsional)"
                    className="min-h-11"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-white hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault()
                if (!voidItem) return
                try {
                  await post(`/api/orders/${order.id}/void-item`, {
                    itemId: voidItem.id,
                    reason: composeReason(voidReason, voidNote),
                  })
                  toast.success(`Item "${voidItem.name}" dibatalkan`)
                  setVoidItem(null)
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Gagal membatalkan item')
                }
              }}
            >
              Ya, Batalkan Item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
