'use client'

// Cart sheet: lines grouped by product (GoFood-style — each variant line under
// its product header), INLINE EDIT via the nested ProductSheet in edit mode
// (no delete-and-re-pick), qty stepper, note, remove w/ undo, service type,
// delivery fields w/ quick-pick + fee line, order note, payment choice
// (kasir / QRIS step), confirmation state. i18n throughout. Cart persists via
// zustand; cleared only after server OK.
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  Bike,
  CheckCircle2,
  Copy,
  Coffee,
  MessageSquarePlus,
  MessageSquareText,
  PackageSearch,
  Pencil,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Store,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { apiFetch, ApiError } from '@/lib/client'
import { formatIDR } from '@/lib/format'
import { useI18n, summarizeHoursLocalized } from '@/lib/i18n'
import type {
  CreateOrderInput,
  MenuDTO,
  OrderDTO,
  OrderType,
  ProductDTO,
  PublicSettingsDTO,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { cartSubtotal, lineTotal, useCartStore, type CartLine } from '@/stores/cart'
import { ProductImage } from './product-image'
import { QtyStepper } from './qty-stepper'
import { OrderStepper } from './order-stepper'
import { ProductSheet, type AddToCartPayload } from './product-sheet'
import type { OpenStatus } from './open-status'
import { uuid, waLink } from './utils'

type Step = 'cart' | 'qris' | 'done'
type PaymentPayload = { method: 'QRIS'; qrReference?: string } | null

interface ProductGroup {
  productId: string
  name: string
  imageUrl: string | null
  lines: CartLine[]
}

export function CartSheet({
  open,
  onOpenChange,
  settings,
  settingsLoading,
  menu,
  openStatus,
  onBrowse,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings?: PublicSettingsDTO
  settingsLoading: boolean
  menu?: MenuDTO
  openStatus: OpenStatus | null
  onBrowse: () => void
}) {
  const { lang, t } = useI18n()
  const [step, setStep] = useState<Step>('cart')
  const [confirmed, setConfirmed] = useState<OrderDTO | null>(null)
  const [qrReference, setQrReference] = useState('')
  const [qrFailed, setQrFailed] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ name?: string; location?: string; phone?: string }>({})
  const [editLine, setEditLine] = useState<CartLine | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const idemKey = useRef<string | null>(null)
  const lastPaymentRef = useRef<PaymentPayload>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const locationRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)

  const lines = useCartStore((s) => s.lines)
  const serviceType = useCartStore((s) => s.serviceType)
  const tableLabel = useCartStore((s) => s.tableLabel)
  const customerName = useCartStore((s) => s.customerName)
  const customerPhone = useCartStore((s) => s.customerPhone)
  const deliveryLocation = useCartStore((s) => s.deliveryLocation)
  const orderNote = useCartStore((s) => s.note)
  const setQty = useCartStore((s) => s.setQty)
  const setLineNote = useCartStore((s) => s.setLineNote)
  const updateLine = useCartStore((s) => s.updateLine)
  const removeLine = useCartStore((s) => s.removeLine)
  const restoreLine = useCartStore((s) => s.restoreLine)
  const setServiceType = useCartStore((s) => s.setServiceType)
  const setField = useCartStore((s) => s.setField)

  const subtotal = cartSubtotal(lines)
  const deliveryFee =
    serviceType === 'DELIVERY' ? (settings?.ordering.deliveryFee ?? 1000) : 0
  const total = subtotal + deliveryFee

  // Availability of cart products against the live menu
  const availability = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const c of menu?.categories ?? []) {
      for (const p of c.products) map.set(p.id, p.isAvailable)
    }
    return map
  }, [menu])
  const hasUnavailable = menu
    ? lines.some((l) => availability.get(l.productId) !== true)
    : false

  // Group lines by product (insertion order preserved) — the multi-variant view:
  // "Kopi Susu Gula Aren" → [2× Large, 1× Small] as separate, individually
  // editable lines under one header.
  const groups = useMemo<ProductGroup[]>(() => {
    const out: ProductGroup[] = []
    const byProduct = new Map<string, ProductGroup>()
    for (const l of lines) {
      let g = byProduct.get(l.productId)
      if (!g) {
        g = { productId: l.productId, name: l.productName, imageUrl: l.imageUrl, lines: [] }
        byProduct.set(l.productId, g)
        out.push(g)
      }
      g.lines.push(l)
    }
    return out
  }, [lines])

  // Product lookup for inline editing (only lines still on the menu are editable)
  const productById = useMemo(() => {
    const map = new Map<string, ProductDTO>()
    for (const c of menu?.categories ?? []) {
      for (const p of c.products) map.set(p.id, p)
    }
    return map
  }, [menu])

  // Gating
  const closed = openStatus ? !openStatus.open : false
  const strictBlocked = closed && (settings?.hours.enforcement ?? 'STRICT') === 'STRICT'
  const looseClosed = closed && (settings?.hours.enforcement ?? 'STRICT') === 'LOOSE'
  const selfOrderEnabled = settings?.ordering.selfOrderEnabled ?? true
  const deliveryEnabled = settings?.ordering.deliveryEnabled ?? true
  const qrisUrl = settings?.payments.qrisImageUrl || ''
  const checkoutDisabled =
    settingsLoading ||
    !selfOrderEnabled ||
    strictBlocked ||
    hasUnavailable ||
    lines.length === 0

  const mutation = useMutation({
    mutationFn: async (payment: PaymentPayload) => {
      if (!idemKey.current) idemKey.current = uuid()
      const s = useCartStore.getState()
      const body: CreateOrderInput = {
        items: s.lines.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          qty: l.qty,
          optionIds: l.options.map((o) => o.id),
          note: l.note.trim() || undefined,
        })),
        type: s.serviceType,
        tableLabel: s.serviceType === 'DINE_IN' && s.tableLabel.trim() ? s.tableLabel.trim() : undefined,
        customerName: s.customerName.trim() || undefined,
        customerPhone: s.customerPhone.trim() || undefined,
        deliveryLocation:
          s.serviceType === 'DELIVERY' && s.deliveryLocation.trim() ? s.deliveryLocation.trim() : undefined,
        note: s.note.trim() || undefined,
        payment,
        source: 'PUBLIC',
        idempotencyKey: idemKey.current,
      }
      return apiFetch<OrderDTO>('/api/public/orders', { method: 'POST', body: JSON.stringify(body) })
    },
    onMutate: () => {
      setSubmitError(null)
    },
    onSuccess: (order) => {
      idemKey.current = null // fresh key for the next order
      useCartStore.getState().clearAll()
      setConfirmed(order)
      setStep('done')
    },
    onError: (e) => {
      const message = e instanceof ApiError ? e.message : t('cart.createFailed')
      setSubmitError(message)
      toast.error(message)
    },
  })

  const submitPayment = (payment: PaymentPayload) => {
    if (checkoutDisabled || mutation.isPending) return
    if (serviceType === 'DELIVERY') {
      const errs: { name?: string; location?: string; phone?: string } = {}
      if (!customerName.trim()) errs.name = t('cart.nameRequired')
      if (!deliveryLocation.trim()) errs.location = t('cart.locationRequired')
      if (settings?.ordering.requirePhoneForDelivery && !customerPhone.trim())
        errs.phone = t('cart.phoneRequired')
      if (Object.keys(errs).length > 0) {
        setErrors(errs)
        if (errs.name) nameRef.current?.focus()
        else if (errs.location) locationRef.current?.focus()
        else phoneRef.current?.focus()
        toast.error(t('cart.fixDelivery'))
        return
      }
    }
    setErrors({})
    lastPaymentRef.current = payment
    mutation.mutate(payment)
  }

  /** Retry the failed checkout with the same payment payload. */
  const retrySubmit = () => submitPayment(lastPaymentRef.current)

  const handleOpenChange = (next: boolean) => {
    if (!next && mutation.isPending) return // keep the sheet open while submitting
    if (!next) {
      setSubmitError(null)
      if (step === 'done') {
        setStep('cart')
        setConfirmed(null)
        setQrReference('')
      } else if (step === 'qris') {
        setStep('cart')
      }
    }
    onOpenChange(next)
  }

  const handleRemove = (line: CartLine) => {
    const index = lines.findIndex((l) => l.lineId === line.lineId)
    if (index < 0) return
    removeLine(line.lineId)
    toast(t('cart.removedToast', { name: line.productName }), {
      action: { label: t('common.undo'), onClick: () => restoreLine(line, index) },
      duration: 5000,
    })
  }

  // Inline edit flow: open the nested ProductSheet pre-filled with the line
  const startEdit = (line: CartLine) => {
    if (!productById.has(line.productId)) return
    setEditLine(line)
    setEditOpen(true)
  }

  const handleUpdate = (lineId: string, payload: AddToCartPayload) => {
    updateLine(lineId, {
      basePrice: payload.basePrice,
      qty: payload.qty,
      options: payload.options,
      note: payload.note,
    })
    setEditOpen(false)
    setEditLine(null)
    toast.success(t('product.changesSaved'))
  }

  const copyCode = async () => {
    if (!confirmed) return
    try {
      await navigator.clipboard.writeText(confirmed.code)
      toast.success(t('confirm.copied'))
    } catch {
      toast.error(t('confirm.copyFailed'))
    }
  }

  const hoursSummary = settings
    ? summarizeHoursLocalized(lang, settings.hours.days)
    : summarizeHoursLocalized(lang, [
        { open: '07:00', close: '14:00', closed: true },
        { open: '07:00', close: '14:00', closed: false },
        { open: '07:00', close: '14:00', closed: false },
        { open: '07:00', close: '14:00', closed: false },
        { open: '07:00', close: '14:00', closed: false },
        { open: '07:00', close: '14:00', closed: false },
        { open: '07:00', close: '14:00', closed: true },
      ])
  const wa = settings?.profile.phone ? waLink(settings.profile.phone) : null

  const SERVICE_OPTIONS: { type: OrderType; label: string; icon: typeof UtensilsCrossed }[] = [
    { type: 'DINE_IN', label: t('cart.dineIn'), icon: UtensilsCrossed },
    { type: 'TAKE_AWAY', label: t('cart.takeAway'), icon: ShoppingBag },
    { type: 'DELIVERY', label: t('cart.delivery'), icon: Bike },
  ]

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="inset-x-0 mx-auto flex max-h-[92dvh] w-full max-w-2xl flex-col gap-0 rounded-t-2xl p-0"
      >
        {step === 'cart' && (
          <>
            <SheetHeader className="flex-row items-center justify-between border-b border-border/60 p-4 pb-3">
              <SheetTitle className="font-display text-lg">
                {t('cart.title')}
                {lines.length > 0 && (
                  <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
                    {t(groups.length === 1 ? 'cart.itemTypesOne' : 'cart.itemTypes', { n: groups.length })}
                  </span>
                )}
              </SheetTitle>
            </SheetHeader>

            <div className="scrollbar-warm min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
              {lines.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-14 text-center">
                  <span className="flex size-16 items-center justify-center rounded-full bg-cream-deep dark:bg-espresso-soft/30">
                    <Coffee className="size-7 text-caramel" />
                  </span>
                  <div>
                    <p className="font-medium">{t('cart.empty')}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t('cart.emptyHint')}</p>
                  </div>
                  <Button
                    type="button"
                    onClick={onBrowse}
                    className="h-11 rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90"
                  >
                    {t('cart.browse')}
                  </Button>
                </div>
              ) : (
                <>
                  {/* Lines grouped by product — each variant line is individually
                      editable in place (pencil / chip tap) */}
                  <div className="divide-y divide-border/60">
                    {groups.map((g) => {
                      const groupQty = g.lines.reduce((s, l) => s + l.qty, 0)
                      const unavailable = menu ? availability.get(g.productId) !== true : false
                      return (
                        <section key={g.productId} className="py-4" aria-label={g.name}>
                          <div className="flex items-center gap-3">
                            <ProductImage
                              src={g.imageUrl}
                              name={g.name}
                              className={cn('size-11 shrink-0 rounded-lg object-cover', unavailable && 'grayscale')}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold leading-snug text-foreground">
                                {g.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                <span className="font-mono tabular-nums">{groupQty}</span>{' '}
                                {t('product.qty').toLowerCase()} ·{' '}
                                <span className="font-mono tabular-nums">
                                  {formatIDR(g.lines.reduce((s, l) => s + lineTotal(l), 0))}
                                </span>
                              </p>
                            </div>
                          </div>

                          {unavailable && (
                            <Badge className="mt-2.5 border-danger/30 bg-danger/10 text-danger">
                              {t('cart.unavailableLine')}
                            </Badge>
                          )}

                          <ul className="mt-2.5 space-y-2.5">
                            {g.lines.map((l) => {
                              const editable = productById.has(l.productId)
                              return (
                                <li
                                  key={l.lineId}
                                  className="rounded-xl border border-border/70 bg-cream-deep/40 p-3 dark:bg-espresso-soft/15"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {l.options.length > 0 ? (
                                          <button
                                            type="button"
                                            disabled={!editable}
                                            onClick={() => startEdit(l)}
                                            title={editable ? t('cart.editLine', { name: l.productName }) : undefined}
                                            className="group/options flex flex-wrap items-center gap-1"
                                          >
                                            {l.options.map((o) => (
                                              <span
                                                key={o.id}
                                                className={cn(
                                                  'rounded-md bg-cream-deep px-1.5 py-0.5 text-[10px] font-medium text-foreground/80 transition-colors dark:bg-espresso-soft/50',
                                                  editable &&
                                                    'group-hover/options:border group-hover/options:border-caramel/50 group-hover/options:text-caramel'
                                                )}
                                              >
                                                {o.label}
                                              </span>
                                            ))}
                                            {editable && (
                                              <Pencil className="size-3 shrink-0 text-muted-foreground/50 transition-colors group-hover/options:text-caramel" />
                                            )}
                                          </button>
                                        ) : (
                                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                                            —
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRemove(l)}
                                      aria-label={t('cart.removeLine', { name: l.productName })}
                                      className="-mr-1 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                                    >
                                      <Trash2 className="size-4" />
                                    </button>
                                  </div>

                                  {editingNoteId === l.lineId ? (
                                    <Input
                                      value={l.note}
                                      onChange={(e) => setLineNote(l.lineId, e.target.value)}
                                      onBlur={() => setEditingNoteId(null)}
                                      placeholder={t('cart.notePlaceholder')}
                                      maxLength={200}
                                      autoFocus
                                      className="mt-2 h-9 rounded-lg text-xs"
                                      aria-label={`${t('product.note')} — ${l.productName}`}
                                    />
                                  ) : l.note ? (
                                    <button
                                      type="button"
                                      onClick={() => setEditingNoteId(l.lineId)}
                                      className="mt-1.5 flex min-h-6 items-center gap-1 text-left text-xs italic text-muted-foreground hover:text-foreground"
                                    >
                                      <MessageSquareText className="size-3 shrink-0" />
                                      <span className="line-clamp-2">“{l.note}”</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setEditingNoteId(l.lineId)}
                                      className="mt-1.5 flex min-h-6 items-center gap-1 text-xs text-muted-foreground/70 transition-colors hover:text-foreground"
                                    >
                                      <MessageSquarePlus className="size-3" /> {t('cart.addNote')}
                                    </button>
                                  )}

                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <QtyStepper
                                      compact
                                      value={l.qty}
                                      onChange={(q) => setQty(l.lineId, q)}
                                      label={t('cart.qtyOf', { name: l.productName })}
                                    />
                                    <div className="flex items-center gap-2.5">
                                      {editable && (
                                        <button
                                          type="button"
                                          onClick={() => startEdit(l)}
                                          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-caramel/60 hover:text-caramel"
                                        >
                                          <Pencil className="size-3" />
                                          {t('common.edit')}
                                        </button>
                                      )}
                                      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                                        {formatIDR(lineTotal(l))}
                                      </span>
                                    </div>
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                        </section>
                      )
                    })}
                  </div>

                  {/* Service type */}
                  <div className="space-y-3 py-4">
                    <div
                      role="radiogroup"
                      aria-label={t('cart.serviceType')}
                      className="grid grid-cols-3 gap-1 rounded-full border border-border bg-cream-deep p-1 dark:bg-espresso-soft/20"
                    >
                      {SERVICE_OPTIONS.map((opt) => {
                        const disabled = opt.type === 'DELIVERY' && !deliveryEnabled
                        const active = serviceType === opt.type
                        return (
                          <button
                            key={opt.type}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            disabled={disabled}
                            onClick={() => {
                              setServiceType(opt.type)
                              setErrors({})
                            }}
                            title={disabled ? t('cart.deliveryOff') : undefined}
                            className={cn(
                              'flex h-11 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors sm:text-sm',
                              active
                                ? 'bg-espresso-deep text-[#FBF7F0] shadow-sm'
                                : 'text-foreground hover:bg-background/70',
                              disabled && 'cursor-not-allowed opacity-40'
                            )}
                          >
                            <opt.icon className="size-4 shrink-0" />
                            <span className="truncate">{opt.label}</span>
                          </button>
                        )
                      })}
                    </div>

                    {serviceType === 'DINE_IN' && (
                      <div className="space-y-1.5">
                        <label htmlFor="cart-table" className="text-xs font-medium text-muted-foreground">
                          {t('cart.tableLabel')} ({t('product.optional')})
                        </label>
                        <Input
                          id="cart-table"
                          value={tableLabel}
                          onChange={(e) => setField('tableLabel', e.target.value)}
                          placeholder={t('cart.tablePlaceholder')}
                          maxLength={20}
                          className="h-11 rounded-xl bg-background"
                        />
                      </div>
                    )}

                    {serviceType === 'DELIVERY' && (
                      <div className="space-y-3 rounded-xl border border-border/70 bg-cream-deep/50 p-3.5 dark:bg-espresso-soft/15">
                        {(settings?.ordering.deliveryLocations ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {(settings?.ordering.deliveryLocations ?? []).map((loc) => (
                              <button
                                key={loc}
                                type="button"
                                onClick={() => setField('deliveryLocation', loc)}
                                aria-pressed={deliveryLocation === loc}
                                className={cn(
                                  'inline-flex h-9 items-center rounded-full border px-3.5 text-xs font-medium transition-colors',
                                  deliveryLocation === loc
                                    ? 'border-transparent bg-primary text-primary-foreground'
                                    : 'border-border bg-background text-foreground hover:border-primary/40'
                                )}
                              >
                                {loc}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <label htmlFor="cart-name" className="text-xs font-medium text-muted-foreground">
                            {t('cart.nameLabel')} <span className="text-danger">*</span>
                          </label>
                          <Input
                            id="cart-name"
                            ref={nameRef}
                            value={customerName}
                            onChange={(e) => setField('customerName', e.target.value)}
                            placeholder={t('cart.namePlaceholder')}
                            maxLength={60}
                            aria-invalid={Boolean(errors.name)}
                            className="h-11 rounded-xl bg-background"
                          />
                          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor="cart-location" className="text-xs font-medium text-muted-foreground">
                            {t('cart.locationLabel')} <span className="text-danger">*</span>
                          </label>
                          <Input
                            id="cart-location"
                            ref={locationRef}
                            value={deliveryLocation}
                            onChange={(e) => setField('deliveryLocation', e.target.value)}
                            placeholder={t('cart.locationPlaceholder')}
                            maxLength={120}
                            aria-invalid={Boolean(errors.location)}
                            className="h-11 rounded-xl bg-background"
                          />
                          {errors.location && <p className="text-xs text-destructive">{errors.location}</p>}
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor="cart-phone" className="text-xs font-medium text-muted-foreground">
                            {t('cart.phoneLabel')}{' '}
                            {settings?.ordering.requirePhoneForDelivery ? (
                              <span className="text-danger">*</span>
                            ) : (
                              <span className="font-normal">({t('product.optional')})</span>
                            )}
                          </label>
                          <Input
                            id="cart-phone"
                            ref={phoneRef}
                            value={customerPhone}
                            onChange={(e) => setField('customerPhone', e.target.value)}
                            placeholder={t('cart.phonePlaceholder')}
                            inputMode="tel"
                            maxLength={20}
                            aria-invalid={Boolean(errors.phone)}
                            className="h-11 rounded-xl bg-background"
                          />
                          {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label htmlFor="cart-note" className="text-xs font-medium text-muted-foreground">
                        {t('cart.orderNote')} ({t('product.optional')})
                      </label>
                      <Input
                        id="cart-note"
                        value={orderNote}
                        onChange={(e) => setField('note', e.target.value)}
                        placeholder={t('cart.notePlaceholder')}
                        maxLength={300}
                        className="h-11 rounded-xl bg-background"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {lines.length > 0 && (
              <div className="mt-auto space-y-3 border-t border-border/60 bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                {/* Banners */}
                {strictBlocked && (
                  <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
                    <Store className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {t('cart.closedStrict', { hours: hoursSummary })}{' '}
                      {wa && (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                          {t('storefront.contactUs')}
                        </a>
                      )}
                    </span>
                  </div>
                )}
                {looseClosed && (
                  <div className="rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-xs text-warning">
                    {t('cart.closedLoose', { hours: hoursSummary })}
                  </div>
                )}
                {!selfOrderEnabled && !settingsLoading && (
                  <div className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
                    {t('cart.selfOrderOff')}
                  </div>
                )}
                {hasUnavailable && (
                  <div className="rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-xs text-warning">
                    {t('cart.unavailableBanner')}
                  </div>
                )}

                {/* Summary */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('cart.subtotal')}</span>
                    <span className="font-mono tabular-nums text-foreground">{formatIDR(subtotal)}</span>
                  </div>
                  {serviceType === 'DELIVERY' && (
                    <div className="flex justify-between text-caramel">
                      <span>{t('cart.deliveryFeePerOrder')}</span>
                      <span className="font-mono tabular-nums">+{formatIDR(deliveryFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-dashed border-border pt-2 text-base font-semibold">
                    <span>{t('cart.total')}</span>
                    <span className="font-mono tabular-nums text-foreground">{formatIDR(total)}</span>
                  </div>
                </div>

                {/* Inline checkout error + retry (no dead-end failures) */}
                {submitError && !mutation.isPending && (
                  <CheckoutErrorAlert message={submitError} onRetry={retrySubmit} />
                )}

                {/* Payment choice */}
                <div className="grid gap-2">
                  <Button
                    type="button"
                    disabled={checkoutDisabled}
                    onClick={() => submitPayment(null)}
                    className="h-12 rounded-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    {mutation.isPending ? t('cart.creatingOrder') : t('payment.payAtCounter')}
                  </Button>
                  {qrisUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={checkoutDisabled}
                      onClick={() => {
                        setQrFailed(false)
                        setStep('qris')
                      }}
                      className="h-12 rounded-full border-caramel/60 text-base font-semibold text-caramel hover:bg-caramel/10"
                    >
                      <QrCode className="size-5" /> {t('payment.payWithQris')}
                    </Button>
                  )}
                  <p className="text-center text-[11px] text-muted-foreground">
                    {t('payment.payAtCounterHint')}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {step === 'qris' && (
          <div className="scrollbar-warm min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <SheetTitle className="sr-only">{t('payment.qrisTitle')}</SheetTitle>
            <button
              type="button"
              onClick={() => setStep('cart')}
              aria-label={t('payment.backToCart')}
              className="-m-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h3 className="mt-1 text-center font-display text-xl">{t('payment.qrisTitle')}</h3>
            <p className="mt-1 text-center text-xs text-muted-foreground">
              {settings?.payments.qrisMerchantName || settings?.profile.name || 'Sekelas Cafe'}
            </p>

            <div className="mx-auto mt-5 w-56 rounded-2xl border-2 border-border bg-white p-3 shadow-sm">
              {qrFailed ? (
                <div className="flex h-50 items-center justify-center text-muted-foreground" aria-hidden="true">
                  <QrCode className="size-20" />
                </div>
              ) : (
                <img
                  src={qrisUrl}
                  alt={t('payment.qrisAlt')}
                  className="size-50 object-contain"
                  onError={() => setQrFailed(true)}
                />
              )}
            </div>

            <p className="mt-6 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {t('payment.enterAmount')}
            </p>
            <p className="text-center font-mono text-3xl font-bold tabular-nums text-foreground">
              {formatIDR(total)}
            </p>

            <ol className="mx-auto mt-4 max-w-xs space-y-1.5 text-sm text-muted-foreground">
              <li>1. {t('payment.qrisStep1')}</li>
              <li>2. {t('payment.qrisStep2')}</li>
              <li>3. {t('payment.qrisStep3')}</li>
            </ol>

            <div className="mx-auto mt-5 max-w-xs space-y-3">
              {submitError && !mutation.isPending && (
                <CheckoutErrorAlert message={submitError} onRetry={retrySubmit} />
              )}
              <Input
                value={qrReference}
                onChange={(e) => setQrReference(e.target.value)}
                placeholder={t('payment.referencePlaceholder')}
                maxLength={60}
                aria-label={t('payment.referenceAria')}
                className="h-11 rounded-xl bg-background text-center"
              />
              <Button
                type="button"
                disabled={mutation.isPending}
                onClick={() =>
                  submitPayment({ method: 'QRIS', qrReference: qrReference.trim() || undefined })
                }
                className="h-12 w-full rounded-full bg-caramel text-base font-semibold text-espresso-deep hover:bg-caramel-light"
              >
                {mutation.isPending ? t('payment.submitting') : t('payment.alreadyPaid')}
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                {t('payment.qrisNote')}
              </p>
            </div>
          </div>
        )}

        {step === 'done' && confirmed && (
          <div className="scrollbar-warm min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center">
            <SheetTitle className="sr-only">{t('confirm.title')}</SheetTitle>
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="mx-auto flex size-16 items-center justify-center rounded-full bg-success/15 text-success"
            >
              <CheckCircle2 className="size-8" />
            </motion.div>
            <h3 className="mt-4 font-display text-2xl">{t('confirm.title')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('confirm.hint')}</p>

            <button
              type="button"
              onClick={copyCode}
              aria-label={`${t('confirm.copyCode')} ${confirmed.code}`}
              className="mx-auto mt-5 inline-flex items-center gap-3 rounded-2xl bg-espresso-deep px-7 py-4 font-mono text-3xl font-bold tracking-wider text-[#D9A441] shadow-lg transition-transform active:scale-[0.97]"
            >
              {confirmed.code}
              <Copy className="size-5 opacity-60" />
            </button>

            <div className="mt-6 rounded-2xl border border-border/60 bg-background p-4">
              <OrderStepper order={confirmed} variant="mini" />
            </div>

            {confirmed.paymentStatus === 'UNPAID' && (
              <p className="mt-4 text-sm font-medium text-warning">
                {t('confirm.unpaidNote', { total: formatIDR(confirmed.total) })}
              </p>
            )}
            {confirmed.paymentStatus === 'PENDING_VERIFICATION' && (
              <p className="mt-4 text-sm font-medium text-warning">{t('confirm.pendingNote')}</p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">{t('confirm.readyEtaNote')}</p>

            <div className="mx-auto mt-6 grid max-w-xs gap-2">
              <Button
                asChild
                className="h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link href={`/track/${confirmed.code}`} onClick={() => handleOpenChange(false)}>
                  <PackageSearch className="size-4" /> {t('confirm.trackOrder')}
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="h-11 rounded-full"
              >
                {t('common.close')}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>

      {/* Inline edit: nested product sheet pre-filled with the cart line */}
      <ProductSheet
        product={editLine ? (productById.get(editLine.productId) ?? null) : null}
        editLine={editLine}
        open={editOpen}
        onOpenChange={setEditOpen}
        onAdd={() => undefined}
        onUpdate={handleUpdate}
      />
    </Sheet>
  )
}

/** Inline destructive alert shown above the checkout CTA when order-create fails. */
function CheckoutErrorAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" aria-hidden />
      <AlertTitle>{t('cart.createFailedTitle')}</AlertTitle>
      <AlertDescription>
        {message}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-2 min-h-11 gap-2 rounded-full"
        >
          <RefreshCw className="size-3.5" aria-hidden /> {t('common.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
