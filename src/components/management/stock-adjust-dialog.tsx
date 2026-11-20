'use client'

// Stock adjust / quick-waste dialog (SPEC §3.11): direction + amount with a
// live resulting-qty preview before save. Every save writes an attributed movement.
import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, SlidersHorizontal } from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { cn } from '@/lib/utils'
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
import { WASTE_REASONS, formatQty, signedQty, type StockItemDTO } from './shared'

type AdjustType = 'RESTOCK_IN' | 'WASTE' | 'MANUAL_OUT' | 'ADJUSTMENT'

const TYPE_OPTIONS: { value: AdjustType; label: string; hint: string }[] = [
  { value: 'RESTOCK_IN', label: 'Masuk Stok', hint: 'tambah dari pembelian' },
  { value: 'WASTE', label: 'Limbah', hint: 'tumpah, kedaluwarsa, rusak' },
  { value: 'MANUAL_OUT', label: 'Keluar Manual', hint: 'dipakai di luar pesanan' },
  { value: 'ADJUSTMENT', label: 'Penyesuaian', hint: 'set hasil akhir sebenarnya' },
]

export function AdjustDialog({
  item, // null → item picker (quick-waste entry)
  items,
  presetType,
  onClosed,
  onSaved,
}: {
  item: StockItemDTO | null
  items: StockItemDTO[]
  presetType?: AdjustType
  onClosed: () => void
  onSaved: () => void
}) {
  const [open, setOpen] = useState(true)
  const [itemId, setItemId] = useState(item?.id ?? '')
  const [type, setType] = useState<AdjustType>(presetType ?? 'RESTOCK_IN')
  const [qtyText, setQtyText] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  const close = () => {
    setOpen(false)
    setTimeout(onClosed, 220)
  }

  const selected = useMemo(
    () => items.find((i) => i.id === itemId) ?? item ?? null,
    [items, itemId, item]
  )
  const qty = parseFloat(qtyText.replace(',', '.')) || 0
  const resulting =
    !selected || qtyText === ''
      ? null
      : type === 'RESTOCK_IN'
        ? selected.qty + qty
        : type === 'ADJUSTMENT'
          ? qty
          : selected.qty - qty

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Pilih bahan dulu')
      if (!qty || qty <= 0) throw new Error('Jumlah harus lebih dari 0')
      return apiFetch('/api/stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          itemId: selected.id,
          type,
          qty,
          reason: reason.trim() || undefined,
          note: note.trim() || undefined,
        }),
      })
    },
    onSuccess: () => {
      toast.success(
        `${selected?.name}: ${formatQty(selected?.qty ?? 0)} → ${formatQty(resulting ?? 0)} ${selected?.unit ?? ''}`
      )
      onSaved()
      close()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const submit = () => saveMutation.mutate()

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <SlidersHorizontal className="h-5 w-5 text-caramel" aria-hidden />
            {presetType === 'WASTE' && !item ? 'Catat Limbah' : 'Sesuaikan Stok'}
          </DialogTitle>
          <DialogDescription>
            Setiap penyesuaian tercatat sebagai mutasi dengan nama kamu — stok tidak pernah diubah diam-diam.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!item && (
            <div className="space-y-1.5">
              <Label>Bahan</Label>
              <Select value={itemId || undefined} onValueChange={setItemId}>
                <SelectTrigger className="h-11 w-full" aria-label="Pilih bahan">
                  <SelectValue placeholder="Pilih bahan…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {items.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      <span className="font-mono text-xs">{i.sku}</span> — {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Jenis</Label>
            <Select value={type} onValueChange={(v) => setType(v as AdjustType)}>
              <SelectTrigger className="h-11 w-full" aria-label="Jenis penyesuaian">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label} <span className="text-xs text-muted-foreground">— {t.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-qty">
              {type === 'ADJUSTMENT' ? 'Jumlah hasil akhir' : 'Jumlah'}
              {selected && <span className="ml-1 text-muted-foreground">({selected.unit})</span>}
            </Label>
            <Input
              id="adj-qty"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              className="h-11 font-mono tabular-nums"
              value={qtyText}
              onChange={(e) => setQtyText(e.target.value)}
              placeholder="0"
            />
          </div>

          {type === 'WASTE' ? (
            <div className="space-y-1.5">
              <Label>Alasan</Label>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Alasan limbah">
                {WASTE_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={cn(
                      'min-h-11 rounded-full border px-3 text-sm transition-colors',
                      reason === r
                        ? 'border-espresso bg-espresso text-cream'
                        : 'border-caramel/40 bg-background hover:border-caramel'
                    )}
                    aria-pressed={reason === r}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="adj-reason">Alasan (opsional)</Label>
              <Input
                id="adj-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="cth. belanja harian, dipakai kelas praktik"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="adj-note">Catatan (opsional)</Label>
            <Input
              id="adj-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="detail tambahan"
            />
          </div>

          {/* live resulting-qty preview */}
          {selected && resulting !== null && (
            <div
              className={cn(
                'rounded-xl border p-3 text-sm',
                type === 'ADJUSTMENT'
                  ? 'border-caramel/50 bg-caramel/10'
                  : resulting < 0
                    ? 'border-destructive/40 bg-destructive/10'
                    : 'border-caramel/30 bg-cream'
              )}
              role="status"
              aria-live="polite"
            >
              <span className="text-muted-foreground">Hasil setelah disimpan: </span>
              <span className="font-mono font-semibold tabular-nums">
                {formatQty(selected.qty)} → {formatQty(resulting)} {selected.unit}
              </span>{' '}
              <span
                className={cn(
                  'font-mono font-semibold tabular-nums',
                  resulting - selected.qty > 0
                    ? 'text-success'
                    : resulting - selected.qty < 0
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                )}
              >
                ({signedQty(resulting - selected.qty)})
              </span>
              {resulting < 0 && (
                <p className="mt-1 text-xs font-medium text-destructive">
                  Stok menjadi negatif — periksa kembali jumlahnya.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" className="h-11" onClick={close}>
            Batal
          </Button>
          <Button
            className="h-11 bg-espresso text-cream hover:bg-espresso-soft"
            onClick={submit}
            disabled={saveMutation.isPending || !selected || !qtyText}
          >
            {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />}
            Simpan Mutasi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
