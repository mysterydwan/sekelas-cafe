'use client'

// Product detail sheet (bottom Sheet — works great on mobile, fine on desktop):
// image, description, variant groups as chips (SINGLE=radio, MULTI=checkbox
// capped at maxSelect), qty stepper, note, live line price, gated Add button.
//
// Two modes:
// - ADD (default): after adding, the sheet STAYS OPEN with a "masuk keranjang"
//   confirmation + "Tambah varian lain" — so a customer can order e.g.
//   2 Large + 1 Small of the same drink as separate variant lines.
// - EDIT (`editLine` prop): selections/qty/note prefilled from an existing cart
//   line; "Simpan Perubahan" patches that line in place (no delete + re-pick).
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Lightbulb, ShoppingBag } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProductImage } from './product-image'
import { QtyStepper } from './qty-stepper'
import { formatIDR } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import type { ProductDTO, VariantGroupDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { CartLine, CartOption } from '@/stores/cart'

type Selections = Record<string, string[]>

export interface AddToCartPayload {
  productId: string
  productName: string
  imageUrl: string | null
  basePrice: number
  qty: number
  options: CartOption[]
  note: string
}

export function ProductSheet({
  product,
  open,
  onOpenChange,
  onAdd,
  onUpdate,
  editLine,
  onViewCart,
}: {
  product: ProductDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (payload: AddToCartPayload) => void
  /** Edit mode: called with the lineId being patched. */
  onUpdate?: (lineId: string, payload: AddToCartPayload) => void
  /** The cart line being edited (edit mode when set). */
  editLine?: CartLine | null
  /** After-add: open the cart sheet. */
  onViewCart?: () => void
}) {
  const { t } = useI18n()
  const [selections, setSelections] = useState<Selections>({})
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [justAdded, setJustAdded] = useState<{ name: string; qty: number } | null>(null)

  const editing = Boolean(editLine)

  // Reset selections to defaults each time the sheet opens for a product —
  // or prefill from the cart line being edited.
  useEffect(() => {
    if (!open || !product) return
    const p = product
    const line = editLine
    Promise.resolve().then(() => {
      setJustAdded(null)
      setQty(line ? line.qty : 1)
      setNote(line ? line.note : '')
      const next: Selections = {}
      for (const g of p.variantGroups) {
        if (line) {
          // prefill, but drop options that no longer exist on the product
          const ids = new Set(g.options.map((o) => o.id))
          next[g.id] = line.options.filter((o) => o.groupId === g.id && ids.has(o.id)).map((o) => o.id)
        } else {
          const defaults = g.options.filter((o) => o.isDefault).map((o) => o.id)
          if (g.selectionType === 'SINGLE') {
            next[g.id] = defaults.length > 0 ? [defaults[0]] : []
          } else {
            next[g.id] = defaults.slice(0, Math.max(1, g.maxSelect))
          }
        }
      }
      setSelections(next)
    })
  }, [open, product, editLine])

  const selectedOptions = useMemo<CartOption[]>(() => {
    if (!product) return []
    const out: CartOption[] = []
    for (const g of product.variantGroups) {
      for (const id of selections[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === id)
        if (opt) {
          out.push({ id: opt.id, groupId: g.id, groupName: g.name, label: opt.label, priceDelta: opt.priceDelta })
        }
      }
    }
    return out
  }, [product, selections])

  const unsatisfied = useMemo<string[]>(() => {
    if (!product) return []
    const missing: string[] = []
    for (const g of product.variantGroups) {
      const count = (selections[g.id] ?? []).length
      const min = g.isRequired ? Math.max(1, g.minSelect) : g.minSelect
      if (count < min || count > Math.max(1, g.maxSelect)) missing.push(g.name)
    }
    return missing
  }, [product, selections])

  if (!product) return null

  const unitPrice = product.basePrice + selectedOptions.reduce((s, o) => s + o.priceDelta, 0)
  const lineTotal = unitPrice * qty
  const canSubmit = unsatisfied.length === 0 && product.isAvailable

  const toggle = (group: VariantGroupDTO, optionId: string) => {
    setSelections((prev) => {
      const cur = prev[group.id] ?? []
      if (group.selectionType === 'SINGLE') {
        // radio behavior; optional singles may deselect
        if (cur.includes(optionId) && !group.isRequired) return { ...prev, [group.id]: [] }
        return { ...prev, [group.id]: [optionId] }
      }
      if (cur.includes(optionId)) {
        return { ...prev, [group.id]: cur.filter((id) => id !== optionId) }
      }
      if (cur.length >= Math.max(1, group.maxSelect)) return prev
      return { ...prev, [group.id]: [...cur, optionId] }
    })
  }

  const buildPayload = (): AddToCartPayload => ({
    productId: product.id,
    productName: product.name,
    imageUrl: product.imageUrl,
    basePrice: product.basePrice,
    qty,
    options: selectedOptions,
    note: note.trim(),
  })

  const submit = () => {
    if (!canSubmit) return
    if (editing && editLine) {
      onUpdate?.(editLine.lineId, buildPayload())
      return
    }
    onAdd(buildPayload())
    // stay open + confirm, reset the config for the next variant
    setJustAdded({ name: product.name, qty })
    setQty(1)
    setNote('')
    const next: Selections = {}
    for (const g of product.variantGroups) {
      const defaults = g.options.filter((o) => o.isDefault).map((o) => o.id)
      if (g.selectionType === 'SINGLE') {
        next[g.id] = defaults.length > 0 ? [defaults[0]] : []
      } else {
        next[g.id] = defaults.slice(0, Math.max(1, g.maxSelect))
      }
    }
    setSelections(next)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="inset-x-0 mx-auto flex max-h-[92dvh] w-full max-w-2xl flex-col gap-0 rounded-t-2xl p-0"
      >
        <SheetHeader className="border-b border-border/60 p-4 pb-3">
          <SheetTitle className="font-display text-lg text-foreground">
            {editing ? t('product.editTitle') : product.name}
          </SheetTitle>
          {!editing && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{product.description ?? ''}</p>
          )}
        </SheetHeader>

        <div className="scrollbar-warm max-h-[58dvh] grow overflow-y-auto overscroll-contain">
          {!editing && (
            <ProductImage
              src={product.imageUrl}
              name={product.name}
              className="h-44 w-full object-cover sm:h-56"
            />
          )}
          <div className="space-y-6 p-4">
            {!product.isAvailable && (
              <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
                {t('product.soldOutNotice')}
              </div>
            )}

            {product.variantGroups.map((g) => {
              const cur = selections[g.id] ?? []
              const cap = Math.max(1, g.maxSelect)
              return (
                <fieldset key={g.id} className="space-y-2.5">
                  <legend className="flex w-full flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{g.name}</span>
                    {g.isRequired ? (
                      <Badge className="border-transparent bg-caramel/15 text-caramel">
                        {t('product.required')}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('product.optional')}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {g.selectionType === 'SINGLE'
                        ? t('product.pickOne')
                        : cap > 1
                          ? t('product.pickUpTo', { n: cap })
                          : t('product.multi')}
                    </span>
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {g.options.map((o) => {
                      const selected = cur.includes(o.id)
                      const atCap =
                        g.selectionType === 'MULTI' && !selected && cur.length >= cap
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => toggle(g, o.id)}
                          disabled={atCap}
                          aria-pressed={selected}
                          className={cn(
                            'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors',
                            selected
                              ? 'border-transparent bg-primary text-primary-foreground'
                              : 'border-border bg-background text-foreground hover:border-primary/40',
                            atCap && 'cursor-not-allowed opacity-40'
                          )}
                        >
                          {o.label}
                          {o.priceDelta !== 0 && (
                            <span className="ml-1.5 font-mono text-xs opacity-80">
                              {o.priceDelta > 0 ? '+' : ''}
                              {formatIDR(o.priceDelta)}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              )
            })}

            {!editing && product.variantGroups.length > 0 && (
              <p className="flex items-start gap-2 rounded-xl bg-cream-deep px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground dark:bg-espresso-soft/30">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-caramel" aria-hidden="true" />
                {t('product.variantsHint')}
              </p>
            )}

            <div className="space-y-2.5">
              <label htmlFor={editing ? 'product-note-edit' : 'product-note'} className="text-sm font-semibold text-foreground">
                {t('product.note')}
              </label>
              <Input
                id={editing ? 'product-note-edit' : 'product-note'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('product.notePlaceholder')}
                maxLength={200}
                className="h-11 rounded-xl bg-background"
              />
            </div>
          </div>
        </div>

        <div className="mt-auto space-y-3 border-t border-border/60 bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {justAdded && !editing && (
            <div
              role="status"
              className="flex flex-col gap-3 rounded-2xl border border-success/30 bg-success/10 p-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{t('product.addedTitle')}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('product.addedHint', { name: justAdded.name, qty: justAdded.qty })}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setJustAdded(null)}
                  className="h-9 rounded-full"
                >
                  {t('product.addAnotherVariant')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setJustAdded(null)
                    onViewCart?.()
                  }}
                  className="h-9 gap-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <ShoppingBag className="size-3.5" />
                  {t('product.viewCart')}
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <QtyStepper
              value={qty}
              onChange={setQty}
              min={1}
              max={99}
              label={t('product.qty')}
              ariaLabels={{
                decrease: t('cart.decreaseQty'),
                increase: t('cart.increaseQty'),
              }}
            />
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">
                {formatIDR(unitPrice)} {t('product.perUnit')}
              </p>
              <p className="font-mono text-lg font-bold tabular-nums text-foreground">
                {formatIDR(lineTotal)}
              </p>
            </div>
          </div>
          {unsatisfied.length > 0 && (
            <p className="text-xs text-warning" role="alert">
              {t('product.chooseFirst', { groups: unsatisfied.join(', ') })}
            </p>
          )}
          <Button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            title={unsatisfied.length > 0 ? t('product.chooseFirst', { groups: unsatisfied.join(', ') }) : undefined}
            className="h-12 w-full rounded-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {editing
              ? `${t('product.saveChanges')} — ${formatIDR(lineTotal)}`
              : `${t('product.addTotal', { total: formatIDR(lineTotal) })}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function ProductSheetSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-11 w-full rounded-full" />
    </div>
  )
}
