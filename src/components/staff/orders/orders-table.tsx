'use client'

// Orders table (SPEC §3.8): shadcn Table in a Card — mono code/time/amount
// columns (Waktu & Total sortable via the API's sort/dir params), type w/
// customer sub-line, payment label, status badge, row click to detail, quick
// actions behind a row overflow menu (inline pay / serve / prints),
// 50-per-page pagination controls.

import Link from 'next/link'
import { ArrowUpDown, Banknote, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MoreHorizontal, Printer, QrCode, ReceiptText, Wallet } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState, TableSkeleton } from '@/components/staff/primitives'
import { Money } from '@/components/staff/money'
import { OrderStatusBadge } from '@/components/staff/status-badges'
import { formatNumber, formatTime } from '@/lib/format'
import { ORDER_TYPE_LABEL, type OrderListResult, type OrderListRow } from '@/lib/types'
import { cn } from '@/lib/utils'

export type OrdersSortField = 'time' | 'total'
export type OrdersSortDir = 'asc' | 'desc'

export interface OrdersTableProps {
  result: OrderListResult | undefined
  loading: boolean
  errorMessage: string | null
  page: number
  onPageChange: (page: number) => void
  onRetry: () => void
  onResetFilters: () => void
  /** Active sort column + direction (URL-synced, default time desc). */
  sort: OrdersSortField
  dir: OrdersSortDir
  onSortChange: (field: OrdersSortField) => void
  canServe: boolean
  canPay: boolean
  onServe: (row: OrderListRow) => void
  onPayRow: (row: OrderListRow) => void
  onReprint: (row: OrderListRow, template: 'KOT' | 'RECEIPT') => void
  onOpenRow: (id: string) => void
}

/** Sortable column header: chevron shows direction, click toggles asc/desc. */
function SortHeader({
  label,
  field,
  sort,
  dir,
  onSortChange,
}: {
  label: string
  field: OrdersSortField
  sort: OrdersSortField
  dir: OrdersSortDir
  onSortChange: (field: OrdersSortField) => void
}) {
  const active = sort === field
  const Icon = active ? (dir === 'asc' ? ChevronUp : ChevronDown) : ArrowUpDown
  return (
    <button
      type="button"
      onClick={() => onSortChange(field)}
      aria-label={`Urutkan berdasarkan ${label} (${active ? (dir === 'asc' ? 'naik' : 'turun') : 'turun'})`}
      className="inline-flex min-h-11 items-center gap-1 font-medium transition-colors hover:text-foreground"
    >
      {label}
      <Icon className={active ? 'h-3.5 w-3.5' : 'h-3.5 w-3.5 opacity-50'} aria-hidden />
    </button>
  )
}

