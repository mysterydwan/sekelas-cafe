'use client'

// Recipes tab (SPEC §3.11, admin only): per-product ingredient lines with
// "per 1 porsi" math preview + coverage report of products without recipes.
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChefHat, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { formatIDR } from '@/lib/format'
import { Money } from '@/components/staff/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableSkeleton } from '@/components/staff/primitives'
import { formatQty, type ProductsResponse, type RecipeLine, type StockItemDTO } from './shared'

interface CoverageResponse {
  products: { id: string; name: string; hasRecipe: boolean }[]
}

interface RecipeResponse {
  productId: string
  productName: string | null
  lines: RecipeLine[]
}

export function StockRecipesTab({ allItems }: { allItems: StockItemDTO[] }) {
  const qc = useQueryClient()
  const [productId, setProductId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [lines, setLines] = useState<RecipeLine[]>([])

  const productsQuery = useQuery({
    queryKey: ['products', 'for-recipes'],
    queryFn: () => apiFetch<ProductsResponse>('/api/products'),
  })
  const products = useMemo(
    () => (productsQuery.data?.products ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [productsQuery.data]
  )

  const recipeQuery = useQuery({
    queryKey: ['stock', 'recipes', productId],
    queryFn: () => apiFetch<RecipeResponse>(`/api/stock/recipes?productId=${productId}`),
    enabled: !!productId,
  })

  const coverageQuery = useQuery({
    queryKey: ['stock', 'recipes-coverage'],
    queryFn: () => apiFetch<CoverageResponse>('/api/stock/recipes/coverage'),
  })

  // sync local lines when a different product's recipe loads (per-product swap)
  useEffect(() => {
    if (recipeQuery.data && recipeQuery.data.productId === productId) {
      const t = setTimeout(() => setLines(recipeQuery.data.lines.map((l) => ({ ...l }))), 0)
      return () => clearTimeout(t)
    }
  }, [recipeQuery.data, productId])

  const itemById = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems])

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => p.name.toLowerCase().includes(q))
  }, [products, productSearch])

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!productId) throw new Error('Pilih produk dulu')
      const clean = lines.filter((l) => l.stockItemId && l.qtyPerUnit > 0)
      return apiFetch('/api/stock/recipes', {
        method: 'PUT',
        body: JSON.stringify({ productId, lines: clean.map((l) => ({ stockItemId: l.stockItemId, qtyPerUnit: l.qtyPerUnit })) }),
      })
    },
    onSuccess: () => {
      toast.success('Resep disimpan — pengurangan stok berlaku untuk pesanan berikutnya')
      qc.invalidateQueries({ queryKey: ['stock', 'recipes'] })
      qc.invalidateQueries({ queryKey: ['stock', 'recipes-coverage'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const costPerPortion = lines.reduce((s, l) => {
    const item = itemById.get(l.stockItemId)
    return s + (item ? l.qtyPerUnit * item.unitCost : 0)
  }, 0)
  const selectedProduct = products.find((p) => p.id === productId)
  const withoutRecipe = (coverageQuery.data?.products ?? []).filter((p) => !p.hasRecipe)

  const patchLine = (idx: number, p: Partial<RecipeLine>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...p } : l)))

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="space-y-4 rounded-xl border bg-card p-4" aria-label="Editor resep">
        <div className="flex items-center gap-2">
          <ChefHat className="h-5 w-5 text-caramel" aria-hidden />
          <h3 className="font-display text-base font-semibold">Resep Produk</h3>
        </div>

        <div className="space-y-1.5">
          <Label>Produk</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Cari produk…"
              className="h-11 pl-9"
              aria-label="Cari produk untuk resep"
            />
          </div>
          <Select
            value={productId || undefined}
            onValueChange={(v) => {
              setProductId(v)
              setLines([])
            }}
          >
            <SelectTrigger className="h-11 w-full" aria-label="Pilih produk">
              <SelectValue placeholder="Pilih produk…" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {filteredProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {coverageQuery.data?.products.find((c) => c.id === p.id)?.hasRecipe === false && (
                    <span className="ml-1 text-xs text-warning">(belum ada resep)</span>
                  )}
                </SelectItem>
              ))}
              {filteredProducts.length === 0 && (
                <p className="px-3 py-2 text-center text-xs text-muted-foreground">
                  Tidak ada produk yang cocok dengan “{productSearch}”.
                </p>
              )}
            </SelectContent>
          </Select>
          {productSearch.trim() && (
            <p className="text-xs text-muted-foreground">
              {filteredProducts.length} dari {products.length} produk
            </p>
          )}
        </div>

        {!productId ? (
          <p className="rounded-xl border border-dashed bg-cream/50 p-4 text-sm text-muted-foreground">
            Pilih produk untuk melihat atau menyusun resepnya. Produk tanpa resep tidak mengurangi
            stok saat terjual.
          </p>
        ) : recipeQuery.isLoading ? (
          <TableSkeleton rows={3} cols={2} />
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Bahan per 1 porsi</p>
            {lines.length === 0 && (
              <p className="rounded-xl border border-dashed bg-cream/50 p-3 text-sm text-muted-foreground">
                Belum ada bahan — tambahkan baris pertama.
              </p>
            )}
            {lines.map((l, idx) => (
              <RecipeLineRow
                key={idx}
                idx={idx}
                line={l}
                allItems={allItems}
                item={itemById.get(l.stockItemId) ?? null}
                onPatch={(p) => patchLine(idx, p)}
                onRemove={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
              />
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-11 text-caramel hover:bg-caramel/10"
              onClick={() => setLines((ls) => [...ls, { stockItemId: '', qtyPerUnit: 0 }])}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden /> Bahan
            </Button>

            <Button
              className="h-11 bg-espresso text-cream hover:bg-espresso-soft"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />}
              Simpan Resep
            </Button>
          </div>
        )}
      </section>

      <aside className="space-y-4" aria-label="Ringkasan resep dan cakupan">
        {productId && (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="font-display text-base font-semibold">Per 1 porsi</h3>
            {lines.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Belum ada bahan.</p>
            ) : (
              <>
                <p className="mt-1 text-sm">
                  1 porsi <span className="font-semibold">{selectedProduct?.name ?? 'produk'}</span> memakai:{' '}
                  {lines
                    .filter((l) => l.stockItemId)
                    .map((l) => {
                      const it = itemById.get(l.stockItemId)
                      return `${formatQty(l.qtyPerUnit || 0)} ${it?.unit ?? ''} ${it?.name ?? '?'}`
                    })
                    .join(', ')}
                  .
                </p>
                <p className="mt-2 flex items-baseline justify-between border-t pt-2 text-sm">
                  <span className="text-muted-foreground">Perkiraan biaya bahan</span>
                  <Money value={Math.round(costPerPortion)} className="font-semibold" />
                </p>
                {selectedProduct && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Harga jual {formatIDR(selectedProduct.basePrice)}
                    {costPerPortion > 0 && selectedProduct.basePrice > 0 && (
                      <> · margin ≈ {formatIDR(selectedProduct.basePrice - Math.round(costPerPortion))}</>
                    )}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-display text-base font-semibold">Cakupan Resep</h3>
          {coverageQuery.isLoading ? (
            <p className="mt-1 text-sm text-muted-foreground">Memuat…</p>
          ) : withoutRecipe.length === 0 ? (
            <p className="mt-1 text-sm text-success">
              Semua produk aktif sudah punya resep — bagus.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {withoutRecipe.length} produk belum punya resep (stok tidak berkurang saat terjual):
              </p>
              <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto scrollbar-warm">
                {withoutRecipe.map((p) => (
                  <Badge
                    key={p.id}
                    variant="outline"
                    className="cursor-pointer border-warning/50 bg-caramel/15 py-1.5 text-warning hover:bg-caramel/25"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setProductId(p.id)
                      setLines([])
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setProductId(p.id)
                        setLines([])
                      }
                    }}
                  >
                    {p.name} — isi resep
                  </Badge>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

// ---------- Per-line ingredient picker (searchable) ----------

/** One recipe line: searchable stock-item Select + qty-per-portion + remove. */
function RecipeLineRow({
  idx,
  line,
  allItems,
  item,
  onPatch,
  onRemove,
}: {
  idx: number
  line: RecipeLine
  allItems: StockItemDTO[]
  item: StockItemDTO | null
  onPatch: (p: Partial<RecipeLine>) => void
  onRemove: () => void
}) {
  const [search, setSearch] = useState('')
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter(
      (i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)
    )
  }, [allItems, search])

  return (
    <div className="grid items-center gap-2 rounded-xl border bg-cream/40 p-2 sm:grid-cols-[1fr_130px_auto]">
      <div className="space-y-1.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari bahan…"
            className="h-11 pl-9"
            aria-label={`Cari bahan baris ${idx + 1}`}
          />
        </div>
        <Select value={line.stockItemId || undefined} onValueChange={(v) => onPatch({ stockItemId: v })}>
          <SelectTrigger className="h-11 w-full" aria-label={`Bahan baris ${idx + 1}`}>
            <SelectValue placeholder="Pilih bahan…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {filteredItems.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                <span className="font-mono text-xs">{i.sku}</span> — {i.name} ({i.unit})
              </SelectItem>
            ))}
            {filteredItems.length === 0 && (
              <p className="px-3 py-2 text-center text-xs text-muted-foreground">
                Tidak ada bahan yang cocok dengan “{search}”.
              </p>
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="relative">
        <Input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          className="h-11 pr-12 font-mono tabular-nums"
          value={line.qtyPerUnit || ''}
          onChange={(e) => onPatch({ qtyPerUnit: parseFloat(e.target.value || '0') || 0 })}
          placeholder="per porsi"
          aria-label={`Jumlah per porsi baris ${idx + 1}`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {item?.unit ?? ''}
        </span>
      </div>
      <Button
        variant="outline"
        size="icon"
        className="h-11 w-11 text-destructive hover:bg-destructive/10"
        onClick={onRemove}
        aria-label={`Hapus bahan baris ${idx + 1}`}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  )
}
