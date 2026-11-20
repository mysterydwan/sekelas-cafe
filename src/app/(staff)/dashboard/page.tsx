'use client'

// /dashboard (SPEC §3.5): role-aware KPI cards (tap-through), quick actions,
// alerts panel w/ per-session dismiss, live feed, hourly revenue chart.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CalendarX,
  ChefHat,
  CheckCircle2,
  FileSpreadsheet,
  History,
  Package,
  QrCode,
  ReceiptText,
  RefreshCw,
  ShoppingCart,
  TriangleAlert,
  Trophy,
  Wallet,
  X,
} from 'lucide-react'
import { apiFetch, ApiError } from '@/lib/client'
import { useSession } from '@/hooks/use-session'
import { useRealtime } from '@/hooks/use-realtime'
import { formatIDR, formatTime } from '@/lib/format'
import type { DashboardDTO } from '@/lib/types'
import { PageGuard } from '@/components/staff/page-guard'
import { PageHeader, StatCard, EmptyState, CardsSkeleton } from '@/components/staff/primitives'
import { HourlyRevenueChart } from '@/components/staff/dashboard/hourly-chart'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'sekelas-dashboard-dismissed'

const QUICK_ICONS: { match: RegExp; icon: typeof ShoppingCart }[] = [
  { match: /Baru/i, icon: ShoppingCart },
  { match: /Ditahan/i, icon: ReceiptText },
  { match: /QRIS/i, icon: QrCode },
  { match: /Laporan/i, icon: BarChart3 },
  { match: /Impor/i, icon: FileSpreadsheet },
  { match: /Produk/i, icon: Package },
  { match: /Dapur/i, icon: ChefHat },
  { match: /Stok/i, icon: Boxes },
]

type DashboardAlert = DashboardDTO['alerts'][number]
type AlertKind = DashboardAlert['kind']

const ALERT_ICONS: Record<AlertKind, typeof Boxes> = {
  LOW_STOCK: Boxes,
  PENDING_QRIS: QrCode,
  UNPAID: Wallet,
  UNCLOSED_DAY: CalendarX,
  STOCK_SHORTFALL: TriangleAlert,
  AUTO_CLOSED_DAY: History,
}

const ALERT_FIX_LABEL: Record<AlertKind, string> = {
  LOW_STOCK: 'Sesuaikan',
  PENDING_QRIS: 'Verifikasi',
  UNPAID: 'Tagih',
  UNCLOSED_DAY: 'Tutup hari',
  STOCK_SHORTFALL: 'Cek stok',
  AUTO_CLOSED_DAY: 'Lihat',
}

/** Amber “act now” styling for operational alerts; muted info for FYI history. */
const ALERT_TONE: Record<AlertKind, 'warning' | 'info'> = {
  LOW_STOCK: 'warning',
  PENDING_QRIS: 'warning',
  UNPAID: 'warning',
  UNCLOSED_DAY: 'warning',
  STOCK_SHORTFALL: 'warning',
  AUTO_CLOSED_DAY: 'info',
}

