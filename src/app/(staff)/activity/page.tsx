'use client'

// /activity — Audit Log (SPEC §3.16, Admin only): filterable append-only log
// with field-level before/after diffs, raw-JSON copy, and Excel export.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ClipboardCopy,
  Download,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatDateTime, formatNumber } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/grants'
import type { AuditLogDTO, Role } from '@/lib/types'
import { cn } from '@/lib/utils'
import { PageGuard } from '@/components/staff/page-guard'
import { EmptyState, PageHeader, TableSkeleton } from '@/components/staff/primitives'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatAction, formatEntity } from '@/components/reporting/action-labels'
import { AuditDiff } from '@/components/reporting/audit-diff'
import { toastDownload } from '@/components/reporting/download'

interface ActivityResponse {
  rows: AuditLogDTO[]
  total: number
  page: number
  pageSize: number
  actors: { id: string; name: string; role: string }[]
  entities: string[]
}

const PAGE_SIZE = 100

/** Prisma cuid-like ids (lowercase alphanumeric, ≥20 chars) — safe for /orders/{id}. */
const CUID_RE = /^[a-z0-9]{20,}$/

const ROLE_BADGE: Record<string, string> = {
  ADMIN: 'bg-espresso text-cream',
  CASHIER: 'bg-caramel/20 text-espresso',
  BARISTA: 'bg-success/15 text-success',
}

function actionTone(action: string): 'positive' | 'negative' | 'neutral' {
  if (/(cancel|void|delete|reject|deactivate)/i.test(action)) return 'negative'
  if (/(create|restock)/i.test(action)) return 'positive'
  return 'neutral'
}

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function ActivityPage() {
  return (
    <PageGuard page="/activity">
      <ActivityInner />
    </PageGuard>
  )
}

