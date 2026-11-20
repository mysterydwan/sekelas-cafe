'use client'

// Stock item create/edit dialog (SPEC §3.11). Qty only on create —
// every qty change afterwards must flow through movements.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, PackagePlus } from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MoneyInput, STOCK_UNITS, type StockItemDTO } from './shared'

export function StockItemDialog({
  item, // null = create
  onClosed,
  onSaved,
}: {
  item: StockItemDTO | null
  onClosed: () => void
  onSaved: () => void
}) {
  const [open, setOpen] = useState(true)
  const [sku, setSku] = useState(item?.sku ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [unit, setUnit] = useState(item?.unit ?? 'gr')
  const [qty, setQty] = useState('')
  const [lowThreshold, setLowThreshold] = useState(item ? String(item.lowThreshold) : '10')
  const [unitCost, setUnitCost] = useState<number | null>(item?.unitCost ?? null)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setOpen(false)
    setTimeout(onClosed, 220)
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        sku: sku.trim().toUpperCase(),
        name: name.trim(),
        unit,
        ...(item
          ? { lowThreshold: parseFloat(lowThreshold || '0') || 0, unitCost: unitCost ?? 0 }
          : {
              qty: parseFloat(qty || '0') || 0,
              lowThreshold: parseFloat(lowThreshold || '0') || 0,
              unitCost: unitCost ?? 0,
            }),
      }
      return apiFetch(item ? `/api/stock/items/${item.id}` : '/api/stock/items', {
        method: item ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      toast.success(item ? `Bahan "${name.trim()}" diperbarui` : `Bahan "${name.trim()}" ditambahkan`)
      onSaved()
      close()
    },
    onError: (e: Error) => {
      // duplicate SKU etc — surface inline next to the field
      setError(e.message.includes('SKU') ? e.message : null)
      toast.error(e.message)
    },
  })

  const submit = () => {
    if (!sku.trim()) return setError('SKU wajib diisi')
    if (!name.trim()) return setError('Nama bahan wajib diisi')
    setError(null)
    saveMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <PackagePlus className="h-5 w-5 text-caramel" aria-hidden />
            {item ? 'Edit Bahan' : 'Bahan Baru'}
          </DialogTitle>
          <DialogDescription>
            {item
              ? 'Jumlah stok tidak diubah di sini — gunakan Sesuaikan agar setiap perubahan tercatat.'
              : 'Jumlah awal dicatat sebagai mutasi “Masuk Stok”.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[130px_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="si-sku">SKU</Label>
              <Input
                id="si-sku"
                value={sku}
                onChange={(e) => {
                  setSku(e.target.value.toUpperCase())
                  setError(null)
                }}
                placeholder="KOP-01"
                className="font-mono uppercase"
                aria-describedby={error?.includes('SKU') ? 'si-sku-error' : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="si-name">Nama bahan</Label>
              <Input
                id="si-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="cth. Susu UHT"
              />
            </div>
          </div>
          {error?.includes('SKU') && (
            <p id="si-sku-error" className="text-xs font-medium text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Satuan</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="h-11 w-full" aria-label="Satuan bahan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">cth. susu 1000 ml, gula 500 gr</p>
            </div>
            {!item && (
              <div className="space-y-1.5">
                <Label htmlFor="si-qty">Jumlah awal</Label>
                <Input
                  id="si-qty"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  className="h-11 font-mono tabular-nums"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="0"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="si-low">Batas rendah</Label>
              <Input
                id="si-low"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                className="h-11 font-mono tabular-nums"
                value={lowThreshold}
                onChange={(e) => setLowThreshold(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">di bawah ini = RENDAH</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="si-cost">Harga per satuan</Label>
              <MoneyInput id="si-cost" ariaLabel="Harga per satuan" value={unitCost} onChange={setUnitCost} />
              <p className="text-xs text-muted-foreground">dipakai untuk nilai stok</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" className="h-11" onClick={close}>
            Batal
          </Button>
          <Button
            className="h-11 bg-espresso text-cream hover:bg-espresso-soft"
            onClick={submit}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />}
            Simpan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
