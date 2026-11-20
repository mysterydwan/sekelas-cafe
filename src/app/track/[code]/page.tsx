'use client'

// `/track/[code]` — order tracking (SPEC §3.2): live stepper, HUGE ready code,
// order summary, invalid-code recovery. 30s polling + WS push.
// Fully localized (id / jv-Krama Alus / en).
import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Bike,
  ChevronLeft,
  Copy,
  MapPin,
  ReceiptText,
  RefreshCw,
  SearchX,
  ShoppingBag,
  UtensilsCrossed,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch, ApiError } from '@/lib/client'
import { formatIDR, formatTime } from '@/lib/format'
import {
  formatDateTimeLocalized,
  orderTypeLabel,
  useI18n,
} from '@/lib/i18n'
import type { OrderDTO, OrderItemDTO, PublicSettingsDTO } from '@/lib/types'
import { useRealtime } from '@/hooks/use-realtime'
import { SiteHeader } from '@/components/public/site-header'
import { SiteFooter } from '@/components/public/site-footer'
import { ConnectionBanner } from '@/components/public/connection-banner'
import { useOpenStatus } from '@/components/public/open-status'
import { OrderStepper } from '@/components/public/order-stepper'
import { OrderStatusChip, PaymentChip } from '@/components/public/badges'
import { CodeInput } from '@/components/public/code-input'
import { ORDER_CODE_RE } from '@/components/public/utils'

export default function TrackOrderPage() {
  const { t } = useI18n()
  const params = useParams<{ code: string }>()
  const raw = Array.isArray(params.code) ? params.code[0] : params.code
  const code = decodeURIComponent(raw ?? '').toUpperCase()
  const router = useRouter()

  const settingsQuery = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => apiFetch<PublicSettingsDTO>('/api/public/settings'),
    staleTime: 5 * 60_000,
  })
  const { status: openStatus } = useOpenStatus(settingsQuery.data?.hours)

  const query = useQuery({
    queryKey: ['public-order', code],
    queryFn: () => apiFetch<OrderDTO>(`/api/public/orders/${encodeURIComponent(code)}`),
    refetchInterval: 30_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false
      return failureCount < 2
    },
  })

  // Live: any status/payment event for this order triggers a silent refetch
  useRealtime(['order:status', 'payment:updated'], (_event, payload) => {
    if (payload.code === code) void query.refetch()
  })

  const copyCode = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(t('confirm.copied'))
    } catch {
      toast.error(t('confirm.copyFailed'))
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-cream text-foreground">
      <SiteHeader settings={settingsQuery.data} openStatus={openStatus} />
      <ConnectionBanner />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> {t('track.back')}
        </Link>

        {query.isLoading ? (
          <TrackSkeleton />
        ) : query.isError || !query.data ? (
          <NotFoundView
            code={ORDER_CODE_RE.test(code) ? code : ''}
            message={
              query.error instanceof ApiError && query.error.status === 404
                ? t('track.notFoundHint')
                : t('track.loadFail')
            }
            canRetry={!(query.error instanceof ApiError && query.error.status === 404)}
            onRetry={() => void query.refetch()}
            onGo={(next) => router.push(`/track/${next}`)}
          />
        ) : (
          <OrderView order={query.data} updatedAt={query.dataUpdatedAt} onCopy={copyCode} />
        )}
      </main>

      <SiteFooter settings={settingsQuery.data} />
    </div>
  )
}

// ---------- Loaded view ----------

