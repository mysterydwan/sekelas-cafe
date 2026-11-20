'use client'

// Stock movements ledger tab (SPEC §3.11): append-only, filterable, paginated.
// Includes a user filter (server-side via /api/users for admins, client-side
// over the loaded page for everyone else) and order-code deep links.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, SearchX } from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState, TableSkeleton } from '@/components/staff/primitives'
import {
  MOVEMENT_LABELS,
  MOVEMENT_TYPE_OPTIONS,
  formatQty,
  signedQty,
  type MovementsResponse,
  type StockItemDTO,
  type UserDTO,
} from './shared'

export function StockMovementsTab({ allItems }: { allItems: StockItemDTO[] }) {
  const [itemId, setItemId] = useState('all')
  const [type, setType] = useState('all')
  const [userId, setUserId] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  // User list needs user.manage — cashiers/baristas get a 403 and fall back to
  // client-side name filtering of the currently loaded rows.
  const usersQuery = useQuery({
    queryKey: ['users', 'for-movements'],
    queryFn: () => apiFetch<{ users: UserDTO[] }>('/api/users'),
    retry: false,
    staleTime: 5 * 60_000,
  })
  const serverUsers = usersQuery.isSuccess ? (usersQuery.data?.users ?? []) : null

  // Only pass the filter to the API when we have real user ids to pick from.
  const apiUserId = serverUsers ? userId : 'all'

  const q = useQuery({
    queryKey: ['stock', 'movements', 'ledger', itemId, type, apiUserId, from, to, page],
    queryFn: () => {
      const params = new URLSearchParams()
      if (itemId !== 'all') params.set('itemId', itemId)
      if (type !== 'all') params.set('type', type)
      if (apiUserId !== 'all') params.set('userId', apiUserId)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      params.set('page', String(page))
      return apiFetch<MovementsResponse>(`/api/stock/movements?${params.toString()}`)
    },
    refetchInterval: 60_000,
  })

  const rows = q.data?.rows ?? []
  const total = q.data?.total ?? 0
  const pageSize = q.data?.pageSize ?? 50
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const isFiltering = itemId !== 'all' || type !== 'all' || userId !== 'all' || !!from || !!to

  // Fallback (no user.manage): distinct actor names from the loaded page.
  const userOptions = useMemo(() => {
    if (serverUsers) return serverUsers.map((u) => ({ value: u.id, label: u.name }))
    const names = new Set<string>()
    for (const m of rows) if (m.user) names.add(m.user)
    return [...names].sort().map((name) => ({ value: name, label: name }))
  }, [serverUsers, rows])

  // Client-side filter applies only in fallback mode (value is a name there).
  const displayedRows =
    serverUsers || userId === 'all' ? rows : rows.filter((m) => m.user === userId)
  const clientFiltered = !serverUsers && userId !== 'all'

  const exportHref = () => {
    const params = new URLSearchParams({ type: 'MOVEMENTS' })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    return `/api/data/export?${params.toString()}`
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={itemId}
          onValueChange={(v) => {
            setItemId(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="h-11 w-full min-w-44 sm:w-56" aria-label="Filter bahan">
            <SelectValue placeholder="Semua bahan" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">Semua bahan</SelectItem>
            {allItems.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                <span className="font-mono text-xs">{i.sku}</span> — {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={type}
          onValueChange={(v) => {
            setType(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="h-11 w-44" aria-label="Filter jenis mutasi">
            <SelectValue placeholder="Semua jenis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua jenis</SelectItem>
            {MOVEMENT_TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {MOVEMENT_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={userId}
          onValueChange={(v) => {
            setUserId(v)
            setPage(1)
          }}
        >
          <SelectTrigger
            className="h-11 w-44"
            aria-label="Filter pelaku"
            disabled={usersQuery.isPending}
          >
            <SelectValue placeholder="Semua pelaku" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua pelaku</SelectItem>
            {userOptions.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(1)
            }}
            aria-label="Dari tanggal"
            className="h-11"
          />
          <span className="text-sm text-muted-foreground">–</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setPage(1)
            }}
            aria-label="Sampai tanggal"
            className="h-11"
          />
        </div>
        <Button variant="outline" className="h-11" asChild>
          <a href={exportHref()} target="_blank" rel="noopener noreferrer" aria-label="Ekspor mutasi ke Excel">
            <Download className="mr-2 h-4 w-4" aria-hidden /> Ekspor
          </a>
        </Button>
      </div>

      {q.isLoading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : displayedRows.length === 0 ? (
        <EmptyState
          icon={<SearchX className="h-10 w-10" aria-hidden />}
          title={isFiltering ? 'Tidak ada mutasi pada filter ini' : 'Belum ada mutasi'}
          description={
            isFiltering
              ? 'Coba ubah filter bahan, jenis, pelaku, atau rentang tanggal.'
              : 'Mutasi muncul setelah stok masuk, terjual, limbah, atau opname.'
          }
          action={
            isFiltering ? (
              <Button
                variant="outline"
                onClick={() => {
                  setItemId('all')
                  setType('all')
                  setUserId('all')
                  setFrom('')
                  setTo('')
                }}
              >
                Reset Filter
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {clientFiltered && (
            <p className="rounded-xl border border-caramel/40 bg-caramel/10 px-3 py-2 text-xs text-espresso">
              Filter pelaku berlaku pada halaman ini saja — tanpa izin manajemen pengguna, daftar
              pelaku diambil dari mutasi yang sedang dimuat.
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Bahan</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead className="text-right">Perubahan</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Sisa</TableHead>
                  <TableHead className="hidden lg:table-cell">Ref</TableHead>
                  <TableHead className="hidden md:table-cell">Oleh</TableHead>
                  <TableHead className="hidden lg:table-cell">Alasan / catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedRows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(m.createdAt)}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{m.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{m.sku}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-caramel/30 bg-cream text-espresso">
                        {MOVEMENT_LABELS[m.type] ?? m.type}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono font-semibold tabular-nums',
                        m.qtyDelta > 0 ? 'text-success' : m.qtyDelta < 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}
                    >
                      {signedQty(m.qtyDelta)}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                      {formatQty(m.resultingQty)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {m.refOrderCode ? (
                        <Link
                          href={`/orders?search=${encodeURIComponent(m.refOrderCode)}`}
                          className="font-mono text-xs font-semibold text-caramel underline-offset-2 hover:text-espresso hover:underline"
                        >
                          {m.refOrderCode}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{m.user ?? '—'}</TableCell>
                    <TableCell className="hidden max-w-48 truncate text-xs text-muted-foreground lg:table-cell">
                      {[m.reason, m.note].filter(Boolean).join(' — ') || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-2" role="navigation" aria-label="Navigasi halaman">
            <p className="text-xs text-muted-foreground">
              Halaman {page} dari {totalPages} · {total} mutasi
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11"
                disabled={page <= 1 || q.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11"
                disabled={page >= totalPages || q.isFetching}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Halaman berikutnya"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
