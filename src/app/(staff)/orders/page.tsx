'use client'

// /orders — Orders list (SPEC §3.8): URL-synced filter bar (date presets,
// status/type/payment/cashier, `/`-focus search), 50/page table with quick
// actions in the row overflow menu, Excel export handoff to /data.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarDays, FileSpreadsheet, Search } from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { useSession } from '@/hooks/use-session'
import { useRealtime } from '@/hooks/use-realtime'
import { addDaysJakarta, formatNumber, todayJakarta } from '@/lib/format'
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  type OrderDTO,
  type OrderListResult,
  type OrderListRow,
  type OrderStatus,
  type OrderType,
  type SettingsDTO,
  type UserDTO,
} from '@/lib/types'
import { PageGuard } from '@/components/staff/page-guard'
import { PageHeader, TableSkeleton } from '@/components/staff/primitives'
import { OrdersTable, type OrdersSortDir, type OrdersSortField } from '@/components/staff/orders/orders-table'
import { ChargeDialog, type ChargeResult } from '@/components/staff/charge-modals'
import { printKot, printReceipt } from '@/components/staff/receipt'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type StatusFilter = OrderStatus | 'ALL'
type TypeFilter = OrderType | 'ALL'
type PaymentFilter = 'ALL' | 'CASH' | 'QRIS' | 'UNPAID'
const PAYMENT_FILTERS: { value: PaymentFilter; label: string }[] = [
  { value: 'ALL', label: 'Semua pembayaran' },
  { value: 'CASH', label: 'Tunai' },
  { value: 'QRIS', label: 'QRIS' },
  { value: 'UNPAID', label: 'Belum bayar' },
]

export default function OrdersPage() {
  return (
    <PageGuard page="/orders">
      <Suspense
        fallback={
          <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-6">
            <PageHeader title="Pesanan" />
            <TableSkeleton rows={8} cols={7} />
          </div>
        }
      >
        <OrdersInner />
      </Suspense>
    </PageGuard>
  )
}

function OrdersInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const { user, can } = useSession()

  const today = todayJakarta()

  // ---- filters (initial values from the URL — shareable, SPEC §3.8) ----
  const [from, setFrom] = useState(() => sp.get('from') || today)
  const [to, setTo] = useState(() => sp.get('to') || today)
  const [status, setStatus] = useState<StatusFilter>(() => (sp.get('status') as OrderStatus) || 'ALL')
  const [type, setType] = useState<TypeFilter>(() => (sp.get('type') as OrderType) || 'ALL')
  const [payment, setPayment] = useState<PaymentFilter>(
    () => (['CASH', 'QRIS', 'UNPAID'].includes(sp.get('payment') ?? '') ? (sp.get('payment') as PaymentFilter) : 'ALL')
  )
  const [cashierId, setCashierId] = useState(() => sp.get('cashierId') || 'ALL')
  const [searchInput, setSearchInput] = useState(() => sp.get('search') || '')
  const [search, setSearch] = useState(() => sp.get('search') || '')
  const [page, setPage] = useState(() => Math.max(1, parseInt(sp.get('page') || '1', 10) || 1))
  const [sort, setSort] = useState<OrdersSortField>(() => (sp.get('sort') === 'total' ? 'total' : 'time'))
  const [dir, setDir] = useState<OrdersSortDir>(() => (sp.get('dir') === 'asc' ? 'asc' : 'desc'))

  const searchRef = useRef<HTMLInputElement>(null)

  // `/` focuses search (SPEC §1.5 shortcuts); the field also auto-focuses on
  // mount for fine-pointer devices so palette "Cari pesanan" lands ready to type.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) searchRef.current?.focus()
  }, [])

  // Debounce the search field into the applied filter
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput), 350)
    return () => window.clearTimeout(t)
  }, [searchInput])

  // Adopt external ?search= changes (command palette deep-links) without
  // fighting the local debounce/mirror loop.
  const lastUrlSearch = useRef(sp.get('search'))
  useEffect(() => {
    const urlSearch = sp.get('search')
    if (urlSearch === lastUrlSearch.current) return
    lastUrlSearch.current = urlSearch
    if ((urlSearch ?? '') !== search.trim()) {
      // deferred to avoid a synchronous cascade while adopting external changes
      const initial = setTimeout(() => {
        setSearchInput(urlSearch ?? '')
        setSearch(urlSearch ?? '')
        setPage(1)
      }, 0)
      return () => clearTimeout(initial)
    }
  }, [sp])

  // Mirror the active filters into the URL without a history entry
  useEffect(() => {
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (status !== 'ALL') p.set('status', status)
    if (type !== 'ALL') p.set('type', type)
    if (payment !== 'ALL') p.set('payment', payment)
    if (cashierId !== 'ALL') p.set('cashierId', cashierId)
    if (search.trim()) p.set('search', search.trim())
    if (page > 1) p.set('page', String(page))
    if (sort !== 'time') p.set('sort', sort)
    if (dir !== 'desc') p.set('dir', dir)
    router.replace(`?${p.toString()}`, { scroll: false })
  }, [router, from, to, status, type, payment, cashierId, search, page, sort, dir])

  const resetFilters = () => {
    setFrom(today)
    setTo(today)
    setStatus('ALL')
    setType('ALL')
    setPayment('ALL')
    setCashierId('ALL')
    setSearchInput('')
    setSearch('')
    setPage(1)
  }

  const toggleSort = (field: OrdersSortField) => {
    if (sort === field) setDir(dir === 'desc' ? 'asc' : 'desc')
    else {
      setSort(field)
      setDir('desc')
    }
    setPage(1)
  }

  // ---- data ----
  const queryParams = useMemo(() => {
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (status !== 'ALL') p.set('status', status)
    if (type !== 'ALL') p.set('type', type)
    if (payment !== 'ALL') p.set('paymentMethod', payment)
    if (cashierId !== 'ALL') p.set('cashierId', cashierId)
    if (search.trim()) p.set('search', search.trim())
    if (page > 1) p.set('page', String(page))
    p.set('sort', sort)
    p.set('dir', dir)
    return p.toString()

  }, [from, to, status, type, payment, cashierId, search, page, sort, dir])

  const {
    data: result,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['orders-list', queryParams],
    queryFn: () => apiFetch<OrderListResult>(`/api/orders?${queryParams}`),
    refetchInterval: 15_000,
    placeholderData: (prev) => prev,
  })

  const { data: settings } = useQuery({
    queryKey: ['orders-settings'],
    queryFn: () => apiFetch<SettingsDTO>('/api/settings'),
    staleTime: 60_000,
  })

  const isAdmin = user?.role === 'ADMIN'
  // Serve/deliver transitions accept ADMIN, BARISTA and CASHIER (API contract);
  // PREPARING/READY remain kitchen-only server-side.
  const canServe = user?.role === 'ADMIN' || user?.role === 'BARISTA' || user?.role === 'CASHIER'
  const canPay = can('payment.confirm')
  const { data: usersData } = useQuery({
    queryKey: ['orders-users'],
    queryFn: () => apiFetch<{ users: UserDTO[] }>('/api/users'),
    enabled: isAdmin,
    staleTime: 120_000,
  })

  useRealtime(['order:created', 'order:status', 'order:itemChecked', 'order:needsAck', 'payment:updated'], () => {
    void refetch()
  })

  // ---- quick actions ----
  const openDetail = (id: string) => router.push(`/orders/${id}`)

  // Inline take-payment (same ChargeDialog as POS) for unpaid rows.
  const [payTarget, setPayTarget] = useState<OrderListRow | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const openPay = (row: OrderListRow) => {
    setPayTarget(row)
    setPayOpen(true)
  }

  const serve = async (row: { id: string; code: string }) => {
    try {
      await apiFetch(`/api/orders/${row.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'COMPLETED' }),
      })
      toast.success(`${row.code} selesai — sudah diserahkan`)
      await refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menandai pesanan selesai')
    }
  }

  const reprint = async (row: { id: string; code: string }, template: 'KOT' | 'RECEIPT') => {
    try {
      const order = await apiFetch<OrderDTO>(`/api/orders/${row.id}`)
      if (settings) {
        try {
          await apiFetch(`/api/orders/${row.id}/reprint`, {
            method: 'POST',
            body: JSON.stringify({ template }),
          })
        } catch {
          /* audit-log failure must never block printing */
        }
        if (template === 'KOT') printKot(order, settings.receipts)
        else printReceipt(order, settings.receipts)
        toast.success(`Mencetak ${template === 'KOT' ? 'struk dapur' : 'struk pelanggan'} ${row.code}`)
      } else {
        toast.error('Pengaturan belum termuat — coba lagi sebentar')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mencetak')
    }
  }

  // ---- date presets ----
  const yesterday = addDaysJakarta(today, -1)
  const weekAgo = addDaysJakarta(today, -6)
  const activePreset: 'today' | 'yesterday' | '7d' | 'custom' =
    from === today && to === today
      ? 'today'
      : from === yesterday && to === yesterday
        ? 'yesterday'
        : from === weekAgo && to === today
          ? '7d'
          : 'custom'

  const applyPreset = (next: { from: string; to: string }) => {
    setFrom(next.from)
    setTo(next.to)
    setPage(1)
  }

  const presetButton = (id: 'today' | 'yesterday' | '7d', label: string, value: { from: string; to: string }) => (
    <button
      key={id}
      type="button"
      onClick={() => applyPreset(value)}
      aria-pressed={activePreset === id}
      className={cn(
        'flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors',
        activePreset === id
          ? 'border-transparent bg-espresso text-cream hover:bg-espresso-soft'
          : 'bg-background text-muted-foreground hover:border-caramel hover:text-foreground'
      )}
    >
      <CalendarDays className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  )

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-6">
      <PageHeader
        title="Pesanan"
        description="Semua pesanan kasir maupun pelanggan mandiri — klik baris untuk detail lengkap."
        actions={
          <Button variant="outline" className="min-h-11" asChild>
            <Link href={`/data?from=${from}&to=${to}`}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden /> Ekspor ke Excel
            </Link>
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {presetButton('today', 'Hari ini', { from: today, to: today })}
          {presetButton('yesterday', 'Kemarin', { from: yesterday, to: yesterday })}
          {presetButton('7d', '7 hari', { from: weekAgo, to: today })}
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.target.value)
                setPage(1)
              }}
              aria-label="Dari tanggal"
              className="min-h-11 w-[9.5rem]"
            />
            <span className="text-muted-foreground" aria-hidden>
              →
            </span>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value)
                setPage(1)
              }}
              aria-label="Sampai tanggal"
              className="min-h-11 w-[9.5rem]"
            />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as StatusFilter)
              setPage(1)
            }}
          >
            <SelectTrigger className="min-h-11 w-full" aria-label="Filter status">
              <SelectValue placeholder="Semua status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua status</SelectItem>
              {Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as TypeFilter)
              setPage(1)
            }}
          >
            <SelectTrigger className="min-h-11 w-full" aria-label="Filter tipe">
              <SelectValue placeholder="Semua tipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua tipe</SelectItem>
              {Object.entries(ORDER_TYPE_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={payment}
            onValueChange={(v) => {
              setPayment(v as PaymentFilter)
              setPage(1)
            }}
          >
            <SelectTrigger className="min-h-11 w-full" aria-label="Filter pembayaran">
              <SelectValue placeholder="Semua pembayaran" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isAdmin && (
            <Select
              value={cashierId}
              onValueChange={(v) => {
                setCashierId(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="min-h-11 w-full" aria-label="Filter kasir">
                <SelectValue placeholder="Semua kasir" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua kasir</SelectItem>
                {(usersData?.users ?? [])
                  .filter((u) => u.isActive)
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              ref={searchRef}
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value)
                setPage(1)
              }}
              placeholder="Cari kode, nama, meja, lokasi…"
              aria-label="Cari pesanan"
              className="min-h-11 pl-8 pr-9"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              /
            </kbd>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {formatNumber(result?.total ?? 0)} pesanan cocok dengan filter aktif
          {result && result.total > result.pageSize ? ` — menampilkan halaman ${result.page} dari ${Math.ceil(result.total / result.pageSize)}` : ''}
        </p>
      </div>

      <OrdersTable
        result={result}
        loading={isPending && !result}
        errorMessage={isError && !result ? (error instanceof Error ? error.message : 'Gagal memuat daftar pesanan') : null}
        page={page}
        onPageChange={setPage}
        onRetry={() => void refetch()}
        onResetFilters={resetFilters}
        sort={sort}
        dir={dir}
        onSortChange={toggleSort}
        canServe={canServe}
        canPay={canPay}
        onPayRow={openPay}
        onServe={(row) => void serve(row)}
        onReprint={(row, template) => void reprint(row, template)}
        onOpenRow={openDetail}
      />

      {/* Inline take-payment — the same dialog POS uses (SPEC §3.6) */}
      {settings && payTarget && (
        <ChargeDialog
          open={payOpen}
          onOpenChange={(o) => {
            setPayOpen(o)
            if (!o) setPayTarget(null)
          }}
          total={payTarget.total}
          settings={settings}
          title={`Terima Bayar ${payTarget.code}`}
          subtitle={payTarget.customerLabel !== '—' ? payTarget.customerLabel : undefined}
          onSubmit={async (payment): Promise<ChargeResult> => {
            const order = await apiFetch<OrderDTO>(`/api/orders/${payTarget.id}/payment`, {
              method: 'POST',
              body: JSON.stringify(payment),
            })
            void refetch()
            return {
              order,
              printKot: !!settings.receipts.autoPrintKot && order.status === 'PAID',
              printReceipt: !!settings.receipts.autoPrintReceipt,
            }
          }}
        />
      )}
    </div>
  )
}
