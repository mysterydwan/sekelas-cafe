'use client'

// /data — Excel & Data Management (SPEC §3.13): Z/X reporting + daily pack +
// template library + import wizard + export center. Role split: surfaces that
// need `data.import` are hidden from cashiers (they only see Z/X/daily/exports).
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  ChefHat,
  Coffee,
  Download,
  Eye,
  Printer,
  RefreshCw,
  ScrollText,
  ShoppingCart,
  Users,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatDate, formatDateTime, todayJakarta } from '@/lib/format'
import { useSession } from '@/hooks/use-session'
import { PageGuard } from '@/components/staff/page-guard'
import { EmptyState, PageHeader, TableSkeleton } from '@/components/staff/primitives'
import { Money } from '@/components/staff/money'
import type { DailyReportRow, DayReportSnapshot } from '@/lib/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ImportWizard } from '@/components/reporting/import-wizard'
import { SnapshotDialog } from '@/components/reporting/x-dialog'
import { ZPrintView } from '@/components/reporting/z-print'
import { ZWizard } from '@/components/reporting/z-wizard'
import { toastDownload } from '@/components/reporting/download'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default function DataPage() {
  return (
    <PageGuard page="/data">
      <Suspense
        fallback={
          <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-6">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        }
      >
        <DataInner />
      </Suspense>
    </PageGuard>
  )
}

function DataInner() {
  const qc = useQueryClient()
  const { can } = useSession()
  const canImport = can('data.import')
  const canReport = can('data.report')

  const today = useMemo(() => todayJakarta(), [])
  // Orders page links here with ?from&to (post-cancel reconciliation flows).
  const sp = useSearchParams()
  const router = useRouter()
  const initialRange = useMemo(() => {
    const f = sp.get('from') ?? ''
    const t = sp.get('to') ?? ''
    if (DATE_RE.test(f) && DATE_RE.test(t) && f <= t) return { from: f, to: t }
    if (DATE_RE.test(f)) return { from: f, to: f }
    return { from: today, to: today }
  }, [sp, today])

  const [rangeFrom, setRangeFrom] = useState(initialRange.from)
  const [rangeTo, setRangeTo] = useState(initialRange.to)
  const [packDate, setPackDate] = useState(today)
  const [xOpen, setXOpen] = useState(false)
  const [xSnap, setXSnap] = useState<DayReportSnapshot | null>(null)
  const [viewRow, setViewRow] = useState<DailyReportRow | null>(null)
  const [printRow, setPrintRow] = useState<DailyReportRow | null>(null)
  const [autoOpen, setAutoOpen] = useState(false)

  const historyQ = useQuery({
    queryKey: ['reports', 'history'],
    queryFn: () => apiFetch<DailyReportRow[]>('/api/reports/history'),
  })

  // X-report is fetched on demand — the dialog opens with fresh numbers.
  const xM = useMutation({
    mutationFn: () => apiFetch<DayReportSnapshot>(`/api/reports/x?businessDate=${today}`),
    onSuccess: (snap) => {
      setXSnap(snap)
      setXOpen(true)
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Gagal memuat X-Report')
    },
  })

  // ?x=1 (command palette deep link) opens the X-report once per param value —
  // the param is consumed right away so closing the dialog doesn't re-open it.
  const xParamHandledRef = useRef<string | null>(null)
  useEffect(() => {
    if (sp.get('x') !== '1') return
    const paramKey = sp.toString()
    if (xParamHandledRef.current === paramKey) return
    xParamHandledRef.current = paramKey
    const next = new URLSearchParams(paramKey)
    next.delete('x')
    router.replace(next.toString() ? `/data?${next.toString()}` : '/data', { scroll: false })
    if (canReport || can('report.viewAll')) {
      xM.mutate()
    } else {
      toast.error('Kamu tidak punya izin untuk melihat X-Report')
    }
  }, [sp, router, canReport, can, xM])

  const autocloseM = useMutation({
    mutationFn: () => apiFetch<{ closed: string[] }>('/api/reports/autoclose', { method: 'POST' }),
    onSuccess: ({ closed }) => {
      setAutoOpen(false)
      if (closed.length === 0) {
        toast.info('Tidak ada hari lampau yang perlu ditutup')
      } else {
        toast.success(`${closed.length} hari ditutup otomatis`, { description: closed.join(', ') })
      }
      void qc.invalidateQueries({ queryKey: ['reports'] })
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Gagal menutup hari secara otomatis')
    },
  })

  function printZ(row: DailyReportRow) {
    setPrintRow(row)
    window.addEventListener('afterprint', () => setPrintRow(null), { once: true })
    window.setTimeout(() => window.print(), 80)
  }

  const history = historyQ.data ?? []

  const exportRows = [
    {
      key: 'orders',
      icon: ShoppingCart,
      label: 'Pesanan',
      desc: 'Semua pesanan pada rentang tanggal — lengkap dengan item dan pembayaran.',
      show: true,
      url: `/api/data/export?type=ORDERS&from=${rangeFrom}&to=${rangeTo}`,
    },
    {
      key: 'products',
      icon: Coffee,
      label: 'Produk',
      desc: 'Data induk produk beserta varian dan opsi.',
      show: canImport,
      url: '/api/data/export?type=PRODUCTS',
    },
    {
      key: 'stock',
      icon: Boxes,
      label: 'Bahan Stok',
      desc: 'Seluruh item bahan — satuan, jumlah, dan ambang rendah.',
      show: canImport,
      url: '/api/data/export?type=STOCK',
    },
    {
      key: 'movements',
      icon: ArrowLeftRight,
      label: 'Mutasi Stok',
      desc: 'Pergerakan stok pada rentang tanggal (masuk, keluar, limbah, opname).',
      show: canImport,
      url: `/api/data/export?type=MOVEMENTS&from=${rangeFrom}&to=${rangeTo}`,
    },
    {
      key: 'users',
      icon: Users,
      label: 'Pengguna',
      desc: 'Akun staf beserta peran dan status.',
      show: canImport,
      url: '/api/data/export?type=USERS',
    },
    {
      key: 'audit',
      icon: ScrollText,
      label: 'Log Aktivitas',
      desc: 'Catatan audit pada rentang tanggal — untuk rapat evaluasi.',
      show: can('activity.view'),
      url: `/api/data/export?type=AUDIT&from=${rangeFrom}&to=${rangeTo}`,
    },
  ].filter((r) => r.show)

  const templates = [
    {
      type: 'PRODUCTS',
      icon: Coffee,
      name: 'Produk',
      desc: 'Produk + varian & opsi — lengkap dengan lembar Petunjuk.',
    },
    { type: 'STOCK', icon: Boxes, name: 'Bahan Stok', desc: 'Item bahan dengan SKU sebagai kunci cocok.' },
    { type: 'RECIPES', icon: ChefHat, name: 'Resep', desc: 'Takaran bahan per porsi tiap produk.' },
    { type: 'USERS', icon: Users, name: 'Pengguna', desc: 'Akun staf dengan username sebagai kunci cocok.' },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-6">
      <PageHeader
        title="Data & Excel"
        description="Tutup hari, paket laporan, template, impor, dan ekspor — semua dalam satu tempat."
      />

      {/* 1. Z-report wizard */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Tutup Hari (Z-Report)</CardTitle>
              <CardDescription>
                Wizard 4 langkah: tinjau → hitung kas → angka → tutup. Setelah ditutup, angka dibekukan.
              </CardDescription>
            </div>
            {(canReport || can('report.viewAll')) && (
              <Button variant="outline" onClick={() => xM.mutate()} disabled={xM.isPending}>
                <Eye className="mr-2 h-4 w-4" aria-hidden /> {xM.isPending ? 'Memuat…' : 'Lihat X-Report'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ZWizard />
        </CardContent>
      </Card>

      {/* 2. Unclosed days + Z history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hari yang Belum Ditutup</CardTitle>
          <CardDescription>
            Hari lampau yang lupa ditutup bisa ditutup otomatis dari catatan transaksi. Riwayat Z 30 hari terakhir
            ada di bawah.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canReport && (
            <AlertDialog open={autoOpen} onOpenChange={setAutoOpen}>
              <Button variant="outline" onClick={() => setAutoOpen(true)}>
                <Zap className="mr-2 h-4 w-4" aria-hidden /> Tutup otomatis hari yang terlewat
              </Button>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tutup otomatis hari yang terlewat?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Hari lampau yang belum ditutup akan ditutup otomatis dari catatan transaksi dan ditandai
                    OTOMATIS pada riwayat. Laporan Z hasil tutup otomatis tidak bisa diubah setelahnya.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={() => autocloseM.mutate()} disabled={autocloseM.isPending}>
                    {autocloseM.isPending ? 'Menutup…' : 'Ya, tutup otomatis'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {historyQ.isLoading && <TableSkeleton rows={5} cols={5} />}
          {historyQ.isError && (
            <Alert variant="destructive" role="alert">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Gagal memuat riwayat Z</AlertTitle>
              <AlertDescription>
                <p>{historyQ.error instanceof Error ? historyQ.error.message : 'Coba muat ulang.'}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => void historyQ.refetch()}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden /> Coba lagi
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {historyQ.isSuccess && history.length === 0 && (
            <EmptyState
              title="Belum ada hari yang ditutup"
              description="Tutup hari pertamamu dengan wizard Z-Report di atas — riwayatnya akan muncul di sini."
            />
          )}
          {history.length > 0 && (
            <div className="overflow-hidden rounded-xl border">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Ditutup</TableHead>
                      <TableHead>Oleh</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((row) => {
                      const v = row.snapshot.variance
                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <span className="flex flex-wrap items-center gap-1.5 font-medium">
                              {formatDate(row.businessDate + 'T12:00:00+07:00')}
                              {row.isAutoClosed && (
                                <Badge className="bg-warning/15 text-warning hover:bg-warning/15">OTOMATIS</Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                            {row.closedAt ? formatDateTime(row.closedAt) : '—'}
                          </TableCell>
                          <TableCell>{row.generatedBy ?? 'Sistem'}</TableCell>
                          <TableCell className="text-right">
                            {v === null || v === undefined ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <Money value={v} className={v === 0 ? 'text-success' : 'text-destructive'} />
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setViewRow(row)} aria-label={`Lihat Z ${row.businessDate}`}>
                                <Eye className="h-4 w-4" aria-hidden /> Lihat
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  void toastDownload(
                                    `/api/data/export?type=DAILY_PACK&businessDate=${row.businessDate}`,
                                    'Menyiapkan paket laporan…'
                                  )
                                }
                                aria-label={`Unduh paket ${row.businessDate}`}
                              >
                                <Download className="h-4 w-4" aria-hidden /> Unduh
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => printZ(row)} aria-label={`Cetak Z ${row.businessDate}`}>
                                <Printer className="h-4 w-4" aria-hidden /> Cetak
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Daily report pack */}
      {canReport && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paket Laporan Harian</CardTitle>
            <CardDescription>
              Satu berkas .xlsx berisi ringkasan penjualan, mix produk, per jam, pembayaran, void, mutasi stok,
              limbah, dan bahan menipis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pack-date" className="text-xs text-muted-foreground">
                  Tanggal bisnis
                </Label>
                <Input
                  id="pack-date"
                  type="date"
                  value={packDate}
                  max={today}
                  onChange={(e) => setPackDate(e.target.value || today)}
                  className="h-11 w-44"
                />
              </div>
              <Button
                className="bg-espresso text-cream hover:bg-espresso-soft"
                onClick={() =>
                  void toastDownload(
                    `/api/data/export?type=DAILY_PACK&businessDate=${packDate}`,
                    'Menyiapkan paket laporan…'
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" aria-hidden /> Unduh Paket Laporan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. Template library (Admin) */}
      {canImport && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perpustakaan Template</CardTitle>
            <CardDescription>
              Template .xlsx sesuai validasi impor — header, 2 baris contoh, dan lembar Petunjuk dalam Bahasa
              Indonesia.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.map((t) => (
                <div
                  key={t.type}
                  className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 rounded-lg bg-cream p-2 text-espresso" aria-hidden>
                      <t.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.desc}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void toastDownload(`/api/data/templates?type=${t.type}`, 'Menyiapkan template…')}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Unduh
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5. Import wizard (Admin) */}
      {canImport && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Impor Excel</CardTitle>
            <CardDescription>
              Unggah → pratinjau (BARU / PERBARUI / GAGAL) → terapkan. Snapshot otomatis dibuat sebelum data
              lama ditimpa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImportWizard />
          </CardContent>
        </Card>
      )}

      {/* 6. Export center */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pusat Ekspor</CardTitle>
          <CardDescription>
            Ekspor .xlsx per entitas. Rentang tanggal di bawah dipakai untuk Pesanan, Mutasi Stok, dan Log
            Aktivitas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="exp-from" className="text-xs text-muted-foreground">
                Dari
              </Label>
              <Input
                id="exp-from"
                type="date"
                value={rangeFrom}
                max={today}
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) return
                  setRangeFrom(v)
                  if (v > rangeTo) setRangeTo(v)
                }}
                className="h-11 w-40"
              />
            </div>
            <span className="pb-3 text-muted-foreground" aria-hidden>
              –
            </span>
            <div className="space-y-1.5">
              <Label htmlFor="exp-to" className="text-xs text-muted-foreground">
                Sampai
              </Label>
              <Input
                id="exp-to"
                type="date"
                value={rangeTo}
                max={today}
                onChange={(e) => {
                  const v = e.target.value
                  if (v) setRangeTo(v)
                  if (v && v < rangeFrom) setRangeFrom(v)
                }}
                className="h-11 w-40"
              />
            </div>
          </div>

          <div className="divide-y">
            {exportRows.map((r) => (
              <div key={r.key} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-lg bg-cream p-2 text-espresso" aria-hidden>
                    <r.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-medium">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.desc}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => void toastDownload(r.url, 'Menyiapkan berkas…')}
                  className="shrink-0"
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden /> Unduh
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* X-report preview dialog */}
      <SnapshotDialog
        open={xOpen}
        onOpenChange={setXOpen}
        snap={xSnap}
        title="X-Report — pratinjau"
        description="Tidak menutup hari; angka berubah sepanjang hari."
      />

      {/* Z history detail dialog */}
      <SnapshotDialog
        open={!!viewRow}
        onOpenChange={(o) => !o && setViewRow(null)}
        snap={viewRow?.snapshot ?? null}
        title={`Z-Report — ${viewRow ? formatDate(viewRow.businessDate + 'T12:00:00+07:00') : ''}`}
        description="Laporan Z bersifat tetap (immutable) — dibekukan saat hari ditutup."
        footer={
          viewRow && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void toastDownload(
                    `/api/data/export?type=DAILY_PACK&businessDate=${viewRow.businessDate}`,
                    'Menyiapkan paket laporan…'
                  )
                }
              >
                <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Unduh .xlsx
              </Button>
              <Button variant="outline" size="sm" onClick={() => printZ(viewRow)}>
                <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Cetak (80mm)
              </Button>
            </div>
          )
        }
      />

      {/* Hidden print container — only .print-area is visible on print */}
      {printRow && (
        <ZPrintView
          snap={printRow.snapshot}
          closedAt={printRow.closedAt}
          generatedBy={printRow.generatedBy}
          isAutoClosed={printRow.isAutoClosed}
        />
      )}
    </div>
  )
}
