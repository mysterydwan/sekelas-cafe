'use client'

// Stock Items tab (SPEC §3.11): stats, filters, table with row actions.
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  MoreHorizontal,
  PackageOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/hooks/use-session'
import { StatCard, EmptyState, TableSkeleton } from '@/components/staff/primitives'
import { StockStatusBadge } from '@/components/staff/status-badges'
import { Money } from '@/components/staff/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { StockItemDialog } from './stock-item-dialogs'
import { AdjustDialog } from './stock-adjust-dialog'
import { HistoryDrawer } from './stock-history-drawer'
import {
  formatQty,
  useDebouncedValue,
  type StockItemDTO,
} from './shared'

type ItemsResponse = { items: StockItemDTO[]; totalValue: number }

export function StockItemsTab({
  allItems,
  onChanged,
}: {
  allItems: StockItemDTO[]
  onChanged: () => void
}) {
  const { can } = useSession()
  const canManage = can('stock.manage')
  const canDelete = can('stock.delete')
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [unit, setUnit] = useState('all')
  const [lowOnly, setLowOnly] = useState(false)
  const [editItem, setEditItem] = useState<StockItemDTO | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [adjustItem, setAdjustItem] = useState<StockItemDTO | null>(null)
  const [wasteOpen, setWasteOpen] = useState(false)
  const [historyItem, setHistoryItem] = useState<StockItemDTO | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StockItemDTO | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

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

  const q = useQuery({
    queryKey: ['stock', 'items', debouncedSearch, lowOnly ? 1 : 0, unit],
    queryFn: () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (lowOnly) params.set('lowOnly', '1')
      if (unit !== 'all') params.set('unit', unit)
      return apiFetch<ItemsResponse>(`/api/stock/items?${params.toString()}`)
    },
    refetchInterval: 60_000,
  })

  const items = q.data?.items ?? []
  const totalValue = q.data?.totalValue ?? 0
  const lowCount = allItems.filter((i) => i.status !== 'AMAN').length

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/stock/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Bahan dinonaktifkan — riwayat mutasinya tetap utuh')
      onChanged()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const unitOptions = ['gr', 'ml', 'pcs', 'cup', 'btl']
  const isFiltering = !!debouncedSearch || lowOnly || unit !== 'all'

  return (
    <div className="space-y-4">
      {/* stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total bahan" value={allItems.length} hint="bahan aktif dilacak" />
        <StatCard
          label="Rendah / habis"
          value={lowCount}
          hint="perlu dibelanjakan"
          accent={lowCount > 0}
        />
        <div className="col-span-2 rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nilai stok</p>
          <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums">
            <Money value={totalValue} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isFiltering ? 'nilai sesuai filter aktif' : 'perkiraan jumlah × harga satuan'}
          </p>
        </div>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama atau SKU… (tekan /)"
            aria-label="Cari bahan"
            className="h-11 pl-9"
          />
        </div>
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger className="h-11 w-32" aria-label="Filter satuan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua satuan</SelectItem>
            {unitOptions.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex h-11 items-center gap-2 rounded-xl border px-3">
          <Switch checked={lowOnly} onCheckedChange={setLowOnly} aria-label="Hanya rendah atau habis" />
          <span className="whitespace-nowrap text-sm text-muted-foreground">Hanya rendah/habis</span>
        </label>
        {canManage && (
          <>
            <Button
              variant="outline"
              className="h-11 border-warning/40 text-warning hover:bg-warning/10"
              onClick={() => setWasteOpen(true)}
            >
              <AlertTriangle className="mr-2 h-4 w-4" aria-hidden /> Catat Limbah
            </Button>
            <Button
              className="h-11 bg-espresso text-cream hover:bg-espresso-soft"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden /> Tambah Bahan
            </Button>
          </>
        )}
      </div>

      {/* table */}
      {q.isLoading ? (
        <TableSkeleton rows={7} cols={7} />
      ) : items.length === 0 ? (
        allItems.length === 0 ? (
          <EmptyState
            icon={<PackageOpen className="h-10 w-10" aria-hidden />}
            title="Belum ada bahan"
            description="Tambah bahan pertama, atau impor dari Excel lewat halaman Data."
            action={
              canManage ? (
                <Button className="bg-espresso text-cream hover:bg-espresso-soft" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden /> Tambah Bahan
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            icon={<Search className="h-10 w-10" aria-hidden />}
            title="Tidak ada bahan yang cocok"
            description="Coba kata kunci lain atau reset filter."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('')
                  setLowOnly(false)
                  setUnit('all')
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Reset Filter
              </Button>
            }
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Bahan</TableHead>
                <TableHead className="hidden sm:table-cell">Satuan</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden text-right md:table-cell">Batas rendah</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Harga sat.</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Diperbarui</TableHead>
                <TableHead className="w-10 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id} className={cn(i.status !== 'AMAN' && 'bg-caramel/10')}>
                  <TableCell className="font-mono text-xs font-semibold">{i.sku}</TableCell>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{i.unit}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatQty(i.qty)}</TableCell>
                  <TableCell>
                    <StockStatusBadge status={i.status} />
                  </TableCell>
                  <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">
                    {formatQty(i.lowThreshold)}
                  </TableCell>
                  <TableCell className="hidden text-right lg:table-cell">
                    <Money value={i.unitCost} />
                  </TableCell>
                  <TableCell className="hidden text-right text-xs text-muted-foreground lg:table-cell">
                    {formatDateTime(i.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Aksi untuk ${i.name}`}>
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canManage && (
                          <DropdownMenuItem onClick={() => setAdjustItem(i)}>
                            Sesuaikan stok…
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setHistoryItem(i)}>Riwayat mutasi</DropdownMenuItem>
                        {canManage && (
                          <DropdownMenuItem onClick={() => setEditItem(i)}>
                            <Pencil className="mr-2 h-4 w-4" aria-hidden /> Edit bahan
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(i)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" aria-hidden /> Nonaktifkan bahan
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {q.isError && (
        <p className="text-sm text-destructive" role="alert">
          Gagal memuat stok —{' '}
          <button className="underline" onClick={() => q.refetch()}>
            coba muat ulang
          </button>
        </p>
      )}

      {/* dialogs */}
      {createOpen && (
        <StockItemDialog
          key="create-item"
          item={null}
          onClosed={() => setCreateOpen(false)}
          onSaved={onChanged}
        />
      )}
      {editItem && (
        <StockItemDialog
          key={`edit-${editItem.id}`}
          item={editItem}
          onClosed={() => setEditItem(null)}
          onSaved={onChanged}
        />
      )}
      {adjustItem && (
        <AdjustDialog
          key={`adjust-${adjustItem.id}`}
          item={adjustItem}
          items={allItems}
          onClosed={() => setAdjustItem(null)}
          onSaved={onChanged}
        />
      )}
      {wasteOpen && (
        <AdjustDialog
          key="waste"
          item={null}
          items={allItems}
          presetType="WASTE"
          onClosed={() => setWasteOpen(false)}
          onSaved={onChanged}
        />
      )}
      {historyItem && (
        <HistoryDrawer key={`history-${historyItem.id}`} item={historyItem} onClosed={() => setHistoryItem(null)} />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Bahan hilang dari daftar dan resep, tetapi seluruh riwayat mutasi tetap tersimpan dan
              tetap teratribusi. Tindakan ini untuk bahan yang sudah tidak dipakai lagi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              Nonaktifkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
