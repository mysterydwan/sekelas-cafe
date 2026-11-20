'use client'

// /reports — Reports & Analytics (SPEC §3.12): date-range presets + custom,
// vs-previous-period compare, and 7 analysis tabs. Cashier (no report.viewAll)
// is server-clamped to today — the UI shows a lock note and freezes the range.
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Boxes,
  Clock3,
  Coffee,
  Download,
  LayoutList,
  Lock,
  Printer,
  RefreshCw,
  UtensilsCrossed,
  Wallet,
  XCircle,
} from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { addDaysJakarta, formatDate, formatIDR, formatNumber, jakartaDayIndex, todayJakarta } from '@/lib/format'
import { useSession } from '@/hooks/use-session'
import { useRealtime } from '@/hooks/use-realtime'
import { PageGuard } from '@/components/staff/page-guard'
import { EmptyState, PageHeader } from '@/components/staff/primitives'
import type { ReportSummaryDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toastDownload } from '@/components/reporting/download'
import { PrintSheet, PrintTable } from '@/components/reporting/print-sheet'
import {
  HoursTab,
  PaymentsTab,
  ProductsTab,
  StockTab,
  SummaryGrid,
  TypesTab,
  VoidsTab,
} from '@/components/reporting/report-tabs'

const TAB_DEFS = [
  { value: 'ringkasan', label: 'Ringkasan', icon: LayoutList },
  { value: 'produk', label: 'Produk', icon: Coffee },
  { value: 'pembayaran', label: 'Pembayaran', icon: Wallet },
  { value: 'jam', label: 'Jam', icon: Clock3 },
  { value: 'tipe', label: 'Tipe', icon: UtensilsCrossed },
  { value: 'void', label: 'Void', icon: XCircle },
  { value: 'stok', label: 'Stok', icon: Boxes },
] as const

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to + 'T12:00:00Z').getTime() - new Date(from + 'T12:00:00Z').getTime()) / 86_400_000
  )
}

export default function ReportsPage() {
  return (
    <PageGuard page="/reports">
      <ReportsInner />
    </PageGuard>
  )
}

