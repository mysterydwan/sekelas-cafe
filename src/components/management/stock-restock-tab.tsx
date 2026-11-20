'use client'

// Restock ("Belanja") tab (SPEC §3.11): record a purchase — multi-line
// RESTOCK_IN with weighted unit-cost update + supplier autocomplete.
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { addDaysJakarta, todayJakarta } from '@/lib/format'
import { useSession } from '@/hooks/use-session'
import { Money } from '@/components/staff/money'
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
import { MoneyInput, formatQty, type MovementsResponse, type StockItemDTO } from './shared'

interface RestockLine {
  key: number
  itemId: string
  qtyText: string
  unitCost: number | null
}

let lineSeq = 0
const newLine = (): RestockLine => ({ key: Date.now() + lineSeq++, itemId: '', qtyText: '', unitCost: null })

export function StockRestockTab({ allItems }: { allItems: StockItemDTO[] }) {
  const { can } = useSession()
  const canManage = can('stock.manage')
  const qc = useQueryClient()

  const [supplier, setSupplier] = useState('')
  const [lines, setLines] = useState<RestockLine[]>([newLine()])
  const [purchaseDate, setPurchaseDate] = useState(() => todayJakarta())

  // supplier history: prior RESTOCK_IN reasons "Pembelian dari X"
  const suppliersQuery = useQuery({
    queryKey: ['stock', 'suppliers'],
    queryFn: () => apiFetch<MovementsResponse>('/api/stock/movements?type=RESTOCK_IN&pageSize=100'),
    staleTime: 5 * 60_000,
  })
  const supplierOptions = useMemo(() => {
    const names = new Set<string>()
    for (const m of suppliersQuery.data?.rows ?? []) {
      const match = m.reason?.match(/^Pembelian dari (.+)$/)
      if (match) names.add(match[1].trim())
    }
    return [...names].sort()
  }, [suppliersQuery.data])

  const itemById = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems])

  const parsed = lines.map((l) => ({
    ...l,
    qty: parseFloat(l.qtyText.replace(',', '.')) || 0,
    item: itemById.get(l.itemId) ?? null,
  }))
  const validLines = parsed.filter((l) => l.item && l.qty > 0)
  const grandTotal = validLines.reduce((s, l) => s + l.qty * (l.unitCost ?? 0), 0)

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!supplier.trim()) throw new Error('Nama pemasok wajib diisi')
      if (validLines.length === 0) throw new Error('Tambahkan minimal satu baris yang lengkap')
      return apiFetch<{ supplier: string; lines: number; total: number }>('/api/stock/restock', {
        method: 'POST',
        body: JSON.stringify({
          supplier: supplier.trim(),
          lines: validLines.map((l) => ({ itemId: l.itemId, qty: l.qty, unitCost: l.unitCost ?? 0 })),
          date: purchaseDate,
        }),
      })
    },
    onSuccess: (d: { supplier: string; lines: number; total: number }) => {
      toast.success(
        `Pembelian dari ${d.supplier} dicatat — ${d.lines} baris, total Rp ${d.total.toLocaleString('id-ID')}`
      )
      setSupplier('')
      setLines([newLine()])
      qc.invalidateQueries({ queryKey: ['stock'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const patchLine = (key: number, p: Partial<RestockLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)))

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="space-y-4 rounded-xl border bg-card p-4" aria-label="Formulir pembelian">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-caramel" aria-hidden />
          <h3 className="font-display text-base font-semibold">Catat Pembelian Bahan</h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rs-supplier">Pemasok</Label>
            <Input
              id="rs-supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="cth. Toko Tani Makmur"
              list="supplier-options"
              disabled={!canManage}
            />
            <datalist id="supplier-options">
              {supplierOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              {supplierOptions.length > 0
                ? `${supplierOptions.length} pemasok terakhir muncul saat mengetik`
                : 'Nama bebas — muncul otomatis pada pembelian berikutnya'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rs-date">Tanggal pembelian</Label>
            <Input
              id="rs-date"
              type="date"
              value={purchaseDate}
              min={addDaysJakarta(todayJakarta(), -30)}
              max={todayJakarta()}
              disabled={!canManage}
              onChange={(e) => setPurchaseDate(e.target.value || todayJakarta())}
            />
            <p className="text-xs text-muted-foreground">
              Catat sesuai tanggal belanja — boleh mundur maks. 30 hari, tidak bisa di masa depan.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Baris pembelian</p>
          {lines.map((l, idx) => {
            const item = itemById.get(l.itemId)
            const qty = parseFloat(l.qtyText.replace(',', '.')) || 0
            return (
              <div
                key={l.key}
                className="grid items-center gap-2 rounded-xl border bg-cream/40 p-2 md:grid-cols-[1fr_110px_150px_auto]"
              >
                <span className="text-xs font-medium text-muted-foreground md:hidden">Baris {idx + 1}</span>
                <Select value={l.itemId || undefined} onValueChange={(v) => patchLine(l.key, { itemId: v })} disabled={!canManage}>
                  <SelectTrigger className="h-11 w-full" aria-label={`Bahan baris ${idx + 1}`}>
                    <SelectValue placeholder="Pilih bahan…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {allItems.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        <span className="font-mono text-xs">{i.sku}</span> — {i.name} ({formatQty(i.qty)} {i.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    className="h-11 pr-10 font-mono tabular-nums"
                    value={l.qtyText}
                    onChange={(e) => patchLine(l.key, { qtyText: e.target.value })}
                    placeholder="qty"
                    aria-label={`Jumlah baris ${idx + 1}`}
                    disabled={!canManage}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {item?.unit ?? ''}
                  </span>
                </div>
                <MoneyInput
                  value={l.unitCost}
                  onChange={(v) => patchLine(l.key, { unitCost: v })}
                  placeholder="harga satuan"
                  ariaLabel={`Harga satuan baris ${idx + 1}`}
                  className="md:w-40"
                />
                <div className="flex items-center justify-between gap-2 md:justify-end">
                  {item && qty > 0 && (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      = <Money value={qty * (l.unitCost ?? 0)} className="text-inherit" />
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 text-destructive hover:bg-destructive/10"
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
                    disabled={!canManage || (lines.length === 1 && !l.itemId && !l.qtyText)}
                    aria-label={`Hapus baris ${idx + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            )
          })}
          <Button
            variant="ghost"
            size="sm"
            className="h-11 text-caramel hover:bg-caramel/10"
            onClick={() => setLines((ls) => [...ls, newLine()])}
            disabled={!canManage}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Tambah baris
          </Button>
        </div>

        {canManage ? (
          <Button
            className="h-11 w-full bg-espresso text-cream hover:bg-espresso-soft sm:w-auto sm:px-8"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />}
            Simpan Pembelian
          </Button>
        ) : (
          <p className="rounded-xl border border-dashed bg-cream/50 p-3 text-sm text-muted-foreground">
            Hanya lihat — mencatat pembelian butuh izin Stok.
          </p>
        )}
      </section>

      <aside className="space-y-3 rounded-xl border bg-card p-4 lg:sticky lg:top-6 lg:self-start" aria-label="Ringkasan pembelian">
        <h3 className="font-display text-base font-semibold">Ringkasan</h3>
        <div className="space-y-1.5 text-sm">
          {validLines.length === 0 ? (
            <p className="text-muted-foreground">Belum ada baris lengkap.</p>
          ) : (
            validLines.map((l) => (
              <div key={l.key} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  {l.item!.name}
                  <span className="ml-1 text-xs text-muted-foreground">
                    × {formatQty(l.qty)} {l.item!.unit}
                  </span>
                </span>
                <Money value={l.qty * (l.unitCost ?? 0)} className="shrink-0 text-sm" />
              </div>
            ))
          )}
        </div>
        <div className="flex items-baseline justify-between border-t pt-2">
          <span className="font-semibold">Total</span>
          <Money value={grandTotal} className="text-lg font-semibold" />
        </div>
        <p className="text-xs text-muted-foreground">
          Harga satuan bahan otomatis diperbarui berbobot (rata-rata tertimbang lama + baru).
        </p>
      </aside>
    </div>
  )
}