function ActivityInner() {
  const [userId, setUserId] = useState('all')
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AuditLogDTO | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const debouncedAction = useDebounced(action)

  // '/' focuses the action search (SPEC §3.16)
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

  const filters = useMemo(
    () => ({ userId, action: debouncedAction, entity, from, to }),
    [userId, debouncedAction, entity, from, to]
  )

  const q = useQuery({
    queryKey: ['activity', filters, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (filters.userId !== 'all') params.set('userId', filters.userId)
      if (filters.action) params.set('action', filters.action)
      if (filters.entity !== 'all') params.set('entity', filters.entity)
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      return apiFetch<ActivityResponse>(`/api/activity?${params.toString()}`)
    },
    placeholderData: keepPreviousData,
  })

  const rows = q.data?.rows ?? []
  const total = q.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filtersActive =
    filters.userId !== 'all' || filters.action !== '' || filters.entity !== 'all' || filters.from !== '' || filters.to !== ''

  function resetFilters() {
    setUserId('all')
    setAction('')
    setEntity('all')
    setFrom('')
    setTo('')
    setPage(1)
  }

  function exportAudit() {
    const params = new URLSearchParams({ type: 'AUDIT' })
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
    if (filters.userId !== 'all') params.set('userId', filters.userId)
    if (filters.action) params.set('action', filters.action)
    if (filters.entity !== 'all') params.set('entity', filters.entity)
    if (!filters.from && !filters.to) {
      toast.info('Tanpa filter tanggal, ekspor mencakup hari ini saja', {
        description: 'Atur rentang tanggal dulu bila butuh rentang lain.',
      })
    }
    void toastDownload(`/api/data/export?${params.toString()}`, 'Menyiapkan log aktivitas…')
  }

  async function copyRaw(row: AuditLogDTO) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(row, null, 2))
      toast.success('JSON mentah tersalin ke papan klip')
    } catch {
      toast.error('Gagal menyalin — coba lagi')
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-6">
      <PageHeader
        title="Log Aktivitas"
        description="Siapa mengubah apa, kapan — catatan permanen (append-only)."
        actions={
          <Button variant="outline" onClick={exportAudit}>
            <Download className="mr-2 h-4 w-4" aria-hidden /> Ekspor
          </Button>
        }
      />

      {/* Filter bar */}
      <section className="rounded-xl border bg-card p-4" aria-label="Filter log aktivitas">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="act-actor" className="text-xs text-muted-foreground">
              Pelaku
            </Label>
            <Select value={userId} onValueChange={(v) => { setUserId(v); setPage(1) }}>
              <SelectTrigger id="act-actor" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua pelaku</SelectItem>
                {(q.data?.actors ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="act-action" className="text-xs text-muted-foreground">
              Aksi
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                ref={searchRef}
                id="act-action"
                value={action}
                onChange={(e) => { setAction(e.target.value); setPage(1) }}
                placeholder="Cari aksi… ( / )"
                className="h-11 pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="act-entity" className="text-xs text-muted-foreground">
              Entitas
            </Label>
            <Select value={entity} onValueChange={(v) => { setEntity(v); setPage(1) }}>
              <SelectTrigger id="act-entity" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua entitas</SelectItem>
                {(q.data?.entities ?? []).map((e) => (
                  <SelectItem key={e} value={e}>
                    {formatEntity(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="act-from" className="text-xs text-muted-foreground">
              Dari
            </Label>
            <Input
              id="act-from"
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1) }}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="act-to" className="text-xs text-muted-foreground">
              Sampai
            </Label>
            <Input
              id="act-to"
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1) }}
              className="h-11"
            />
          </div>
        </div>
      </section>

      {/* Table states */}
      {q.isError && (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Gagal memuat log aktivitas</AlertTitle>
          <AlertDescription>
            <p>{q.error instanceof Error ? q.error.message : 'Coba muat ulang.'}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void q.refetch()}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden /> Coba lagi
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {q.isLoading && <TableSkeleton rows={8} cols={5} />}

      {q.isSuccess && rows.length === 0 && (
        <EmptyState
          title={filtersActive ? 'Tidak ada aktivitas yang cocok' : 'Belum ada aktivitas tercatat'}
          description={
            filtersActive
              ? 'Coba longgarkan filter — kurangi kata kunci atau perluas rentang tanggal.'
              : 'Setiap perubahan data (pesanan, stok, produk, pengaturan) akan tercatat di sini.'
          }
          icon={<Search className="h-10 w-10" aria-hidden />}
          action={
            filtersActive ? (
              <Button variant="outline" onClick={resetFilters}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Reset filter
              </Button>
            ) : undefined
          }
        />
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Pelaku</TableHead>
                  <TableHead>Aksi</TableHead>
                  <TableHead>Entitas</TableHead>
                  <TableHead className="max-w-56">Label</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const tone = actionTone(row.action)
                  return (
                    <TableRow
                      key={row.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Detail aktivitas: ${formatAction(row.action)}`}
                      onClick={() => setSelected(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setSelected(row)
                      }}
                    >
                      <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <span className="font-medium">{row.user ?? 'Sistem'}</span>
                          {row.role && (
                            <Badge
                              className={cn(
                                'border-transparent px-1.5 text-[10px]',
                                ROLE_BADGE[row.role] ?? 'bg-muted text-muted-foreground'
                              )}
                            >
                              {ROLE_LABELS[row.role as Role] ?? row.role}
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-xs font-medium',
                            tone === 'positive' && 'bg-success/10 text-success',
                            tone === 'negative' && 'bg-destructive/10 text-destructive'
                          )}
                        >
                          {formatAction(row.action)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{formatEntity(row.entity)}</TableCell>
                      <TableCell className="max-w-56">
                        <span className="block truncate text-sm text-muted-foreground" title={row.label ?? undefined}>
                          {row.label ?? '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Pagination + append-only note */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Log bersifat append-only — tidak ada tombol hapus. {formatNumber(total)} entri · halaman {page} dari{' '}
            {formatNumber(totalPages)}.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Sebelumnya
            </Button>
            <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Berikutnya
            </Button>
          </div>
        </div>
      )}

      {/* Detail sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-hidden sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selected ? formatAction(selected.action) : ''}</SheetTitle>
            <SheetDescription>
              {selected ? `${formatEntity(selected.entity)}${selected.label ? ` — ${selected.label}` : ''}` : ''}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="flex-1 space-y-4 overflow-y-auto scrollbar-warm px-4 pb-6">
              <dl className="space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Waktu</dt>
                  <dd className="font-mono text-xs tabular-nums">{formatDateTime(selected.createdAt)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Pelaku</dt>
                  <dd className="flex items-center gap-1.5">
                    {selected.user ?? 'Sistem'}
                    {selected.role && (
                      <Badge
                        className={cn(
                          'border-transparent px-1.5 text-[10px]',
                          ROLE_BADGE[selected.role] ?? 'bg-muted text-muted-foreground'
                        )}
                      >
                        {ROLE_LABELS[selected.role as Role] ?? selected.role}
                      </Badge>
                    )}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Aksi (mentah)</dt>
                  <dd>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{selected.action}</code>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Entitas</dt>
                  <dd className="text-sm">
                    {formatEntity(selected.entity)}{' '}
                    <span className="font-mono text-xs text-muted-foreground">({selected.entity})</span>
                  </dd>
                </div>
                {selected.entityId && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">ID entitas</dt>
                    <dd className="font-mono text-xs">
                      {selected.entity === 'Order' && CUID_RE.test(selected.entityId) ? (
                        <Link
                          href={`/orders/${selected.entityId}`}
                          className="text-caramel underline-offset-2 hover:text-espresso hover:underline"
                        >
                          {selected.entityId} — lihat pesanan
                        </Link>
                      ) : (
                        selected.entityId
                      )}
                    </dd>
                  </div>
                )}
                {selected.label && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Label</dt>
                    <dd className="text-right">{selected.label}</dd>
                  </div>
                )}
              </dl>

              <div className="border-t pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Perubahan (sebelum → sesudah)
                </p>
                <AuditDiff before={selected.before} after={selected.after} />
              </div>

              <Button variant="outline" onClick={() => void copyRaw(selected)}>
                <ClipboardCopy className="mr-2 h-4 w-4" aria-hidden /> Salin JSON Mentah
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