function ReportsInner() {
  const qc = useQueryClient()
  const { can } = useSession()
  const viewAll = can('report.viewAll')

  const [tab, setTab] = useState<string>('ringkasan')
  const [from, setFrom] = useState(() => todayJakarta())
  const [to, setTo] = useState(() => todayJakarta())

  const presets = useMemo(() => {
    const t = todayJakarta()
    const mondayOffset = (jakartaDayIndex() + 6) % 7
    return [
      { key: 'today', label: 'Hari ini', from: t, to: t },
      { key: 'yesterday', label: 'Kemarin', from: addDaysJakarta(t, -1), to: addDaysJakarta(t, -1) },
      { key: 'week', label: 'Minggu ini', from: addDaysJakarta(t, -mondayOffset), to: t },
      { key: 'month', label: 'Bulan ini', from: `${t.slice(0, 7)}-01`, to: t },
    ]
  }, [])
  const activePreset = presets.find((p) => p.from === from && p.to === to) ?? null

  // Previous period of the same length, ending the day before `from`.
  const prevRange = useMemo(() => {
    const days = daysBetween(from, to)
    const prevTo = addDaysJakarta(from, -1)
    return { from: addDaysJakarta(prevTo, -days), to: prevTo }
  }, [from, to])

  const summaryQ = useQuery({
    queryKey: ['reports', 'summary', from, to],
    queryFn: () => apiFetch<ReportSummaryDTO>(`/api/reports/summary?from=${from}&to=${to}`),
  })
  const prevQ = useQuery({
    queryKey: ['reports', 'summary', prevRange.from, prevRange.to],
    queryFn: () => apiFetch<ReportSummaryDTO>(`/api/reports/summary?from=${prevRange.from}&to=${prevRange.to}`),
    enabled: viewAll,
  })

  // Z-close elsewhere refreshes the numbers here (polling covers the rest).
  useRealtime(['day:closed'], () => {
    void qc.invalidateQueries({ queryKey: ['reports'] })
  })

  const s = summaryQ.data
  const isEmpty = !!s && s.orderCount === 0 && s.itemCount === 0

  function setRangeSafely(nextFrom: string, nextTo: string) {
    setFrom(nextFrom)
    setTo(nextTo)
  }

  function onFromChange(v: string) {
    if (!v) return
    setRangeSafely(v, v > to ? v : to)
  }
  function onToChange(v: string) {
    if (!v) return
    setRangeSafely(v < from ? v : from, v)
  }

  function exportExcel() {
    if (!s) return
    if (s.orderCount === 0) {
      toast.info('Tidak ada pesanan pada rentang ini untuk diekspor')
      return
    }
    const tabDef = TAB_DEFS.find((t) => t.value === tab)
    toast.info(`Ekspor tab “${tabDef?.label ?? tab}” — ${formatNumber(s.orderCount)} pesanan`, {
      description: `Rentang ${formatDate(from)} – ${formatDate(to)}. Berkas diunduh sesuai tab yang sedang dibuka.`,
      action: {
        label: 'Unduh',
        onClick: () =>
          void toastDownload(
            `/api/data/export?type=REPORT_TAB&tab=${tab}&from=${from}&to=${to}`,
            'Menyiapkan berkas Excel…'
          ),
      },
    })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-6">
      <PageHeader
        title="Laporan"
        description="Angka penjualan dihitung langsung dari transaksi — tidak ada data tersimpan yang basi."
        actions={
          <>
            <Button variant="outline" onClick={exportExcel} disabled={!s}>
              <Download className="mr-2 h-4 w-4" aria-hidden /> Ekspor Excel
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!s}>
              <Printer className="mr-2 h-4 w-4" aria-hidden /> Cetak
            </Button>
          </>
        }
      />

      {/* Range controls */}
      <section className="rounded-xl border bg-card p-4" aria-label="Rentang tanggal laporan">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {presets.map((p) => {
              const active = activePreset?.key === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  disabled={!viewAll}
                  aria-pressed={active}
                  onClick={() => setRangeSafely(p.from, p.to)}
                  className={cn(
                    'min-h-11 rounded-full border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                    active
                      ? 'border-caramel bg-caramel/15 text-espresso'
                      : 'bg-card hover:border-caramel/60 hover:bg-cream'
                  )}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="rep-from" className="text-xs text-muted-foreground">
                Dari
              </Label>
              <Input
                id="rep-from"
                type="date"
                value={from}
                max={todayJakarta()}
                disabled={!viewAll}
                onChange={(e) => onFromChange(e.target.value)}
                className="h-11 w-40"
              />
            </div>
            <span className="pb-3 text-muted-foreground" aria-hidden>
              –
            </span>
            <div className="space-y-1.5">
              <Label htmlFor="rep-to" className="text-xs text-muted-foreground">
                Sampai
              </Label>
              <Input
                id="rep-to"
                type="date"
                value={to}
                max={todayJakarta()}
                disabled={!viewAll}
                onChange={(e) => onToChange(e.target.value)}
                className="h-11 w-40"
              />
            </div>
          </div>
        </div>
        {!viewAll && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Sebagai kasir, kamu hanya melihat data hari ini.
          </p>
        )}
      </section>

      {/* Body states */}
      {summaryQ.isError && (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Gagal memuat laporan</AlertTitle>
          <AlertDescription>
            <p>
              {summaryQ.error instanceof Error ? summaryQ.error.message : 'Terjadi kesalahan saat menghitung.'}
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void summaryQ.refetch()}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden /> Coba lagi
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {summaryQ.isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      )}

      {s && isEmpty && (
        <EmptyState
          title="Tidak ada data pada rentang ini"
          description={`Belum ada pesanan tercatat antara ${formatDate(from)} dan ${formatDate(to)}.`}
          action={
            viewAll ? (
              <Button variant="outline" onClick={() => setRangeSafely(todayJakarta(), todayJakarta())}>
                Lihat hari ini
              </Button>
            ) : undefined
          }
        />
      )}

      {s && !isEmpty && (
        <Tabs value={tab} onValueChange={setTab} aria-label="Bagian laporan">
          <TabsList className="h-auto w-full max-w-full justify-start gap-1 overflow-x-auto bg-cream-deep p-1 scrollbar-warm">
            {TAB_DEFS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="min-h-11 gap-1.5 px-3">
                <t.icon className="h-4 w-4" aria-hidden /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="ringkasan" className="mt-4">
            <SummaryGrid s={s} prev={prevQ.data} />
          </TabsContent>
          <TabsContent value="produk" className="mt-4">
            <ProductsTab s={s} />
          </TabsContent>
          <TabsContent value="pembayaran" className="mt-4">
            <PaymentsTab s={s} />
          </TabsContent>
          <TabsContent value="jam" className="mt-4">
            <HoursTab s={s} />
          </TabsContent>
          <TabsContent value="tipe" className="mt-4">
            <TypesTab s={s} />
          </TabsContent>
          <TabsContent value="void" className="mt-4">
            <VoidsTab s={s} />
          </TabsContent>
          <TabsContent value="stok" className="mt-4">
            <StockTab s={s} />
          </TabsContent>
        </Tabs>
      )}

      {/* Print view — only .print-area is visible on print (global CSS) */}
      {s && (
        <PrintSheet
          title="Laporan Penjualan"
          subtitle={`Rentang ${formatDate(from)} – ${formatDate(to)}${viewAll ? '' : ' (hanya hari ini)'}`}
        >
          <PrintTable
            headers={['Metrik', 'Nilai']}
            rows={[
              ['Pendapatan kotor', formatIDR(s.gross)],
              ['Diskon', `-${formatIDR(s.discounts)}`],
              ['Pembatalan (void)', `-${formatIDR(s.voids)}`],
              ['Ongkir antar', formatIDR(s.deliveryFees)],
              ['Pajak', formatIDR(s.taxTotal)],
              ['Pendapatan bersih', formatIDR(s.net)],
              ['Pesanan', formatNumber(s.orderCount)],
              ['Item terjual', formatNumber(s.itemCount)],
              ['Rata-rata / pesanan', formatIDR(s.aov)],
              ['Tunai', formatIDR(s.byPayment.find((p) => p.method === 'CASH')?.total ?? 0)],
              ['QRIS', formatIDR(s.byPayment.find((p) => p.method === 'QRIS')?.total ?? 0)],
            ]}
          />
          {tab === 'produk' && s.productMix.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-sm font-semibold">Mix Produk</p>
              <PrintTable
                headers={['#', 'Produk', 'Qty', 'Pendapatan', 'Porsi']}
                rows={s.productMix.map((p, i) => [
                  i + 1,
                  p.name,
                  formatNumber(p.qty),
                  formatIDR(p.revenue),
                  `${Math.round(p.share * 100)}%`,
                ])}
              />
            </div>
          )}
          {tab === 'jam' && s.hourly.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-sm font-semibold">Per Jam</p>
              <PrintTable
                headers={['Jam', 'Pendapatan', 'Pesanan']}
                rows={s.hourly.map((h) => [`${h.hour}.00`, formatIDR(h.revenue), formatNumber(h.orders)])}
              />
            </div>
          )}
          {tab === 'tipe' && s.byType.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-sm font-semibold">Tipe Layanan</p>
              <PrintTable
                headers={['Tipe', 'Pesanan', 'Pendapatan']}
                rows={s.byType.map((t) => [t.type, formatNumber(t.count), formatIDR(t.revenue)])}
              />
            </div>
          )}
          {tab === 'void' && s.voidsList.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-sm font-semibold">Pembatalan</p>
              <PrintTable
                headers={['Waktu', 'Pesanan', 'Oleh', 'Alasan', 'Nilai']}
                rows={s.voidsList.map((v) => [formatDate(v.at), v.code, v.by ?? '-', v.reason, formatIDR(v.amount)])}
              />
            </div>
          )}
          {tab === 'stok' && s.stockUsage.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-sm font-semibold">Pemakaian Stok</p>
              <PrintTable
                headers={['Bahan', 'Terpakai', 'Limbah']}
                rows={s.stockUsage.map((u) => [`${u.name} (${u.unit})`, formatNumber(u.consumed), formatNumber(u.wasted)])}
              />
            </div>
          )}
        </PrintSheet>
      )}
    </div>
  )
}
