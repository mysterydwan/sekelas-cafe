'use client'

// Report tab contents (SPEC §3.12) — pure presentational slices over
// ReportSummaryDTO, shared by the /reports page. The page owns range state.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Ban, CheckCircle2, Clock3, Search, TrendingDown, TrendingUp } from 'lucide-react'
import { Money } from '@/components/staff/money'
import { EmptyState, StatCard } from '@/components/staff/primitives'
import { formatDateTime, formatIDR, formatNumber } from '@/lib/format'
import { ORDER_TYPE_LABEL, type ReportSummaryDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  OrdersByHourChart,
  PaymentDonut,
  ProductTopChart,
  RevenueByHourChart,
  RevenueByTypeChart,
} from './charts'

type Prev = ReportSummaryDTO | undefined

/** "+12% vs periode lalu" chip — green up / red down; hidden when no baseline. */
export function DeltaChip({ cur, prev }: { cur: number; prev: number | undefined }) {
  if (prev === undefined || prev === 0) return null
  const pct = Math.round(((cur - prev) / prev) * 100)
  if (pct === 0) {
    return <span className="text-muted-foreground">0% vs periode lalu</span>
  }
  const up = pct > 0
  return (
    <span
      className={cn('inline-flex items-center gap-1 font-medium', up ? 'text-success' : 'text-destructive')}
    >
      {up ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
      {up ? '+' : ''}
      {pct}% vs periode lalu
    </span>
  )
}

// ---------- Ringkasan ----------

/** StatCard layout with a ReactNode footer (shared StatCard's hint is string-only). */
function DeltaCard({
  label,
  value,
  delta,
  accent = false,
}: {
  label: string
  value: React.ReactNode
  delta: React.ReactNode
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4 text-left shadow-sm',
        accent && 'border-caramel/40 bg-cream'
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 min-h-4 text-xs">{delta}</p>
    </div>
  )
}

export function SummaryGrid({ s, prev }: { s: ReportSummaryDTO; prev: Prev }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <DeltaCard label="Pendapatan Kotor" value={<Money value={s.gross} />} delta={<DeltaChip cur={s.gross} prev={prev?.gross} />} />
      <DeltaCard label="Diskon" value={<Money value={s.discounts} />} delta={<DeltaChip cur={s.discounts} prev={prev?.discounts} />} />
      <DeltaCard label="Void / Pembatalan" value={<Money value={s.voids} />} delta={<DeltaChip cur={s.voids} prev={prev?.voids} />} />
      <DeltaCard
        label="Pendapatan Bersih"
        value={<Money value={s.net} />}
        accent
        delta={<DeltaChip cur={s.net} prev={prev?.net} />}
      />
      <DeltaCard label="Ongkir" value={<Money value={s.deliveryFees} />} delta={<DeltaChip cur={s.deliveryFees} prev={prev?.deliveryFees} />} />
      <DeltaCard label="Pajak" value={<Money value={s.taxTotal} />} delta={<DeltaChip cur={s.taxTotal} prev={prev?.taxTotal} />} />
      <DeltaCard
        label="Pesanan"
        value={formatNumber(s.orderCount)}
        delta={<DeltaChip cur={s.orderCount} prev={prev?.orderCount} />}
      />
      <DeltaCard
        label="Item"
        value={formatNumber(s.itemCount)}
        delta={<DeltaChip cur={s.itemCount} prev={prev?.itemCount} />}
      />
      <DeltaCard label="Rata-rata / Pesanan" value={<Money value={s.aov} />} delta={<DeltaChip cur={s.aov} prev={prev?.aov} />} />
    </div>
  )
}

// ---------- Produk ----------

export function ProductsTab({ s }: { s: ReportSummaryDTO }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // '/' focuses product search (SPEC §1.5 shortcuts)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return s.productMix
    return s.productMix.filter((p) => p.name.toLowerCase().includes(q))
  }, [s.productMix, search])

  if (s.productMix.length === 0) {
    return (
      <EmptyState
        title="Tidak ada produk terjual"
        description="Belum ada item terjual pada rentang ini."
      />
    )
  }

  const openOrders = (name: string) => router.push(`/orders?search=${encodeURIComponent(name)}`)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-semibold">10 Terlaris (qty)</p>
        <ProductTopChart data={s.productMix.slice(0, 10)} />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <p className="text-sm font-semibold">Peringkat lengkap</p>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari produk… ( / )"
              className="h-11 pl-9"
              aria-label="Cari produk"
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Tidak ada produk yang cocok dengan &ldquo;{search}&rdquo;.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto scrollbar-warm">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Pendapatan</TableHead>
                  <TableHead className="w-36 text-right">Porsi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const rank = s.productMix.indexOf(p) + 1
                  return (
                    <TableRow
                      key={p.name}
                      tabIndex={0}
                      role="button"
                      aria-label={`Lihat pesanan berisi ${p.name}`}
                      onClick={() => openOrders(p.name)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') openOrders(p.name)
                      }}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">{rank}</TableCell>
                      <TableCell className="max-w-52 truncate font-medium">{p.name}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatNumber(p.qty)}</TableCell>
                      <TableCell className="text-right">
                        <Money value={p.revenue} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
                            <div
                              className="h-full rounded-full bg-caramel"
                              style={{ width: `${Math.min(100, Math.max(2, Math.round(p.share * 100)))}%` }}
                            />
                          </div>
                          <span className="w-9 text-right font-mono text-xs tabular-nums text-muted-foreground">
                            {Math.round(p.share * 100)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Klik baris untuk melihat pesanan yang memuat produk tersebut.
        </p>
      </div>
    </div>
  )
}

