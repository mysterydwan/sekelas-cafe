'use client'

// POS right rail (SPEC §3.6): tabs "Pesanan Baru" | "Pesanan Aktif", cash
// drawer strip, cart lines w/ qty steppers + undo remove, order meta (service
// type, table quick-pick, delivery fields), discount (grant-gated), running
// totals always visible, park/charge actions.

import { useEffect, useState } from 'react'
import {
  Bike,
  Minus,
  Pause,
  Percent,
  Plus,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/staff/primitives'
import { CashStrip } from './cash-strip'
import { OpenOrdersPanel } from './open-orders'
import { formatIDR } from '@/lib/format'
import type { CashStatusDTO, DiscountInput, DraftLine, OrderDTO, OrderType, SettingsDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface CartMeta {
  type: OrderType
  tableLabel: string
  customerName: string
  customerPhone: string
  deliveryLocation: string
  note: string
}

export const defaultCartMeta: CartMeta = {
  type: 'DINE_IN',
  tableLabel: '',
  customerName: '',
  customerPhone: '',
  deliveryLocation: '',
  note: '',
}

export interface CartTotals {
  subtotal: number
  discountValue: number
  deliveryFee: number
  tax: number
  total: number
}

const TYPE_OPTIONS: { id: OrderType; label: string; icon: typeof UtensilsCrossed }[] = [
  { id: 'DINE_IN', label: 'Di Tempat', icon: UtensilsCrossed },
  { id: 'TAKE_AWAY', label: 'Bungkus', icon: ShoppingBag },
  { id: 'DELIVERY', label: 'Antar', icon: Bike },
]

function DiscountDialog({
  open,
  onOpenChange,
  discount,
  subtotal,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  discount: DiscountInput | null
  subtotal: number
  onSave: (d: DiscountInput | null) => void
}) {
  const [type, setType] = useState<'RP' | 'PERCENT'>('RP')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        if (discount) {
          setType(discount.type)
          setValue(String(discount.value))
          setReason(discount.reason)
        } else {
          setType('RP')
          setValue('')
          setReason('')
        }
      }, 0)
      return () => clearTimeout(t)
    }
  }, [open, discount])

  const numValue = parseInt(value, 10) || 0
  const effective = type === 'RP' ? Math.min(numValue, subtotal) : Math.min(Math.round((subtotal * numValue) / 100), subtotal)
  const invalid =
    !numValue ||
    numValue < 1 ||
    (type === 'PERCENT' && numValue > 100) ||
    (type === 'RP' && numValue > subtotal) ||
    !reason.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Diskon Pesanan</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Jenis diskon">
            {(
              [
                { id: 'RP', label: 'Nominal (Rp)' },
                { id: 'PERCENT', label: 'Persen (%)' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={type === t.id}
                onClick={() => setType(t.id)}
                className={cn(
                  'min-h-[44px] rounded-lg border text-sm font-medium transition-all',
                  type === t.id ? 'border-caramel bg-caramel/15' : 'bg-background hover:border-caramel/60'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discount-value">Nilai diskon</Label>
            <Input
              id="discount-value"
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder={type === 'RP' ? 'mis. 2000' : 'mis. 10'}
              className="min-h-[48px] font-mono text-lg tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discount-reason">Alasan (wajib, tercatat di laporan)</Label>
            <Input
              id="discount-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="mis. rapat guru, komplain"
              maxLength={60}
            />
          </div>
          <p className="rounded-lg bg-cream p-2.5 text-sm dark:bg-secondary">
            Diskon diterapkan:{' '}
            <span className="font-mono font-bold tabular-nums">{formatIDR(Math.max(0, effective))}</span>{' '}
            <span className="text-muted-foreground">(dari subtotal {formatIDR(subtotal)})</span>
          </p>
        </div>
        <DialogFooter className="gap-2">
          {discount && (
            <Button
              variant="outline"
              className="min-h-[44px] flex-1 text-destructive"
              onClick={() => {
                onSave(null)
                onOpenChange(false)
              }}
            >
              Hapus Diskon
            </Button>
          )}
          <Button
            disabled={invalid}
            className="min-h-[44px] flex-1 bg-espresso text-cream hover:bg-espresso-soft"
            onClick={() => {
              onSave({ type, value: numValue, reason: reason.trim() })
              onOpenChange(false)
            }}
          >
            Terapkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CartPanel({
  lines,
  meta,
  discount,
  totals,
  settings,
  canDiscount,
  metaError,
  resolve,
  onQty,
  onRemove,
  onEditLine,
  onUpdateMeta,
  onDiscount,
  onCharge,
  onHold,
  onOpenHeld,
  heldCount,
}: {
  lines: DraftLine[]
  meta: CartMeta
  discount: DiscountInput | null
  totals: CartTotals
  settings: SettingsDTO | undefined
  canDiscount: boolean
  metaError: string | null
  resolve: (line: DraftLine) => { unitPrice: number; variantLabels: string[] }
  onQty: (index: number, delta: 1 | -1) => void
  onRemove: (index: number) => void
  onEditLine: (index: number) => void
  onUpdateMeta: (patch: Partial<CartMeta>) => void
  onDiscount: (d: DiscountInput | null) => void
  onCharge: () => void
  onHold: () => void
  onOpenHeld: () => void
  heldCount: number
}) {
  const [discountOpen, setDiscountOpen] = useState(false)
  const itemCount = lines.reduce((s, l) => s + l.qty, 0)
  const err = (key: keyof CartMeta) => metaError === key

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Cart lines */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-warm" aria-label="Item keranjang">
        {lines.length === 0 ? (
          <EmptyState
            title="Keranjang kosong"
            description="Pilih menu di sebelah kiri — item akan muncul di sini."
          />
        ) : (
          <ul className="space-y-2">
            {lines.map((line, index) => {
              const r = resolve(line)
              return (
                <li key={`${line.productId}-${index}`} className="rounded-xl border bg-card p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onEditLine(index)}
                      className="min-w-0 flex-1 text-left"
                      aria-label={`Ubah ${line.productName}`}
                    >
                      <p className="truncate text-sm font-semibold">{line.productName}</p>
                      {r.variantLabels.length > 0 && (
                        <p className="truncate text-xs text-muted-foreground">{r.variantLabels.join(', ')}</p>
                      )}
                      {line.note && <p className="truncate text-xs italic text-warning">“{line.note}”</p>}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(index)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Hapus ${line.productName}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => onQty(index, -1)}
                        aria-label="Kurangi jumlah"
                      >
                        <Minus className="h-4 w-4" aria-hidden />
                      </Button>
                      <span className="w-9 text-center font-mono text-base font-semibold tabular-nums">{line.qty}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => onQty(index, 1)}
                        aria-label="Tambah jumlah"
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-bold tabular-nums">{formatIDR(r.unitPrice * line.qty)}</p>
                      {line.qty > 1 && <p className="text-[10px] text-muted-foreground">@{formatIDR(r.unitPrice)}</p>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Meta + totals */}
      <div className="space-y-3 border-t bg-card p-3">
        {/* Service type */}
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Jenis pesanan">
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={meta.type === t.id}
              onClick={() => onUpdateMeta({ type: t.id })}
              className={cn(
                'flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg border text-xs font-medium transition-all',
                meta.type === t.id
                  ? 'border-caramel bg-caramel/15 text-espresso dark:text-caramel-light'
                  : 'bg-background hover:border-caramel/60'
              )}
            >
              <t.icon className="h-4 w-4" aria-hidden />
              {t.label}
            </button>
          ))}
        </div>

        {meta.type === 'DINE_IN' && (
          <div className="space-y-1.5">
            <Label htmlFor="table-label">Nomor meja (opsional)</Label>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onUpdateMeta({ tableLabel: n })}
                  className={cn(
                    'h-10 w-10 rounded-lg border font-mono text-sm font-semibold transition-all',
                    meta.tableLabel === n
                      ? 'border-caramel bg-caramel/15'
                      : 'bg-background hover:border-caramel/60'
                  )}
                  aria-label={`Meja ${n}`}
                >
                  {n}
                </button>
              ))}
              <Input
                id="table-label"
                value={meta.tableLabel}
                onChange={(e) => onUpdateMeta({ tableLabel: e.target.value })}
                placeholder="Lain…"
                className="h-10 w-20"
                maxLength={20}
              />
            </div>
          </div>
        )}

        {meta.type === 'DELIVERY' && (
          <div className="space-y-2.5">
            <div className="space-y-1.5">
              <Label htmlFor="cust-name">
                Nama penerima <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cust-name"
                value={meta.customerName}
                onChange={(e) => onUpdateMeta({ customerName: e.target.value })}
                placeholder="mis. Bu Sari"
                maxLength={60}
                aria-invalid={err('customerName')}
                className={cn('min-h-[44px]', err('customerName') && 'border-destructive ring-destructive/30')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-phone">
                No. HP{settings?.ordering.requirePhoneForDelivery ? ' *' : ' (opsional)'}
              </Label>
              <Input
                id="cust-phone"
                value={meta.customerPhone}
                onChange={(e) => onUpdateMeta({ customerPhone: e.target.value })}
                placeholder="08xx"
                inputMode="tel"
                maxLength={20}
                aria-invalid={err('customerPhone')}
                className={cn('min-h-[44px]', err('customerPhone') && 'border-destructive ring-destructive/30')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delivery-loc">
                Lokasi antar <span className="text-destructive">*</span>
              </Label>
              <Input
                id="delivery-loc"
                value={meta.deliveryLocation}
                onChange={(e) => onUpdateMeta({ deliveryLocation: e.target.value })}
                placeholder="mis. Lab Komputer"
                maxLength={120}
                aria-invalid={err('deliveryLocation')}
                className={cn('min-h-[44px]', err('deliveryLocation') && 'border-destructive ring-destructive/30')}
              />
              <div className="flex flex-wrap gap-1.5">
                {(settings?.ordering.deliveryLocations ?? []).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => onUpdateMeta({ deliveryLocation: loc })}
                    className={cn(
                      'min-h-[36px] rounded-full border px-3 text-xs font-medium transition-all',
                      meta.deliveryLocation === loc
                        ? 'border-caramel bg-caramel/15'
                        : 'bg-background hover:border-caramel/60'
                    )}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="order-note">Catatan pesanan (opsional)</Label>
          <Textarea
            id="order-note"
            value={meta.note}
            onChange={(e) => onUpdateMeta({ note: e.target.value })}
            placeholder="mis. ambil nanti jam 10"
            className="min-h-[60px] text-sm"
            maxLength={300}
          />
        </div>

        {/* Totals */}
        <div className="space-y-1 rounded-xl bg-cream p-3 font-mono text-sm tabular-nums dark:bg-secondary" aria-label="Ringkasan biaya">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatIDR(totals.subtotal)}</span>
          </div>
          {totals.discountValue > 0 && (
            <div className="flex justify-between text-success">
              <span className="font-sans">Diskon{discount ? ` (${discount.reason})` : ''}</span>
              <span>-{formatIDR(totals.discountValue)}</span>
            </div>
          )}
          {totals.deliveryFee > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span className="font-sans">Ongkir</span>
              <span>{formatIDR(totals.deliveryFee)}</span>
            </div>
          )}
          {totals.tax > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span className="font-sans">Pajak</span>
              <span>{formatIDR(totals.tax)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1.5 text-base font-bold">
            <span className="font-sans">Total</span>
            <span>{formatIDR(totals.total)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={onHold} disabled={lines.length === 0} className="min-h-[44px] px-3" aria-label="Tahan pesanan saat ini">
              <Pause className="h-4 w-4" aria-hidden />
              <span className="sr-only">Tahan</span>
            </Button>
            <Button variant="outline" onClick={onOpenHeld} className="min-h-[44px] px-3 text-xs" aria-label={`Pesanan ditahan (${heldCount})`}>
              <span className="relative">
                Ditahan
                {heldCount > 0 && (
                  <span className="absolute -right-2.5 -top-2.5 rounded-full bg-warning px-1 font-mono text-[9px] font-bold text-white">
                    {heldCount}
                  </span>
                )}
              </span>
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {canDiscount && (
              <Button variant="outline" onClick={() => setDiscountOpen(true)} className="min-h-[44px]">
                <Percent className="mr-1 h-4 w-4" aria-hidden />
                {discount ? `Diskon −${formatIDR(totals.discountValue)}` : 'Diskon'}
              </Button>
            )}
            <Button
              onClick={onCharge}
              disabled={lines.length === 0}
              className="min-h-[52px] bg-espresso text-base text-cream hover:bg-espresso-soft"
            >
              <Wallet className="mr-2 h-5 w-5" aria-hidden />
              Bayar {itemCount > 0 ? `(${itemCount} item)` : ''}
            </Button>
          </div>
        </div>
      </div>

      <DiscountDialog
        open={discountOpen}
        onOpenChange={setDiscountOpen}
        discount={discount}
        subtotal={totals.subtotal}
        onSave={onDiscount}
      />
    </div>
  )
}

export function CartRail(props: {
  tab: 'new' | 'active'
  onTabChange: (t: 'new' | 'active') => void
  activeCount: number
  cash: CashStatusDTO | undefined
  cashLoading: boolean
  lines: DraftLine[]
  meta: CartMeta
  discount: DiscountInput | null
  totals: CartTotals
  settings: SettingsDTO | undefined
  canDiscount: boolean
  metaError: string | null
  resolve: (line: DraftLine) => { unitPrice: number; variantLabels: string[] }
  onQty: (index: number, delta: 1 | -1) => void
  onRemove: (index: number) => void
  onEditLine: (index: number) => void
  onUpdateMeta: (patch: Partial<CartMeta>) => void
  onDiscount: (d: DiscountInput | null) => void
  onCharge: () => void
  onHold: () => void
  onOpenHeld: () => void
  heldCount: number
  openOrders: OrderDTO[]
  openOrdersLoading: boolean
  onPayOrder: (o: OrderDTO) => void
  onVerifyQris: (o: OrderDTO) => void
  onServe: (o: OrderDTO) => void
  onDeliver: (o: OrderDTO, courier: string) => void
  onArrive: (o: OrderDTO) => void
  onReprint: (o: OrderDTO, t: 'KOT' | 'RECEIPT') => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <CashStrip cash={props.cash} loading={props.cashLoading} />
      <Tabs value={props.tab} onValueChange={(v) => props.onTabChange(v as 'new' | 'active')} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="border-b px-3 py-2">
          <TabsList className="grid h-11 w-full grid-cols-2">
            <TabsTrigger value="new" className="min-h-[40px] text-sm">
              Pesanan Baru
            </TabsTrigger>
            <TabsTrigger value="active" className="min-h-[40px] text-sm">
              Pesanan Aktif
              {props.activeCount > 0 && (
                <span className="ml-1.5 rounded-full bg-caramel px-1.5 font-mono text-[10px] font-bold text-espresso-deep">
                  {props.activeCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="new" className="mt-0 min-h-0 flex-1">
          <CartPanel
            lines={props.lines}
            meta={props.meta}
            discount={props.discount}
            totals={props.totals}
            settings={props.settings}
            canDiscount={props.canDiscount}
            metaError={props.metaError}
            resolve={props.resolve}
            onQty={props.onQty}
            onRemove={props.onRemove}
            onEditLine={props.onEditLine}
            onUpdateMeta={props.onUpdateMeta}
            onDiscount={props.onDiscount}
            onCharge={props.onCharge}
            onHold={props.onHold}
            onOpenHeld={props.onOpenHeld}
            heldCount={props.heldCount}
          />
        </TabsContent>
        <TabsContent value="active" className="mt-0 min-h-0 flex-1 overflow-y-auto scrollbar-warm">
          <OpenOrdersPanel
            orders={props.openOrders}
            loading={props.openOrdersLoading}
            onPayOrder={props.onPayOrder}
            onVerifyQris={props.onVerifyQris}
            onServe={props.onServe}
            onDeliver={props.onDeliver}
            onArrive={props.onArrive}
            onReprint={props.onReprint}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
