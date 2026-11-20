'use client'

// Variant configuration sheet for POS (SPEC §3.6): identical logic to the
// storefront product sheet — SINGLE groups behave as radios, MULTI as
// checkboxes capped at maxSelect; required groups pre-select defaults;
// live price; "Tambah" keeps the sheet open with a subtle confirmation so
// consecutive items are 2 taps each; Esc closes (Sheet default).

import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatIDR } from '@/lib/format'
import type { DraftLine, ProductDTO, VariantGroupDTO } from '@/lib/types'

function defaultsFor(product: ProductDTO): Set<string> {
  const set = new Set<string>()
  for (const g of product.variantGroups) {
    for (const o of g.options) {
      if (o.isDefault) set.add(o.id)
    }
  }
  return set
}

function groupState(group: VariantGroupDTO, selected: Set<string>): { ok: boolean; reason?: string } {
  const count = group.options.filter((o) => selected.has(o.id)).length
  if (group.selectionType === 'SINGLE') {
    if (group.isRequired && count < 1) return { ok: false, reason: `Pilih ${group.name} dulu` }
    return { ok: true }
  }
  const min = group.isRequired ? Math.max(1, group.minSelect) : group.minSelect
  if (count < min) return { ok: false, reason: `Pilih minimal ${min} ${group.name}` }
  if (count > group.maxSelect) return { ok: false, reason: `Maksimal ${group.maxSelect} ${group.name}` }
  return { ok: true }
}

export function VariantSheet({
  product,
  open,
  onOpenChange,
  onAdd,
  editing,
  onEdit,
}: {
  product: ProductDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (line: DraftLine) => void
  editing?: { line: DraftLine; index: number } | null
  onEdit?: (index: number, line: DraftLine) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    if (!open || !product) return
    const t = setTimeout(() => {
      if (editing) {
        setSelected(new Set(editing.line.optionIds))
        setQty(editing.line.qty)
        setNote(editing.line.note ?? '')
      } else {
        setSelected(defaultsFor(product))
        setQty(1)
        setNote('')
      }
      setConfirmed(false)
    }, 0)
    return () => clearTimeout(t)
  }, [open, product, editing])

  const groups = product?.variantGroups ?? []

  const unitPrice = useMemo(() => {
    if (!product) return 0
    let delta = 0
    for (const g of groups) for (const o of g.options) if (selected.has(o.id)) delta += o.priceDelta
    return product.basePrice + delta
  }, [product, groups, selected])

  const invalidGroup = groups.map((g) => ({ g, st: groupState(g, selected) })).find((x) => !x.st.ok)

  const toggle = (group: VariantGroupDTO, optionId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (group.selectionType === 'SINGLE') {
        const isSel = prev.has(optionId)
        for (const o of group.options) next.delete(o.id)
        if (!isSel || group.isRequired) next.add(optionId)
      } else {
        if (next.has(optionId)) next.delete(optionId)
        else if (group.options.filter((o) => next.has(o.id)).length < group.maxSelect) next.add(optionId)
      }
      return next
    })
  }

  const submit = () => {
    if (!product || invalidGroup) return
    const line: DraftLine = {
      productId: product.id,
      productName: product.name,
      qty,
      optionIds: [...selected],
      note: note.trim() || undefined,
    }
    if (editing && onEdit) onEdit(editing.index, line)
    else onAdd(line)
    // keep sheet open + subtle confirmation for consecutive adds
    setConfirmed(true)
    window.setTimeout(() => setConfirmed(false), 1300)
    setQty(1)
    setNote('')
  }

  if (!product) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl p-0 sm:max-w-lg sm:mx-auto">
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="text-left font-display text-xl">{product.name}</SheetTitle>
          {product.description && (
            <p className="text-left text-sm text-muted-foreground">{product.description}</p>
          )}
        </SheetHeader>

        <div className="space-y-5 px-5 pb-4 pt-3">
          {groups.map((group) => {
            const st = groupState(group, selected)
            const count = group.options.filter((o) => selected.has(o.id)).length
            return (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    {group.name}
                    {group.isRequired && <span className="ml-1 text-destructive">*</span>}
                  </Label>
                  <span className={cn('text-xs', st.ok ? 'text-muted-foreground' : 'font-medium text-warning')}>
                    {group.selectionType === 'SINGLE'
                      ? 'Pilih satu'
                      : `Pilih ${group.isRequired ? `minimal ${Math.max(1, group.minSelect)}` : 'beberapa'} · maks ${group.maxSelect}`}
                    {group.selectionType === 'MULTI' && ` · terpilih ${count}`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label={group.name}>
                  {group.options.map((option) => {
                    const active = selected.has(option.id)
                    const disabled =
                      !active && group.selectionType === 'MULTI' && count >= group.maxSelect
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role={group.selectionType === 'SINGLE' ? 'radio' : 'checkbox'}
                        aria-checked={active}
                        disabled={disabled}
                        onClick={() => toggle(group, option.id)}
                        className={cn(
                          'min-h-[44px] rounded-full border px-4 py-2 text-sm font-medium transition-all',
                          active
                            ? 'border-caramel bg-caramel/15 text-espresso shadow-sm dark:text-caramel-light'
                            : 'bg-background hover:border-caramel/60',
                          disabled && 'cursor-not-allowed opacity-40'
                        )}
                      >
                        {option.label}
                        {option.priceDelta !== 0 && (
                          <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                            {option.priceDelta > 0 ? '+' : ''}
                            {formatIDR(option.priceDelta).replace('Rp ', '')}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div className="flex items-center gap-3">
            <Label htmlFor="variant-qty" className="text-sm font-semibold">
              Jumlah
            </Label>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="Kurangi jumlah"
              >
                <Minus className="h-4 w-4" aria-hidden />
              </Button>
              <span className="w-10 text-center font-mono text-lg font-semibold tabular-nums">{qty}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11"
                onClick={() => setQty((q) => Math.min(99, q + 1))}
                aria-label="Tambah jumlah"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="variant-note">Catatan untuk dapur (opsional)</Label>
            <Input
              id="variant-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="mis. tanpa gula, es dikit"
              maxLength={200}
            />
          </div>
        </div>

        <div className="sticky bottom-0 border-t bg-card/95 p-4 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            {confirmed ? (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-success">
                <Badge className="bg-success/15 text-success">Ditambahkan</Badge>
                lanjut pilih lagi?
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                {editing ? 'Perbarui item' : 'Tambah ke keranjang'}
              </span>
            )}
            <span className="font-mono text-lg font-bold tabular-nums">{formatIDR(unitPrice * qty)}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button
              onClick={submit}
              disabled={!!invalidGroup}
              className="min-h-[48px] bg-espresso text-cream hover:bg-espresso-soft"
            >
              {editing ? 'Simpan Perubahan' : 'Tambah'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="min-h-[48px] text-muted-foreground"
            >
              Tutup
            </Button>
          </div>
          {invalidGroup && (
            <p className="mt-1.5 text-center text-xs font-medium text-warning" role="alert">
              {invalidGroup.st.reason}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