// ---------- Pembayaran ----------

export function PaymentsTab({ s }: { s: ReportSummaryDTO }) {
  const cash = s.byPayment.find((p) => p.method === 'CASH')
  const qris = s.byPayment.find((p) => p.method === 'QRIS')
  const cashTotal = cash?.total ?? 0
  const qrisTotal = qris?.total ?? 0
  const tenderTotal = cashTotal + qrisTotal

  const cards = [
    {
      key: 'cash',
      label: 'Tunai',
      total: cashTotal,
      count: cash?.count ?? 0,
    },
    {
      key: 'qris',
      label: 'QRIS',
      total: qrisTotal,
      count: qris?.count ?? 0,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-3 text-sm font-semibold">Mix pembayaran</p>
          {tenderTotal === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Belum ada pembayaran tercatat.</p>
          ) : (
            <PaymentDonut tunai={cashTotal} qris={qrisTotal} />
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((c) => (
            <div key={c.key} className="rounded-xl border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
              <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums">
                <Money value={c.total} />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatNumber(c.count)} pembayaran
                {tenderTotal > 0 && ` · ${Math.round((c.total / tenderTotal) * 100)}% dari total`}
              </p>
            </div>
          ))}
        </div>
      </div>

      {s.pendingPayments.length > 0 && (
        <Alert className="border-warning/50 bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertTitle>{s.pendingPayments.length} pembayaran menunggu verifikasi QRIS</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-1">
              {s.pendingPayments.map((p) => (
                <li key={`${p.code}-${p.at}`} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <Link
                    href={`/orders?search=${encodeURIComponent(p.code)}`}
                    className="font-mono font-semibold underline-offset-2 hover:underline"
                  >
                    {p.code}
                  </Link>
                  <span className="text-xs text-muted-foreground">{formatDateTime(p.at)}</span>
                  <Money value={p.amount} />
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {s.pendingPayments.length === 0 && tenderTotal > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> Tidak ada pembayaran tertunda.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Cocokkan total QRIS dengan mutasi aplikasi merchant saat menutup hari — input rekonsiliasi ada di{' '}
        <Link href="/data" className="font-medium underline underline-offset-2">
          halaman Data
        </Link>
        .
      </p>
    </div>
  )
}

// ---------- Jam ----------

export function HoursTab({ s }: { s: ReportSummaryDTO }) {
  const busiest = useMemo(
    () => s.hourly.reduce<{ hour: string; revenue: number } | null>((best, h) => (best === null || h.revenue > best.revenue ? h : best), null),
    [s.hourly]
  )

  if (s.hourly.length === 0) {
    return <EmptyState title="Tidak ada data per jam" description="Belum ada pesanan pada rentang ini." />
  }

  return (
    <div className="space-y-4">
      {busiest && busiest.revenue > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-caramel/15 px-3 font-medium text-espresso">
            <Clock3 className="h-4 w-4" aria-hidden /> Jam tersibuk: {busiest.hour}.00 — {formatIDR(busiest.revenue)}
          </span>
          <span className="text-xs text-muted-foreground">Spike jam istirahat kelas terlihat di sini.</span>
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-3 text-sm font-semibold">Pendapatan per jam</p>
          <RevenueByHourChart data={s.hourly} />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-3 text-sm font-semibold">Pesanan per jam</p>
          <OrdersByHourChart data={s.hourly} />
        </div>
      </div>
    </div>
  )
}

// ---------- Tipe ----------

export function TypesTab({ s }: { s: ReportSummaryDTO }) {
  const data = s.byType.map((t) => ({
    type: t.type,
    label: ORDER_TYPE_LABEL[t.type as keyof typeof ORDER_TYPE_LABEL] ?? t.type,
    revenue: t.revenue,
  }))

  if (s.byType.length === 0) {
    return <EmptyState title="Tidak ada pesanan" description="Belum ada pesanan pada rentang ini." />
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-semibold">Pendapatan per tipe layanan</p>
        <RevenueByTypeChart data={data} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {s.byType.map((t) => (
          <div key={t.type} className="rounded-xl border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {ORDER_TYPE_LABEL[t.type as keyof typeof ORDER_TYPE_LABEL] ?? t.type}
            </p>
            <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums">
              <Money value={t.revenue} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{formatNumber(t.count)} pesanan</p>
          </div>
        ))}
      </div>
      <p className="flex items-baseline justify-between rounded-xl border border-caramel/40 bg-cream px-4 py-3 text-sm">
        <span className="font-medium text-espresso">Pendapatan ongkir (antar)</span>
        <span className="font-mono font-semibold tabular-nums text-espresso">{formatIDR(s.deliveryFees)}</span>
      </p>
    </div>
  )
}

// ---------- Void ----------

export function VoidsTab({ s }: { s: ReportSummaryDTO }) {
  const [actor, setActor] = useState('all')
  const actors = useMemo(
    () => [...new Set(s.voidsList.map((v) => v.by).filter((b): b is string => !!b))].sort((a, b) => a.localeCompare(b)),
    [s.voidsList]
  )
  const filtered = actor === 'all' ? s.voidsList : s.voidsList.filter((v) => v.by === actor)

  if (s.voidsList.length === 0) {
    return (
      <EmptyState
        title="Tidak ada pembatalan"
        description="Tidak ada item void maupun pesanan dibatalkan pada rentang ini — bagus."
        icon={<CheckCircle2 className="h-10 w-10 text-success" aria-hidden />}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total Dibatalkan" value={<Money value={s.voids} />} />
        <StatCard label="Kejadian" value={formatNumber(s.voidsList.length)} />
        <StatCard
          label="Porsi dari Kotor"
          value={s.gross + s.voids > 0 ? `${Math.round((s.voids / (s.gross + s.voids)) * 100)}%` : '0%'}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={actor} onValueChange={setActor}>
          <SelectTrigger className="h-11 w-full sm:w-56" aria-label="Filter pelaku pembatalan">
            <SelectValue placeholder="Semua pelaku" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua pelaku</SelectItem>
            {actors.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {actor !== 'all' && (
          <p className="text-xs text-muted-foreground">
            Menampilkan {filtered.length} dari {s.voidsList.length} pembatalan oleh “{actor}”.
          </p>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="max-h-96 overflow-y-auto scrollbar-warm">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Pesanan</TableHead>
                <TableHead>Oleh</TableHead>
                <TableHead>Alasan</TableHead>
                <TableHead className="text-right">Nilai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v, i) => (
                <TableRow key={`${v.code}-${i}`}>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                    {formatDateTime(v.at)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/orders?search=${encodeURIComponent(v.code)}`}
                      className="font-mono font-semibold tracking-wide underline-offset-2 hover:underline"
                    >
                      {v.code}
                    </Link>
                  </TableCell>
                  <TableCell>{v.by ?? '—'}</TableCell>
                  <TableCell className="max-w-52">
                    <span className="flex items-start gap-1.5">
                      <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
                      <span className="truncate">{v.reason}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={v.amount} className="text-destructive" />
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Tidak ada pembatalan oleh “{actor}” pada rentang ini.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

// ---------- Stok ----------

export function StockTab({ s }: { s: ReportSummaryDTO }) {
  if (s.stockUsage.length === 0) {
    return (
      <EmptyState
        title="Tidak ada catatan konsumsi stok"
        description="Belum ada resep tercatat untuk pesanan pada rentang ini."
        action={
          <Button asChild variant="outline">
            <Link href="/stock">Kelola resep di Stok</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="max-h-96 overflow-y-auto scrollbar-warm">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Bahan</TableHead>
                <TableHead className="text-right">Terpakai</TableHead>
                <TableHead className="text-right">Limbah</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.stockUsage.map((u) => (
                <TableRow key={u.name}>
                  <TableCell className="font-medium">
                    {u.name} <span className="text-xs text-muted-foreground">({u.unit})</span>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatNumber(u.consumed)} {u.unit}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    <span className={u.wasted > 0 ? 'text-destructive' : 'text-muted-foreground'}>
                      {formatNumber(u.wasted)} {u.unit}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Konsumsi dihitung dari resep yang tercatat — jembatan ke keputusan pembelian bahan.
      </p>
    </div>
  )
}