function OrderView({
  order,
  updatedAt,
  onCopy,
}: {
  order: OrderDTO
  updatedAt: number
  onCopy: (code: string) => void
}) {
  const { lang, t } = useI18n()
  const isReady = order.status === 'READY'
  const pendingVerification = order.paymentStatus === 'PENDING_VERIFICATION'
  const rejectedPayment = order.paymentStatus === 'REJECTED'

  return (
    <div className="mt-4 space-y-4">
      {/* Header card */}
      <section
        className="rounded-2xl border border-border/70 bg-background p-5"
        aria-label={t('track.codeLabel')}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-2xl font-bold tabular-nums tracking-wide text-foreground">
              {order.code}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
              <TypeBadge type={order.type} tableLabel={order.tableLabel} />
              <span>{t('track.createdAt', { time: formatDateTimeLocalized(lang, order.createdAt) })}</span>
            </p>
          </div>
          <OrderStatusChip status={order.status} />
        </div>
        <p className="mt-3 border-t border-dashed border-border pt-3 text-[11px] text-muted-foreground">
          {t('track.lastUpdated', { time: formatTime(new Date(updatedAt)) })}
        </p>
      </section>

      {/* HUGE ready code — at-a-glance counter pickup */}
      {isReady && (
        <motion.section
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          aria-label={t('track.showCodeAtCounter')}
          className="rounded-2xl bg-espresso-deep p-7 text-center shadow-lg md:p-9"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#F0E7DA]/60">
            {t('track.showCodeAtCounter')}
          </p>
          <button
            type="button"
            onClick={() => onCopy(order.code)}
            aria-label={`${t('confirm.copyCode')} ${order.code}`}
            className="mt-2 inline-flex items-center gap-3 font-mono text-5xl font-bold tabular-nums tracking-wider text-[#D9A441] transition-transform active:scale-[0.97] md:text-6xl"
          >
            {order.code}
            <Copy className="size-6 opacity-50" />
          </button>
          <p className="mt-3 text-sm text-[#F0E7DA]/70">{t('track.readyHint')}</p>
        </motion.section>
      )}

      {/* Verification banners */}
      {pendingVerification && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3.5 text-sm text-warning"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold">{t('track.pendingVerificationTitle')}</strong>{' '}
            {t('track.pendingVerificationBody')}
          </span>
        </div>
      )}
      {rejectedPayment && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3.5 text-sm text-danger"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold">{t('track.rejectedTitle')}</strong>{' '}
            {t('track.rejectedBody')}
          </span>
        </div>
      )}

      {/* Cancelled banner */}
      {order.status === 'CANCELLED' && (
        <div
          role="alert"
          className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3.5 text-sm text-danger"
        >
          <strong className="font-semibold">{t('track.cancelledTitle')}</strong>
          {order.cancelReason ? ` ${t('track.reasonLabel')}: ${order.cancelReason}` : ''}
        </div>
      )}

      {/* Stepper */}
      <section
        className="rounded-2xl border border-border/70 bg-background p-5"
        aria-label={t('track.statusTitle')}
      >
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t('track.statusTitle')}
        </h2>
        <OrderStepper order={order} />
      </section>

      {/* Delivery info */}
      {order.type === 'DELIVERY' && (
        <section
          className="rounded-2xl border border-border/70 bg-background p-5"
          aria-label={t('track.deliveryTitle')}
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t('track.deliveryTitle')}
          </h2>
          <ul className="space-y-2.5 text-sm">
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-caramel" />
              <span>{order.deliveryLocation || '—'}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Bike className="mt-0.5 size-4 shrink-0 text-caramel" />
              <span>
                {order.courierName
                  ? t('track.courierAssigned', { name: order.courierName })
                  : t('track.courierPending')}
              </span>
            </li>
          </ul>
        </section>
      )}

      {/* Summary */}
      <section
        className="rounded-2xl border border-border/70 bg-background p-5"
        aria-label={t('track.summaryTitle')}
      >
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <ReceiptText className="size-4 text-caramel" /> {t('track.summaryTitle')}
        </h2>

        <ul className="space-y-3.5">
          {order.items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>

        <div className="mt-5 space-y-1.5 border-t border-dashed border-border pt-4 text-sm">
          <SummaryRow label={t('cart.subtotal')} value={formatIDR(order.subtotal)} />
          {order.discountTotal > 0 && (
            <SummaryRow
              label={`${t('track.discount')}${order.discountReason ? ` (${order.discountReason})` : ''}`}
              value={`−${formatIDR(order.discountTotal)}`}
            />
          )}
          {order.deliveryFee > 0 && (
            <SummaryRow label={t('track.deliveryFee')} value={formatIDR(order.deliveryFee)} />
          )}
          {order.taxTotal > 0 && <SummaryRow label={t('track.tax')} value={formatIDR(order.taxTotal)} />}
          <div className="flex justify-between pt-1.5 text-base font-bold">
            <span>{t('cart.total')}</span>
            <span className="font-mono tabular-nums">{formatIDR(order.total)}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">
            {order.payments.length === 0
              ? t('track.payAtCounter')
              : order.payments.map((p) => p.method).join(' + ') +
                (order.payments[0]?.qrReference ? ` · ${order.payments[0].qrReference}` : '')}
          </span>
          <PaymentChip status={order.paymentStatus} />
        </div>

        {order.note && (
          <p className="mt-3 rounded-xl bg-cream-deep px-3.5 py-2.5 text-xs italic text-muted-foreground dark:bg-espresso-soft/25">
            {t('track.noteLabel')}: “{order.note}”
          </p>
        )}
      </section>
    </div>
  )
}