function DashboardContent() {
  const router = useRouter()
  const { user } = useSession()
  const [dismissed, setDismissed] = useState<string[]>([])

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(DISMISS_KEY)
        if (raw) setDismissed(JSON.parse(raw) as string[])
      } catch {
        /* ignore malformed storage */
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const { data, error, refetch, isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch<DashboardDTO>('/api/dashboard'),
    refetchInterval: 30_000,
  })

  // Honest error state: not loading and still nothing to show → say so with a
  // retry, instead of rendering the “Semua aman” empty-alerts fallback.
  const loadFailed = !isPending && !data

  useRealtime(['order:created', 'order:status', 'payment:updated'], () => {
    void refetch()
  })

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      toast.error('Sesi berakhir — masuk kembali')
      router.replace('/login')
    }
  }, [error, router])

  const dismiss = (id: string) => {
    const next = [...dismissed, id]
    setDismissed(next)
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify(next))
    } catch {
      /* storage full/unavailable — session-only dismiss still applies */
    }
  }

  const visibleAlerts = useMemo(
    () => (data?.alerts ?? []).filter((a) => !dismissed.includes(a.id)),
    [data, dismissed]
  )
  const hasWarningAlerts = visibleAlerts.some((a) => ALERT_TONE[a.kind] === 'warning')

  const isBarista = user?.role === 'BARISTA'
  const firstName = user?.name?.split(' ')[0] ?? ''

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <PageHeader
        title={`Hai, ${firstName}`}
        description={
          isBarista
            ? 'Pantau antrean dapur dan stok bahan di sini.'
            : 'Ringkasan operasional kafe hari ini — semuanya hidup real-time.'
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="min-h-[44px]">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden /> Segarkan
          </Button>
        }
      />

      {loadFailed && (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertTitle>Gagal memuat dashboard</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Data tidak berhasil dimuat — coba lagi.'}
            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => void refetch()}>
              Coba Lagi
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Quick actions */}
      <section aria-label="Aksi cepat">
        <div className="flex flex-wrap gap-2">
          {(data?.quickActions ?? []).map((qa) => {
            const Icon = QUICK_ICONS.find((q) => q.match.test(qa.label))?.icon ?? ArrowRight
            const badge = /QRIS \((\d+)\)/.exec(qa.label)
            return (
              <Link
                key={qa.label}
                href={qa.href}
                className={cn(
                  'flex min-h-[44px] items-center gap-2 rounded-xl border bg-card px-4 text-sm font-medium shadow-sm transition-all hover:border-caramel hover:shadow-md active:scale-[0.98]',
                  badge && Number(badge[1]) > 0 && 'border-caramel/60 bg-caramel/10'
                )}
              >
                <Icon className="h-4 w-4 text-caramel" aria-hidden />
                {badge ? qa.label.replace(/\(\d+\)/, '') : qa.label}
                {badge && Number(badge[1]) > 0 && (
                  <span className="rounded-full bg-warning px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                    {badge[1]}
                  </span>
                )}
              </Link>
            )
          })}
          {isPending &&
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 w-36 rounded-xl" />)}
        </div>
      </section>

      {/* KPI cards */}
      <section aria-label="Ringkasan hari ini">
        {isPending ? (
          <CardsSkeleton count={4} />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {data?.kpis.map((kpi) => (
              <StatCard
                key={kpi.label}
                label={kpi.label}
                value={kpi.value}
                hint={kpi.hint}
                onClick={kpi.href ? () => router.push(kpi.href!) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        {/* Left: chart + top products (ADMIN/CASHIER) / feed focus for BARISTA */}
        <div className="min-w-0 space-y-4 lg:space-y-6">
          {!isBarista && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Pendapatan per Jam</CardTitle>
              </CardHeader>
              <CardContent>
                <HourlyRevenueChart hourly={data?.hourly ?? []} loading={isPending} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-caramel" aria-hidden /> Produk Terlaris
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : loadFailed ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Gagal memuat — coba lagi lewat tombol Segarkan.
                </p>
              ) : (data?.topProducts.length ?? 0) === 0 ? (
                <EmptyState
                  title="Belum ada produk terjual"
                  description="Daftar ini terisi saat pesanan pertama masuk."
                  icon={<Package className="h-8 w-8" aria-hidden />}
                />
              ) : (
                <ol className="space-y-1.5">
                  {data?.topProducts.map((p, i) => (
                    <li
                      key={p.name}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-cream/60 dark:hover:bg-secondary/50"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cream font-mono text-xs font-bold text-espresso dark:bg-secondary dark:text-caramel-light">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.qty} terjual</span>
                      <span className="font-mono text-sm font-semibold tabular-nums">{formatIDR(p.revenue)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: alerts + live feed */}
        <div className="min-w-0 space-y-4 lg:space-y-6">
          <Card className={hasWarningAlerts ? 'border-warning/40' : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> Perlu Perhatian
                {visibleAlerts.length > 0 && (
                  <span className="rounded-full bg-warning px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                    {visibleAlerts.length}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : loadFailed ? (
                <div
                  role="alert"
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
                >
                  <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                  Peringatan belum termuat.
                  <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => void refetch()}>
                    Coba Lagi
                  </Button>
                </div>
              ) : visibleAlerts.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-success">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                  Semua aman — tidak ada yang perlu ditindak sekarang.
                </div>
              ) : (
                <ul className="max-h-96 space-y-2 overflow-y-auto scrollbar-warm" aria-label="Daftar peringatan">
                  <AnimatePresence initial={false}>
                    {visibleAlerts.map((alert) => {
                      const Icon = ALERT_ICONS[alert.kind]
                      const info = ALERT_TONE[alert.kind] === 'info'
                      return (
                        <motion.li
                          key={alert.id}
                          layout
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 24 }}
                          className={cn(
                            'flex items-start gap-3 rounded-xl border px-3 py-2.5',
                            info ? 'border-border bg-muted/40' : 'border-transparent bg-cream/40 dark:bg-secondary/30'
                          )}
                        >
                          <Icon
                            className={cn('mt-0.5 h-5 w-5 shrink-0', info ? 'text-muted-foreground' : 'text-warning')}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-snug">{alert.label}</p>
                            <p className="truncate text-xs text-muted-foreground">{alert.detail}</p>
                          </div>
                          <Link
                            href={alert.href}
                            className="shrink-0 self-center rounded-lg border border-caramel/50 px-2.5 py-1.5 text-xs font-semibold text-espresso transition-colors hover:bg-caramel/15 dark:text-caramel-light"
                          >
                            {ALERT_FIX_LABEL[alert.kind]}
                          </Link>
                          <button
                            type="button"
                            onClick={() => dismiss(alert.id)}
                            className="self-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label={`Abaikan peringatan ${alert.label} (sesi ini saja)`}
                          >
                            <X className="h-4 w-4" aria-hidden />
                          </button>
                        </motion.li>
                      )
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Aktivitas Terbaru</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              ) : loadFailed ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Gagal memuat — coba lagi lewat tombol Segarkan.
                </p>
              ) : (data?.feed.length ?? 0) === 0 ? (
                <EmptyState
                  title="Belum ada aktivitas hari ini"
                  description="Aktivitas tim akan muncul di sini secara langsung."
                />
              ) : (
                <ul className="max-h-96 space-y-1 overflow-y-auto scrollbar-warm" aria-label="Aktivitas terbaru">
                  <AnimatePresence initial={false}>
                    {data?.feed.map((item, i) => (
                      <motion.li
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-baseline gap-3 px-1 py-1.5 text-sm"
                      >
                        <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                          {formatTime(item.at)}
                        </span>
                        <span className={cn('min-w-0 flex-1', i === 0 && 'font-medium')}>{item.label}</span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <PageGuard page="dashboard">
      <DashboardContent />
    </PageGuard>
  )
}
