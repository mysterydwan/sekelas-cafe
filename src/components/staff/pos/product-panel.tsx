'use client'

// POS left workspace (SPEC §3.6): sticky category chips + search (`/` focuses)
// + product grid. Sold-out items grayed with "Habis". Tap adds directly when
// the product has no required variant groups — otherwise the workspace opens
// the variant sheet.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/staff/primitives'
import { cn } from '@/lib/utils'
import { formatIDR } from '@/lib/format'
import type { MenuDTO, ProductDTO } from '@/lib/types'

export function ProductPanel({
  menu,
  loading,
  error,
  onRetry,
  onPick,
}: {
  menu: MenuDTO | undefined
  loading: boolean
  error: boolean
  onRetry: () => void
  onPick: (product: ProductDTO, event: React.MouseEvent) => void
}) {
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // `/` focuses search (SPEC §1.5)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (e.key === '/' && target && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const categories = menu?.categories ?? []

  const products = useMemo(() => {
    let list: ProductDTO[] = []
    if (category === 'all') list = categories.flatMap((c) => c.products)
    else list = categories.find((c) => c.id === category)?.products ?? []
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q))
    return list
  }, [categories, category, search])

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Search + categories (sticky) */}
      <div className="sticky top-0 z-10 space-y-2 border-b bg-background/95 p-3 backdrop-blur md:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari menu… (tekan / )"
            className="min-h-[44px] pl-9 pr-9"
            aria-label="Cari menu"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              aria-label="Bersihkan pencarian"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-warm" role="tablist" aria-label="Kategori menu">
          <button
            type="button"
            role="tab"
            aria-selected={category === 'all'}
            onClick={() => setCategory('all')}
            className={cn(
              'min-h-[40px] shrink-0 rounded-full border px-4 text-sm font-medium transition-all',
              category === 'all'
                ? 'border-caramel bg-caramel/15 text-espresso dark:text-caramel-light'
                : 'bg-card hover:border-caramel/60'
            )}
          >
            Semua
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                'min-h-[40px] shrink-0 rounded-full border px-4 text-sm font-medium transition-all',
                category === c.id
                  ? 'border-caramel bg-caramel/15 text-espresso dark:text-caramel-light'
                  : 'bg-card hover:border-caramel/60'
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 scrollbar-warm">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square w-full rounded-xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState
            title="Menu gagal dimuat"
            description="Periksa koneksi lalu coba lagi."
            action={
              <button
                type="button"
                onClick={onRetry}
                className="min-h-[44px] rounded-lg bg-espresso px-4 text-sm font-semibold text-cream transition-colors hover:bg-espresso-soft"
              >
                Coba Lagi
              </button>
            }
          />
        ) : products.length === 0 ? (
          <EmptyState
            title={search ? 'Tidak ditemukan' : 'Kategori ini kosong'}
            description={
              search ? `Tidak ada menu yang cocok dengan “${search}”.` : 'Belum ada produk di kategori ini.'
            }
            action={
              search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="min-h-[44px] rounded-lg border px-4 text-sm font-semibold transition-colors hover:bg-muted"
                >
                  Hapus pencarian
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {products.map((product) => {
              const soldOut = !product.isAvailable
              const needsVariant = product.variantGroups.some((g) => g.isRequired && g.isActive)
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={soldOut}
                  onClick={(e) => onPick(product, e)}
                  className={cn(
                    'group flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all',
                    soldOut
                      ? 'cursor-not-allowed opacity-55 grayscale'
                      : 'hover:border-caramel hover:shadow-md active:scale-[0.98]'
                  )}
                  aria-label={`${product.name}${soldOut ? ' (habis)' : needsVariant ? ' — pilih variasi' : ' — tambah ke keranjang'}`}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-cream dark:bg-secondary">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-4xl" aria-hidden>
                        ☕
                      </div>
                    )}
                    {soldOut && (
                      <span className="absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-destructive px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Habis
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 p-2.5">
                    <span className="line-clamp-2 min-h-[2.4em] text-[13px] font-medium leading-tight">
                      {product.name}
                    </span>
                    <span className="mt-auto font-mono text-sm font-semibold tabular-nums text-espresso dark:text-caramel-light">
                      {formatIDR(product.basePrice)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
