'use client'

// Z-report close wizard (4 steps): Tinjau → Hitung Kas → Angka → Tutup.
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  Download,
  FileQuestion,
  Hourglass,
  Lock,
  Printer,
  QrCode,
  RefreshCw,
  ShoppingCart,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatIDR, formatTime, todayJakarta } from '@/lib/format'
import { useSession } from '@/hooks/use-session'
import type { CashStatusDTO, DailyReportRow, DayReportSnapshot } from '@/lib/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { FigureRow, SnapshotFigures } from './figures'
import { ZPrintView } from './z-print'
import { toastDownload } from './download'
import { cn } from '@/lib/utils'

interface WarningsDTO {
  activeOrders: number
  unpaid: number
  pendingQris: number
  held: number
  closed: boolean
  cash: CashStatusDTO
}

const STEPS = [
  { n: 1, label: 'Tinjau' },
  { n: 2, label: 'Hitung Kas' },
  { n: 3, label: 'Angka' },
  { n: 4, label: 'Tutup' },
]

const CASH_TYPE_LABELS: Record<string, string> = {
  OPENING_FLOAT: 'Modal awal',
  CASH_IN: 'Uang masuk',
  CASH_OUT: 'Uang keluar',
}

function varianceTone(v: number): string {
  if (v === 0) return 'text-success'
  if (Math.abs(v) <= 2000) return 'text-warning'
  return 'text-destructive'
}