function ItemRow({ item }: { item: OrderItemDTO }) {
  const { t } = useI18n()
  return (
    <li className={item.isVoided ? 'opacity-50' : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-medium ${item.isVoided ? 'line-through' : ''}`}>
            {item.name} <span className="font-normal text-muted-foreground">× {item.qty}</span>
          </p>
          {item.variantLabels.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {item.variantLabels.map((v, i) => (
                <span
                  key={i}
                  className="rounded-md bg-cream-deep px-1.5 py-0.5 text-[10px] text-muted-foreground dark:bg-espresso-soft/40"
                >
                  {v}
                </span>
              ))}
            </p>
          )}
          {item.note && <p className="mt-1 text-xs italic text-muted-foreground">“{item.note}”</p>}
          {item.isVoided && (
            <p className="mt-1 text-xs text-danger">
              {t('track.voided')}
              {item.voidReason ? ` — ${item.voidReason}` : ''}
            </p>
          )}
        </div>
        <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
          {formatIDR(item.lineTotal)}
        </span>
      </div>
    </li>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
  )
}

function TypeBadge({ type, tableLabel }: { type: OrderDTO['type']; tableLabel: string | null }) {
  const { lang } = useI18n()
  const icon =
    type === 'DINE_IN' ? (
      <UtensilsCrossed className="size-3.5 text-caramel" />
    ) : type === 'TAKE_AWAY' ? (
      <ShoppingBag className="size-3.5 text-caramel" />
    ) : (
      <Bike className="size-3.5 text-caramel" />
    )
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-deep px-2.5 py-1 text-[11px] font-medium dark:bg-espresso-soft/40">
      {icon}
      {orderTypeLabel(lang, type, tableLabel)}
    </span>
  )
}

// ---------- Not found / error ----------

function NotFoundView({
  code,
  message,
  canRetry,
  onRetry,
  onGo,
}: {
  code: string
  message: string
  canRetry: boolean
  onRetry: () => void
  onGo: (code: string) => void
}) {
  const { t } = useI18n()
  const [input, setInput] = useState('')
  const valid = ORDER_CODE_RE.test(input)

  return (
    <div className="flex flex-col items-center gap-5 py-14 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-cream-deep dark:bg-espresso-soft/30">
        <SearchX className="size-7 text-muted-foreground" />
      </span>
      <div>
        <h1 className="font-display text-2xl">{t('track.notFoundTitle')}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{message}</p>
        {code && (
          <p className="mt-1 font-mono text-xs text-muted-foreground/70">
            {t('track.codeLabel')}: <span className="font-semibold">{code}</span>
          </p>
        )}
      </div>

      <div className="w-full max-w-xs space-y-3">
        <CodeInput value={input} onChange={setInput} onSubmit={() => valid && onGo(input)} />
        <Button
          type="button"
          disabled={!valid}
          onClick={() => onGo(input)}
          className="h-11 w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {t('track.trackBtn')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {canRetry && (
          <Button type="button" variant="outline" onClick={onRetry} className="h-11 rounded-full px-5">
            <RefreshCw className="size-4" /> {t('common.retry')}
          </Button>
        )}
        <Button asChild variant="link" className="h-11 rounded-full px-5">
          <Link href="/">{t('track.back')}</Link>
        </Button>
      </div>
    </div>
  )
}

// ---------- Skeleton ----------

function TrackSkeleton() {
  return (
    <div className="mt-4 space-y-4" aria-hidden="true">
      <div className="space-y-3 rounded-2xl border border-border/70 bg-background p-5">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-32 w-full rounded-2xl" />
      <div className="space-y-4 rounded-2xl border border-border/70 bg-background p-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  )
}
