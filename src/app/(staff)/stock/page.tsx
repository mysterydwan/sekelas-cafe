'use client'

// /stock — Stock & Inventory workspace (SPEC §3.11): tabbed Items/Movements/
// Restock/Recipes/Counts. Cashier read-only; Barista operates; Admin full.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, ChefHat, ClipboardCheck, ShoppingCart, TrendingDown } from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { useSession } from '@/hooks/use-session'
import { useRealtime } from '@/hooks/use-realtime'
import { PageGuard } from '@/components/staff/page-guard'
import { PageHeader } from '@/components/staff/primitives'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StockItemsTab } from '@/components/management/stock-items-tab'
import { StockMovementsTab } from '@/components/management/stock-movements-tab'
import { StockRestockTab } from '@/components/management/stock-restock-tab'
import { StockRecipesTab } from '@/components/management/stock-recipes-tab'
import { StockCountTab } from '@/components/management/stock-count-tab'
import type { StockItemDTO } from '@/components/management/shared'

export default function StockPage() {
  return (
    <PageGuard page="/stock">
      <StockInner />
    </PageGuard>
  )
}

function StockInner() {
  const { can } = useSession()
  const qc = useQueryClient()

  const allItemsQuery = useQuery({
    queryKey: ['stock', 'items', 'all'],
    queryFn: () => apiFetch<{ items: StockItemDTO[]; totalValue: number }>('/api/stock/items'),
    refetchInterval: 60_000,
  })
  const allItems = allItemsQuery.data?.items ?? []

  // realtime keeps table fresh; polling covers gaps (SPEC: offline tolerance)
  useRealtime(['stock:movement', 'stock:low'], () => {
    qc.invalidateQueries({ queryKey: ['stock'] })
  })

  const invalidateStock = () => qc.invalidateQueries({ queryKey: ['stock'] })

  if (allItemsQuery.isError) {
    return (
      <div className="p-4 md:p-6">
        <PageHeader title="Stok & Inventaris" />
        <p className="mt-6 text-sm text-destructive" role="alert">
          Gagal memuat data stok —{' '}
          {allItemsQuery.error instanceof Error ? allItemsQuery.error.message : 'coba muat ulang'}.
        </p>
        <button className="mt-2 text-sm underline" onClick={() => allItemsQuery.refetch()}>
          Muat ulang
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-6">
      <PageHeader
        title="Stok & Inventaris"
        description="Bahan, mutasi, pembelian, resep, dan opname — semua perubahan tercatat siapa dan kapan."
      />

      <Tabs defaultValue="items" aria-label="Bagian stok">
        <TabsList className="h-auto w-full max-w-full overflow-x-auto justify-start gap-1 bg-cream-deep p-1 scrollbar-warm">
          <TabsTrigger value="items" className="min-h-11 gap-1.5 px-3">
            <Boxes className="h-4 w-4" aria-hidden /> Bahan
          </TabsTrigger>
          <TabsTrigger value="movements" className="min-h-11 gap-1.5 px-3">
            <TrendingDown className="h-4 w-4" aria-hidden /> Mutasi
          </TabsTrigger>
          <TabsTrigger value="restock" className="min-h-11 gap-1.5 px-3">
            <ShoppingCart className="h-4 w-4" aria-hidden /> Belanja
          </TabsTrigger>
          {can('recipe.manage') && (
            <TabsTrigger value="recipes" className="min-h-11 gap-1.5 px-3">
              <ChefHat className="h-4 w-4" aria-hidden /> Resep
            </TabsTrigger>
          )}
          <TabsTrigger value="count" className="min-h-11 gap-1.5 px-3">
            <ClipboardCheck className="h-4 w-4" aria-hidden /> Opname
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <StockItemsTab allItems={allItems} onChanged={invalidateStock} />
        </TabsContent>
        <TabsContent value="movements" className="mt-4">
          <StockMovementsTab allItems={allItems} />
        </TabsContent>
        <TabsContent value="restock" className="mt-4">
          <StockRestockTab allItems={allItems} />
        </TabsContent>
        {can('recipe.manage') && (
          <TabsContent value="recipes" className="mt-4">
            <StockRecipesTab allItems={allItems} />
          </TabsContent>
        )}
        <TabsContent value="count" className="mt-4">
          <StockCountTab allItems={allItems} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
