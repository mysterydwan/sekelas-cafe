'use client'

// /products — Products & Menu management (SPEC §3.10).
// Admin: full CRUD + variant builder + categories + bulk ops.
// Cashier/Barista: read + availability toggle.
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Copy,
  Download,
  MoreHorizontal,
  PackageOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Tags,
} from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { formatIDR } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/hooks/use-session'
import { useRealtime } from '@/hooks/use-realtime'
import { PageGuard } from '@/components/staff/page-guard'
import { PageHeader, EmptyState, TableSkeleton } from '@/components/staff/primitives'
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
import { ProductEditor, type EditorTarget } from '@/components/management/product-editor'
import { CategoryManager } from '@/components/management/category-manager'
import {
  ProductThumb,
  downloadCsv,
  useDebouncedValue,
  type ProductsResponse,
  type ProductRow,
} from '@/components/management/shared'

export default function ProductsPage() {
  return (
    <PageGuard page="/products">
      <ProductsInner />
    </PageGuard>
  )
}

function ProductsInner() {
  const { can } = useSession()
  const isManager = can('product.manage')
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [categoryId, setCategoryId] = useState('all')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [editor, setEditor] = useState<{ target: EditorTarget; nonce: number } | null>(null)
  const [catManagerNonce, setCatManagerNonce] = useState(0)
  const [deactivateTarget, setDeactivateTarget] = useState<ProductRow | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // `/` focuses search (SPEC §1.5)
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

  const queryKey = ['products', debouncedSearch, categoryId, includeInactive ? 1 : 0]
  const productsQuery = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (categoryId !== 'all') params.set('categoryId', categoryId)
      if (includeInactive) params.set('includeInactive', '1')
      return apiFetch<ProductsResponse>(`/api/products?${params.toString()}`)
    },
    refetchInterval: 60_000, // polling fallback (SPEC: offline tolerance)
  })

  // menu:availability from other sessions — keep table fresh
  useRealtime(['menu:availability'], () => {
    qc.invalidateQueries({ queryKey: ['products'] })
  })

  const categories = productsQuery.data?.categories ?? []
  const products = productsQuery.data?.products ?? []

  const invalidate = () => qc.invalidateQueries({ queryKey: ['products'] })

  // ----- optimistic availability toggle (SPEC: rollback + toast) -----
  const availabilityMutation = useMutation({
    mutationFn: (p: ProductRow) =>
      apiFetch(`/api/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable: !p.isAvailable }),
      }),
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: ['products'] })
      const prev = qc.getQueriesData<ProductsResponse>({ queryKey: ['products'] })
      qc.setQueriesData<ProductsResponse>({ queryKey: ['products'] }, (old) =>
        old
          ? {
              ...old,
              products: old.products.map((x) => (x.id === p.id ? { ...x, isAvailable: !p.isAvailable } : x)),
            }
          : old
      )
      return { prev }
    },
    onError: (e: Error, _p, ctx) => {
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data))
      toast.error(e.message)
    },
    onSuccess: (_d, p) => {
      toast.success(`"${p.name}" ditandai ${!p.isAvailable ? 'tersedia' : 'habis'}`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })

  // ----- activate / deactivate (full edit w/ same values) -----
  const setActiveMutation = useMutation({
    mutationFn: (p: { row: ProductRow; isActive: boolean }) => {
      const r = p.row
      return apiFetch(`/api/products/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: r.name,
          categoryId: r.category.id,
          description: r.description,
          imageUrl: r.imageUrl,
          basePrice: r.basePrice,
          unitCost: r.unitCost,
          isActive: p.isActive,
          isAvailable: r.isAvailable,
          sortOrder: r.sortOrder,
          variantGroups: r.variantGroups.map((g, gi) => ({
            name: g.name,
            selectionType: g.selectionType,
            isRequired: g.isRequired,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            sortOrder: gi,
            options: g.options.map((o, oi) => ({
              label: o.label,
              priceDelta: o.priceDelta,
              isDefault: o.isDefault,
              sortOrder: oi,
            })),
          })),
        }),
      })
    },
    onSuccess: (_d, p) => {
      toast.success(
        p.isActive ? `"${p.row.name}" diaktifkan kembali` : `"${p.row.name}" dinonaktifkan — hilang dari menu & kasir`
      )
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ----- bulk ops -----
  const bulkMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ updated: number }>('/api/products/bulk', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (d: { updated: number }) => {
      toast.success(`${d.updated} produk diperbarui`)
      setSelected(new Set())
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const selectedRows = products.filter((p) => selected.has(p.id))
  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allShownSelected = products.length > 0 && products.every((p) => selected.has(p.id))

  const exportSelection = () => {
    const rows = selectedRows.map((p) => [
      p.name,
      p.category.name,
      p.description ?? '',
      p.imageUrl ?? '',
      p.basePrice,
      p.unitCost ?? '',
      p.sortOrder,
      p.isActive ? 'YA' : 'TIDAK',
      p.isAvailable ? 'YA' : 'TIDAK',
      p.variantGroups
        .map(
          (g) =>
            `${g.name}(${g.selectionType}${g.isRequired ? ',wajib' : ''}): ${g.options
              .map((o) => `${o.label}${o.priceDelta ? `@${o.priceDelta}` : ''}`)
              .join(' / ')}`
        )
        .join(' | '),
    ])
    downloadCsv(
      `produk-sekelas-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Nama', 'Kategori', 'Deskripsi', 'URL Gambar', 'Harga Dasar', 'HPP', 'Urutan', 'Aktif', 'Tersedia', 'Grup Variasi'],
      rows
    )
    toast.success(`${rows.length} produk diekspor — untuk impor di halaman Data`)
  }

  const loading = productsQuery.isLoading
  const isFiltering = !!debouncedSearch || categoryId !== 'all'

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-6">
      <PageHeader
        title="Produk & Menu"
        description="Kelola kategori, produk, variasi, dan ketersediaan menu."
        actions={
          isManager && (
            <>
              <Button variant="outline" className="h-11" onClick={() => setCatManagerNonce((n) => n + 1)}>
                <Tags className="mr-2 h-4 w-4" aria-hidden /> Kelola Kategori
              </Button>
              <Button
                className="h-11 bg-espresso text-cream hover:bg-espresso-soft"
                onClick={() => setEditor({ target: { mode: 'create' }, nonce: Date.now() })}
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden /> Tambah Produk
              </Button>
            </>
          )
        }
      />

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk… (tekan /)"
            aria-label="Cari produk"
            className="h-11 pl-9"
          />
        </div>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="h-11 w-44" aria-label="Filter kategori">
            <SelectValue placeholder="Semua kategori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kategori</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} ({c.productCount})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isManager && (
          <label className="flex h-11 items-center gap-2 rounded-xl border px-3">
            <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} aria-label="Tampilkan produk nonaktif" />
            <span className="text-sm text-muted-foreground">Tampilkan nonaktif</span>
          </label>
        )}
      </div>

      {/* table */}
      {loading ? (
        <TableSkeleton rows={7} cols={isManager ? 7 : 5} />
      ) : products.length === 0 ? (
        products.length === 0 && !isFiltering && !includeInactive ? (
          <EmptyState
            icon={<PackageOpen className="h-10 w-10" aria-hidden />}
            title="Belum ada produk"
            description={isManager ? 'Tambah produk pertama untuk memulai menu.' : 'Menu masih kosong — hubungi admin.'}
            action={
              isManager && (
                <Button className="bg-espresso text-cream hover:bg-espresso-soft" onClick={() => setEditor({ target: { mode: 'create' }, nonce: Date.now() })}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden /> Tambah Produk Pertama
                </Button>
              )
            }
          />
        ) : (
          <EmptyState
            icon={<Search className="h-10 w-10" aria-hidden />}
            title="Tidak ada produk yang cocok"
            description="Coba kata kunci lain atau reset filter."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('')
                  setCategoryId('all')
                  if (isManager) setIncludeInactive(false)
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
                {isManager && (
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#3f2a1d]"
                      checked={allShownSelected}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(products.map((p) => p.id)) : new Set())
                      }
                      aria-label="Pilih semua produk tampil"
                    />
                  </TableHead>
                )}
                <TableHead>Produk</TableHead>
                <TableHead className="hidden sm:table-cell">Kategori</TableHead>
                <TableHead className="text-right">Harga</TableHead>
                <TableHead className="hidden text-center md:table-cell">Variasi</TableHead>
                <TableHead className="hidden text-center lg:table-cell">Status</TableHead>
                <TableHead className="text-center">Tersedia</TableHead>
                {isManager && <TableHead className="hidden text-center md:table-cell">Urutan</TableHead>}
                {isManager && <TableHead className="w-10 text-right">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow
                  key={p.id}
                  className={cn(!p.isActive && 'opacity-60')}
                  data-state={selected.has(p.id) ? 'selected' : undefined}
                >
                  {isManager && (
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#3f2a1d]"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        aria-label={`Pilih ${p.name}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <ProductThumb imageUrl={p.imageUrl} name={p.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.name}</p>
                        {isManager ? (
                          <p className="text-xs text-muted-foreground">
                            {p.unitCost !== null ? `HPP ${formatIDR(p.unitCost)}` : 'HPP belum diisi'}
                            {p.orderCount > 0 && ` · dipakai ${p.orderCount} item pesanan`}
                          </p>
                        ) : (
                          p.description && <p className="truncate text-xs text-muted-foreground">{p.description}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline" className="border-caramel/30 bg-cream text-espresso">
                      {p.category.name}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={p.basePrice} />
                  </TableCell>
                  <TableCell className="hidden text-center text-sm text-muted-foreground md:table-cell">
                    {p.variantGroups.length > 0 ? (
                      <span title={p.variantGroups.map((g) => g.name).join(', ')}>
                        {p.variantGroups.length} grup
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="hidden text-center lg:table-cell">
                    {p.isActive ? (
                      <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                        Aktif
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                        Nonaktif
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={p.isAvailable}
                      onCheckedChange={() => availabilityMutation.mutate(p)}
                      disabled={!can('availability.toggle') || availabilityMutation.isPending}
                      aria-label={`Tandai ${p.name} ${p.isAvailable ? 'habis' : 'tersedia'}`}
                    />
                  </TableCell>
                  {isManager && <TableCell className="hidden text-center font-mono tabular-nums md:table-cell">{p.sortOrder}</TableCell>}
                  {isManager && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11"
                          onClick={() => setEditor({ target: { mode: 'edit', product: p }, nonce: Date.now() })}
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11"
                          onClick={() => setEditor({ target: { mode: 'create', prefill: p }, nonce: Date.now() })}
                          aria-label={`Duplikat ${p.name}`}
                        >
                          <Copy className="h-4 w-4" aria-hidden />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Menu lain untuk ${p.name}`}>
                              <MoreHorizontal className="h-4 w-4" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {p.isActive ? (
                              <DropdownMenuItem onClick={() => setDeactivateTarget(p)} className="text-destructive focus:text-destructive">
                                Nonaktifkan produk
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => setActiveMutation.mutate({ row: p, isActive: true })}>
                                Aktifkan kembali
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setSelected(new Set([p.id]))
                                toast.info('Produk dipilih — gunakan tombol bulk di bawah untuk ekspor')
                              }}
                            >
                              Pilih untuk ekspor
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {productsQuery.isError && (
        <p className="text-sm text-destructive" role="alert">
          Gagal memuat produk — {productsQuery.error instanceof Error ? productsQuery.error.message : 'coba muat ulang'}.{' '}
          <Button variant="link" className="h-auto p-0" onClick={() => productsQuery.refetch()}>
            Muat ulang
          </Button>
        </p>
      )}

      {/* floating bulk bar */}
      {isManager && selected.size > 0 && (
        <div
          className="fixed bottom-20 left-1/2 z-40 flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border bg-espresso-deep px-4 py-3 text-cream shadow-lg md:bottom-6"
          role="toolbar"
          aria-label="Tindakan massal"
        >
          <span className="text-sm font-semibold">{selected.size} dipilih</span>
          <Button
            size="sm"
            variant="secondary"
            className="h-11 border border-caramel/40 bg-caramel/15 text-caramel-pale hover:bg-caramel/25"
            onClick={() => bulkMutation.mutate({ ids: [...selected], action: 'AVAILABILITY', value: true })}
          >
            Set Tersedia
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-11 border border-caramel/40 bg-caramel/15 text-caramel-pale hover:bg-caramel/25"
            onClick={() => bulkMutation.mutate({ ids: [...selected], action: 'AVAILABILITY', value: false })}
          >
            Set Habis
          </Button>
          <Select
            onValueChange={(v) => {
              if (v && v !== '__none') bulkMutation.mutate({ ids: [...selected], action: 'CATEGORY', value: v })
            }}
          >
            <SelectTrigger className="h-11 w-40 border-caramel/40 bg-caramel/15 text-caramel-pale" aria-label="Pindah kategori terpilih">
              <SelectValue placeholder="Pindah Kategori" />
            </SelectTrigger>
            <SelectContent>
              {categories
                .filter((c) => c.isActive)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="secondary"
            className="h-11 border border-caramel/40 bg-caramel/15 text-caramel-pale hover:bg-caramel/25"
            onClick={exportSelection}
          >
            <Download className="mr-1 h-4 w-4" aria-hidden /> Ekspor Pilihan
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11 text-cream/70 hover:bg-cream/10 hover:text-cream"
            onClick={() => setSelected(new Set())}
            aria-label="Kosongkan pilihan"
          >
            ✕
          </Button>
        </div>
      )}

      {/* editor drawer — remounted per open so drafts/state reset cleanly */}
      {editor && (
        <ProductEditor
          key={editor.nonce}
          target={editor.target}
          categories={categories}
          onClosed={() => setEditor(null)}
          onSaved={invalidate}
        />
      )}

      {/* category manager — remounted per open */}
      {catManagerNonce > 0 && (
        <CategoryManager
          key={catManagerNonce}
          categories={categories}
          onClosed={() => setCatManagerNonce(0)}
          onChanged={invalidate}
        />
      )}

      {/* deactivate confirm */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan “{deactivateTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Produk hilang dari menu pelanggan dan kasir, tetapi{' '}
              {deactivateTarget && deactivateTarget.orderCount > 0
                ? `${deactivateTarget.orderCount} item pesanan lampau tetap menyimpan namanya. `
                : 'riwayat pesanan tetap utuh. '}
              Kamu bisa mengaktifkannya kembali kapan saja dari menu ⋯.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deactivateTarget) setActiveMutation.mutate({ row: deactivateTarget, isActive: false })
                setDeactivateTarget(null)
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