export function ZWizard() {
  const qc = useQueryClient()
  const { user } = useSession()
  const isAdmin = user?.role === 'ADMIN'
  const [step, setStep] = useState(1)
  const [businessDate, setBusinessDate] = useState(todayJakarta())
  const [override, setOverride] = useState(false)
  const [counted, setCounted] = useState('')
  const [merchant, setMerchant] = useState('')
  const [result, setResult] = useState<DailyReportRow | null>(null)

  const warningsQ = useQuery({
    queryKey: ['reports', 'warnings', businessDate],
    queryFn: () => apiFetch<WarningsDTO>(`/api/reports/warnings?businessDate=${businessDate}`),
  })
  const xQ = useQuery({
    queryKey: ['reports', 'x', businessDate],
    queryFn: () => apiFetch<DayReportSnapshot>(`/api/reports/x?businessDate=${businessDate}`),
  })

  const closeM = useMutation({
    mutationFn: () =>
      apiFetch<DailyReportRow>('/api/reports/z', {
        method: 'POST',
        body: JSON.stringify({
          businessDate,
          countedCash: Math.max(0, Math.round(Number(counted) || 0)),
          merchantQrisTotal: merchant.trim() === '' ? null : Math.round(Number(merchant)),
          override: override || undefined,
        }),
      }),
    onSuccess: (row) => {
      setResult(row)
      void qc.invalidateQueries({ queryKey: ['reports'] })
      toast.success(`Hari ${row.businessDate} berhasil ditutup`)
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Gagal menutup hari')
    },
  })

  const w = warningsQ.data
  const snap = xQ.data
  const closed = w?.closed ?? false
  const blocking = !!w && (w.activeOrders > 0 || w.pendingQris > 0)

  const countedNum = counted.trim() === '' ? null : Number(counted)
  const countedValid = countedNum !== null && !isNaN(countedNum) && countedNum >= 0
  const expected = snap?.expectedCash ?? 0
  const variance = countedValid ? Math.round(countedNum - expected) : null
  const cashPayments = snap?.cashTotal ?? 0
  const forgotSales =
    countedValid && cashPayments > 0 && Math.round(countedNum) === Math.round(expected - cashPayments)

  const merchantNum = merchant.trim() === '' ? null : Number(merchant)
  const merchantValid = merchantNum === null || (!isNaN(merchantNum) && merchantNum >= 0)
  const qrisVariance = merchantNum !== null && merchantValid ? Math.round(merchantNum - (snap?.qrisTotal ?? 0)) : null

  const canNext = useMemo(() => {
    if (closed) return false
    if (step === 1) return !blocking || override
    if (step === 2) return countedValid
    if (step === 3) return merchantValid
    return false
  }, [closed, step, blocking, override, countedValid, merchantValid])

  function reset() {
    setStep(1)
    setResult(null)
    setCounted('')
    setMerchant('')
    setOverride(false)
    setBusinessDate(todayJakarta())
    void qc.invalidateQueries({ queryKey: ['reports'] })
  }

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <ol className="flex items-center gap-1 sm:gap-2" aria-label="Langkah wizard">
        {STEPS.map((s, i) => (
          <li key={s.n} className="flex flex-1 items-center gap-1 sm:gap-2">
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                result || step > s.n
                  ? 'border-success bg-success text-white'
                  : step === s.n
                    ? 'border-caramel bg-caramel/15 text-caramel'
                    : 'border-border text-muted-foreground'
              )}
              aria-current={step === s.n && !result ? 'step' : undefined}
            >
              {result || step > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
            </div>
            <span className={cn('hidden text-xs font-medium sm:block', step === s.n ? 'text-foreground' : 'text-muted-foreground')}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      {/* Step 1: Tinjau */}
      {step === 1 && !result && (
        <div className="space-y-4">
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="z-date">Tanggal bisnis yang ditutup</Label>
            <Input
              id="z-date"
              type="date"
              value={businessDate}
              max={todayJakarta()}
              onChange={(e) => setBusinessDate(e.target.value || todayJakarta())}
            />
            <p className="text-xs text-muted-foreground">
              Default hari ini. Tanggal lampau yang masih punya pesanan juga bisa ditutup.
            </p>
          </div>

          {warningsQ.isLoading && <Skeleton className="h-48 w-full rounded-xl" />}
          {warningsQ.isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Gagal memuat pemeriksaan</AlertTitle>
              <AlertDescription>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => void warningsQ.refetch()}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" /> Coba lagi
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {closed && (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertTitle>Hari {businessDate} sudah ditutup</AlertTitle>
              <AlertDescription>
                Laporan Z bersifat tetap (immutable). Lihat ringkasannya di tabel Riwayat Z di bawah.
              </AlertDescription>
            </Alert>
          )}

          {w && !closed && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: 'Pesanan aktif', value: w.activeOrders, href: '/orders', icon: <ShoppingCart className="h-4 w-4" /> },
                  { label: 'Belum dibayar', value: w.unpaid, href: '/orders?status=PENDING_PAYMENT', icon: <Hourglass className="h-4 w-4" /> },
                  { label: 'Verifikasi QRIS', value: w.pendingQris, href: '/orders?status=PENDING_VERIFICATION', icon: <QrCode className="h-4 w-4" /> },
                  { label: 'Diparkir (held)', value: w.held, href: '/pos', icon: <FileQuestion className="h-4 w-4" /> },
                ].map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      'rounded-xl border p-3 transition-colors hover:border-caramel',
                      item.value > 0 ? 'border-warning/50 bg-warning/5' : 'border-border bg-card'
                    )}
                  >
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-medium">{item.label}</span>
                      {item.icon}
                    </div>
                    <p className={cn('mt-1 font-display text-2xl font-semibold tabular-nums', item.value > 0 && 'text-warning')}>
                      {item.value}
                    </p>
                  </Link>
                ))}
              </div>

              {blocking ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Masih ada pesanan aktif / verifikasi QRIS tertunda</AlertTitle>
                  <AlertDescription>
                    <div className="space-y-2">
                      <p>Selesaikan dulu (bayar, verifikasi, atau batalkan) supaya angka penutupan akurat.</p>
                      {isAdmin ? (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="z-override"
                            checked={override}
                            onCheckedChange={(v) => setOverride(v === true)}
                            aria-label="Tutup paksa meski ada pesanan aktif"
                          />
                          <Label htmlFor="z-override" className="text-xs font-medium text-destructive">
                            Tutup paksa meski ada pesanan aktif (khusus Admin)
                          </Label>
                        </div>
                      ) : (
                        <p className="text-xs">Minta Admin bila benar-benar perlu menutup paksa.</p>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Siap ditutup</AlertTitle>
                  <AlertDescription>Tidak ada pesanan aktif maupun verifikasi tertunda untuk tanggal ini.</AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 2: Hitung Kas */}
      {step === 2 && !result && (
        <div className="space-y-4">
          {snap ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Kas yang diharapkan di laci
                  </p>
                  <FigureRow label="Modal awal" value={formatIDR(snap.openingFloat)} />
                  <FigureRow label="Pembayaran tunai" value={`+ ${formatIDR(snap.cashTotal)}`} />
                  <FigureRow label="Uang masuk" value={`+ ${formatIDR(snap.cashIn)}`} />
                  <FigureRow label="Uang keluar" value={`− ${formatIDR(snap.cashOut)}`} />
                  <FigureRow label="Kas diharapkan" value={formatIDR(snap.expectedCash)} strong />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Catatan uang masuk/keluar
                  </p>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto scrollbar-warm pr-1">
                    {w?.cash.movements.length === 0 && (
                      <p className="text-sm text-muted-foreground">Tidak ada catatan kas untuk tanggal ini.</p>
                    )}
                    {w?.cash.movements.map((m) => (
                      <div key={m.id} className="flex items-baseline justify-between gap-2 border-b border-dashed py-1 text-sm">
                        <span className="truncate">
                          <Badge variant="outline" className="mr-1.5 px-1.5 text-[10px]">
                            {CASH_TYPE_LABELS[m.type] ?? m.type}
                          </Badge>
                          {m.reason ?? '—'}
                          <span className="ml-1 text-xs text-muted-foreground">· {m.user ?? '—'} · {formatTime(m.createdAt)}</span>
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums">
                          {m.type === 'CASH_OUT' ? '−' : '+'}
                          {formatIDR(m.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-cream p-4">
                <Label htmlFor="z-counted">Hasil hitung kas di laci (fisik)</Label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    id="z-counted"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="0"
                    className="max-w-48 font-mono tabular-nums"
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCounted(String(snap.expectedCash))}
                  >
                    <Banknote className="mr-1 h-3.5 w-3.5" /> Samakan dgn harapan
                  </Button>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-dashed pt-3">
                  <span className="text-sm font-medium">Selisih kas (live)</span>
                  <span className={cn('font-mono text-lg font-semibold tabular-nums', variance === null ? 'text-muted-foreground' : varianceTone(variance))}>
                    {variance === null ? '—' : `${variance > 0 ? '+' : ''}${formatIDR(variance)}`}
                  </span>
                </div>
                {forgotSales && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Hasil hitung = modal awal — lupa menghitung penjualan tunai?
                  </p>
                )}
                {variance !== null && variance !== 0 && !forgotSales && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Selisih bukan nol akan tercatat permanen pada laporan Z — hitung ulang dulu bila ragu.
                  </p>
                )}
              </div>
            </>
          ) : (
            <Skeleton className="h-64 w-full rounded-xl" />
          )}
        </div>
      )}

      {/* Step 3: Angka */}
      {step === 3 && !result && (
        <div className="space-y-4">
          {snap ? (
            <>
              <Alert>
                <Clock3 className="h-4 w-4" />
                <AlertTitle>Pratinjau angka hari {snap.businessDate}</AlertTitle>
                <AlertDescription>
                  Ini angka yang akan dibekukan pada laporan Z. Pastikan semuanya masuk akal sebelum lanjut.
                </AlertDescription>
              </Alert>
              <div className="rounded-xl border bg-cream p-4">
                <Label htmlFor="z-merchant">Total mutasi QRIS di aplikasi merchant (opsional)</Label>
                <Input
                  id="z-merchant"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="Cocokkan dengan mutasi aplikasi merchant"
                  className="mt-2 max-w-64 font-mono tabular-nums"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                />
                {qrisVariance !== null && (
                  <p className={cn('mt-2 font-mono text-sm tabular-nums', varianceTone(qrisVariance))}>
                    Selisih QRIS: {qrisVariance > 0 ? '+' : ''}
                    {formatIDR(qrisVariance)} (mutasi − sistem)
                  </p>
                )}
                {!merchantValid && <p className="mt-2 text-xs text-destructive">Masukkan angka yang valid.</p>}
              </div>
              <SnapshotFigures snap={snap} />
            </>
          ) : (
            <Skeleton className="h-96 w-full rounded-xl" />
          )}
        </div>
      )}

      {/* Step 4: Tutup */}
      {step === 4 && !result && snap && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ringkasan penutupan</CardTitle>
              <CardDescription>Periksa sekali lagi — setelah ditutup, laporan Z tidak bisa diubah.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <FigureRow label="Tanggal bisnis" value={snap.businessDate} />
              <FigureRow label="Kas diharapkan" value={formatIDR(snap.expectedCash)} />
              <FigureRow label="Kas dihitung" value={formatIDR(Math.round(countedNum ?? 0))} />
              <FigureRow
                label="Selisih kas"
                value={`${(variance ?? 0) > 0 ? '+' : ''}${formatIDR(variance ?? 0)}`}
                tone={variance === 0 ? 'success' : variance !== null && Math.abs(variance) <= 2000 ? 'warning' : 'destructive'}
                strong
              />
              <FigureRow label="Pendapatan bersih" value={formatIDR(snap.net)} />
              {override && blocking && (
                <p className="text-xs font-medium text-destructive">
                  Ditandai tutup paksa — masih ada pesanan aktif/verifikasi tertunda.
                </p>
              )}
            </CardContent>
          </Card>
          <Button
            size="lg"
            className="w-full bg-espresso text-cream hover:bg-espresso-soft sm:w-auto"
            disabled={closeM.isPending}
            onClick={() => closeM.mutate()}
          >
            {closeM.isPending ? 'Menutup…' : 'Tutup Hari Sekarang'}
          </Button>
          {closeM.isError && (
            <p className="text-sm text-destructive">
              {closeM.error instanceof Error ? closeM.error.message : 'Gagal menutup hari'}
            </p>
          )}
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="space-y-4">
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Hari {result.businessDate} ditutup</AlertTitle>
            <AlertDescription>
              Selisih kas tercatat{' '}
              <span className={cn('font-mono font-semibold', varianceTone(result.snapshot.variance ?? 0))}>
                {(result.snapshot.variance ?? 0) > 0 ? '+' : ''}
                {formatIDR(result.snapshot.variance ?? 0)}
              </span>
              . Pesanan diparkir untuk tanggal ini sudah dibersihkan.
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Cetak Z (80mm)
            </Button>
            <Button
              variant="outline"
              onClick={() => void toastDownload(`/api/data/export?type=DAILY_PACK&businessDate=${result.businessDate}`, 'Menyiapkan paket laporan…')}
            >
              <Download className="mr-2 h-4 w-4" /> Unduh .xlsx
            </Button>
            <Button variant="ghost" onClick={reset}>
              <RefreshCw className="mr-2 h-4 w-4" /> Tutup hari lain
            </Button>
          </div>
          <ZPrintView snap={result.snapshot} closedAt={result.closedAt} generatedBy={result.generatedBy} />
        </div>
      )}

      {/* Footer nav */}
      {!result && (
        <div className="flex items-center justify-between border-t pt-4">
          <Button variant="ghost" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Kembali
          </Button>
          <p className="text-xs text-muted-foreground">
            Langkah {step} dari {STEPS.length}
          </p>
          <Button
            disabled={!canNext || step === 4}
            onClick={() => setStep((s) => Math.min(4, s + 1))}
            className="bg-espresso text-cream hover:bg-espresso-soft"
          >
            Lanjut <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