function PaymentCell({ label }: { label: string }) {
  if (label === 'Belum bayar') {
    return <span className="text-xs font-medium text-muted-foreground">Belum bayar</span>
  }
  if (label === 'Verifikasi QRIS') {
    return (
      <span className="rounded-full border border-caramel/50 bg-caramel/15 px-2 py-0.5 text-xs font-semibold text-warning">
        Verifikasi QRIS
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium">
      {label.includes('CASH') && <Banknote className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
      {label.includes('QRIS') && <QrCode className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
      {label.replace('CASH', 'Tunai')}
    </span>
  )
}

export function OrdersTable(props: OrdersTableProps) {
  const {
    result,
    loading,
    errorMessage,
    page,
    onPageChange,
    onRetry,
    onResetFilters,
    sort,
    dir,
    onSortChange,
    canServe,
    canPay,
    onServe,
    onPayRow,
    onReprint,
    onOpenRow,
  } = props

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <TableSkeleton rows={8} cols={7} />
      </div>
    )
  }

  if (errorMessage) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Gagal memuat daftar pesanan</AlertTitle>
        <AlertDescription>
          {errorMessage}
          <Button variant="outline" size="sm" className="mt-2 min-h-11" onClick={onRetry}>
            Coba Lagi
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!result || result.rows.length === 0) {
    return (
      <EmptyState
        icon={<ReceiptText className="h-10 w-10" aria-hidden />}
        title="Tidak ada pesanan pada filter ini"
        description="Coba ubah rentang tanggal atau kosongkan pencarian — pesanan tersimpan lengkap per hari."
        action={
          <Button variant="outline" className="min-h-11" onClick={onResetFilters}>
            Reset Filter
          </Button>
        }
      />
    )
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow className="bg-cream/70 hover:bg-cream/70 dark:bg-secondary/40 dark:hover:bg-secondary/40">
            <TableHead className="pl-4">Kode</TableHead>
            <TableHead aria-sort={sort === 'time' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <SortHeader label="Waktu" field="time" sort={sort} dir={dir} onSortChange={onSortChange} />
            </TableHead>
            <TableHead>Tipe</TableHead>
            <TableHead className="text-right">Item</TableHead>
            <TableHead
              className="text-right"
              aria-sort={sort === 'total' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <SortHeader label="Total" field="total" sort={sort} dir={dir} onSortChange={onSortChange} />
            </TableHead>
            <TableHead>Pembayaran</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Kasir</TableHead>
            <TableHead className="w-12 pr-2">
              <span className="sr-only">Aksi cepat</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={() => onOpenRow(row.id)}
              className={cn('cursor-pointer', row.status === 'CANCELLED' && 'opacity-60')}
            >
              <TableCell className="pl-4">
                <Link
                  href={`/orders/${row.id}`}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Buka detail pesanan ${row.code}`}
                  className="font-mono text-sm font-semibold tracking-wide hover:underline"
                >
                  <span className={cn(row.status === 'CANCELLED' && 'line-through')}>{row.code}</span>
                </Link>
              </TableCell>
              <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatTime(row.createdAt)}
              </TableCell>
              <TableCell>
                <div className="min-w-0">
                  <p className="whitespace-nowrap font-medium">{ORDER_TYPE_LABEL[row.type]}</p>
                  <p className="max-w-44 truncate text-xs text-muted-foreground">{row.customerLabel}</p>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{row.itemCount}</TableCell>
              <TableCell className="text-right">
                <Money value={row.total} className="text-sm font-semibold" />
              </TableCell>
              <TableCell>
                <PaymentCell label={row.paymentLabel} />
              </TableCell>
              <TableCell>
                <OrderStatusBadge status={row.status} />
              </TableCell>
              <TableCell className="max-w-28 truncate text-muted-foreground">{row.cashier ?? '—'}</TableCell>
              <TableCell className="pr-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label={`Aksi cepat pesanan ${row.code}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {canPay && row.paymentLabel === 'Belum bayar' && (
                      <DropdownMenuItem onClick={() => onPayRow(row)}>
                        <Wallet className="mr-2 h-4 w-4" aria-hidden /> Terima Bayar
                      </DropdownMenuItem>
                    )}
                    {row.status === 'READY' && canServe && (
                      <DropdownMenuItem onClick={() => onServe(row)}>
                        <CheckCheck className="mr-2 h-4 w-4" aria-hidden /> Sudah Diserahkan
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => onReprint(row, 'RECEIPT')}>
                      <ReceiptText className="mr-2 h-4 w-4" aria-hidden /> Cetak Struk
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onReprint(row, 'KOT')}>
                      <Printer className="mr-2 h-4 w-4" aria-hidden /> Cetak KOT
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {formatNumber(result.total)} pesanan · {result.rows.length} ditampilkan
        </p>
        <nav className="flex items-center gap-2" aria-label="Navigasi halaman">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> Sebelumnya
          </Button>
          <span className="min-w-14 text-center font-mono text-sm tabular-nums text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Berikutnya <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </nav>
      </div>
    </Card>
  )
}
