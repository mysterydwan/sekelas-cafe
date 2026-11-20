'use client'

// POS workspace (SPEC §3.6): split layout — product area left, persistent cart
// rail right (bottom sheet + floating summary bar on mobile). Owns cart state
// (autosaved per user), held orders, open orders, charge flow, cash strip.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { ChevronRight, ShoppingBag } from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { useSession } from '@/hooks/use-session'
import { useRealtime } from '@/hooks/use-realtime'
import { formatIDR, formatTime, todayJakarta } from '@/lib/format'
import type {
  CashStatusDTO,
  DiscountInput,
  DraftLine,
  MenuDTO,
  OrderDTO,
  PaymentInput,
  ProductDTO,
  SettingsDTO,
} from '@/lib/types'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { VariantSheet } from '@/components/staff/variant-sheet'
import { ChargeDialog, QrisVerifyDialog, type ChargeResult } from '@/components/staff/charge-modals'
import { printKot, printReceipt } from '@/components/staff/receipt'
import { ProductPanel } from './product-panel'
import { CartRail, defaultCartMeta, type CartMeta, type CartTotals } from './cart-rail'
import { HeldSheet } from './held-sheet'

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function sameOptions(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x))
}

export function PosWorkspace() {
  const { user, can } = useSession()
  const queryClient = useQueryClient()

  // ---- server data ----
  const { data: settings } = useQuery({
    queryKey: ['pos-settings'],
    queryFn: () => apiFetch<SettingsDTO>('/api/settings'),
    staleTime: 60_000,
  })
  const {
    data: menu,
    isPending: menuLoading,
    error: menuError,
    refetch: refetchMenu,
  } = useQuery({
    queryKey: ['pos-menu'],
    queryFn: () => apiFetch<MenuDTO>('/api/public/menu'),
  })
  const today = todayJakarta()
  const {
    data: openOrdersData,
    isPending: openOrdersLoading,
    refetch: refetchOpenOrders,
  } = useQuery({
    queryKey: ['pos-open-orders', today],
    queryFn: () => apiFetch<{ rows: OrderDTO[] }>(`/api/orders?from=${today}&full=1`),
    refetchInterval: 15_000,
  })
  const { data: cash, isPending: cashLoading } = useQuery({
    queryKey: ['pos-cash'],
    queryFn: () => apiFetch<CashStatusDTO>('/api/pos/cash'),
    refetchInterval: 30_000,
  })
  const { data: held } = useQuery({
    queryKey: ['pos-held'],
    queryFn: () => apiFetch<{ id: string; itemCount: number }[]>('/api/pos/held'),
    refetchInterval: 60_000,
  })

  useRealtime(['menu:availability'], () => {
    void refetchMenu()
  })
  useRealtime(['order:created', 'payment:updated'], () => {
    void refetchOpenOrders()
  })

  const openOrders = useMemo(
    () => (openOrdersData?.rows ?? []).filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED'),
    [openOrdersData]
  )

  // ---- cart state (autosaved per user, SPEC §3.6) ----
  const [lines, setLines] = useState<DraftLine[]>([])
  const [meta, setMeta] = useState<CartMeta>(defaultCartMeta)
  const [discount, setDiscount] = useState<DiscountInput | null>(null)
  const skipPersist = useRef(true)
  const storageKey = `pos-cart-${user?.id ?? 'anon'}`

  useEffect(() => {
    if (!user) return
    try {
      const raw = localStorage.getItem(`pos-cart-${user.id}`)
      if (raw) {
        const parsed = JSON.parse(raw) as { lines?: DraftLine[]; meta?: Partial<CartMeta> }
        setLines(Array.isArray(parsed.lines) ? parsed.lines : [])
        setMeta({ ...defaultCartMeta, ...(parsed.meta ?? {}) })
      }
    } catch {
      /* corrupted draft — start fresh */
    }
    skipPersist.current = true
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    if (skipPersist.current) {
      skipPersist.current = false
      return
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({ lines, meta }))
    } catch {
      /* storage unavailable — cart lives in memory */
    }
  }, [lines, meta, user, storageKey])

  // dirty guard: reload/close with items in cart
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (lines.length === 0) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [lines.length])

  // ---- resolvers ----
  const productMap = useMemo(() => {
    const m = new Map<string, ProductDTO>()
    for (const c of menu?.categories ?? []) for (const p of c.products) m.set(p.id, p)
    return m
  }, [menu])

  const resolve = useCallback(
    (line: DraftLine): { unitPrice: number; variantLabels: string[] } => {
      const product = productMap.get(line.productId)
      const labels: string[] = []
      let delta = 0
      for (const g of product?.variantGroups ?? []) {
        for (const o of g.options) {
          if (line.optionIds.includes(o.id)) {
            labels.push(o.priceDelta ? `${o.priceDelta > 0 ? '+ ' : ''}${o.label}` : o.label)
            delta += o.priceDelta
          }
        }
      }
      return { unitPrice: (product?.basePrice ?? 0) + delta, variantLabels: labels }
    },
    [productMap]
  )

  const totals: CartTotals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + resolve(l).unitPrice * l.qty, 0)
    const discountValue = discount
      ? discount.type === 'RP'
        ? Math.min(discount.value, subtotal)
        : Math.min(Math.round((subtotal * discount.value) / 100), subtotal)
      : 0
    const deliveryFee = meta.type === 'DELIVERY' ? (settings?.ordering.deliveryFee ?? 0) : 0
    const tax = Math.round(((subtotal - discountValue) * (settings?.ordering.taxRatePercent ?? 0)) / 100)
    return { subtotal, discountValue, deliveryFee, tax, total: subtotal - discountValue + deliveryFee + tax }
  }, [lines, discount, meta.type, settings, resolve])

  // ---- cart mutations ----
  const addLine = useCallback((line: DraftLine) => {
    setLines((prev) => {
      const idx = prev.findIndex(
        (l) =>
          l.productId === line.productId &&
          sameOptions(l.optionIds, line.optionIds) &&
          (l.note ?? '') === (line.note ?? '')
      )
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: Math.min(99, next[idx].qty + line.qty) }
        return next
      }
      return [...prev, line]
    })
  }, [])

  const removeLine = useCallback(
    (index: number) => {
      const removed = lines[index]
      if (!removed) return
      setLines((prev) => prev.filter((_, i) => i !== index))
      toast(`${removed.productName} dihapus dari keranjang`, {
        action: {
          label: 'Urungkan',
          onClick: () =>
            setLines((prev) => {
              const next = [...prev]
              next.splice(index, 0, removed)
              return next
            }),
        },
        duration: 5000,
      })
    },
    [lines]
  )

  const changeQty = useCallback((index: number, delta: 1 | -1) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, qty: Math.min(99, Math.max(1, l.qty + delta)) } : l))
    )
  }, [])

  // ---- variant sheet ----
  const [variantProduct, setVariantProduct] = useState<ProductDTO | null>(null)
  const [variantEdit, setVariantEdit] = useState<{ line: DraftLine; index: number } | null>(null)
  const [variantOpen, setVariantOpen] = useState(false)

  const pickProduct = (product: ProductDTO, event: React.MouseEvent) => {
    if (!product.isAvailable) return
    const needsVariant = product.variantGroups.some((g) => g.isRequired && g.isActive)
    if (needsVariant) {
      setVariantEdit(null)
      setVariantProduct(product)
      setVariantOpen(true)
      return
    }
    addLine({ productId: product.id, productName: product.name, qty: 1, optionIds: [] })
    toast.success(`${product.name} masuk keranjang`)
    setFly({ id: Date.now(), x: event.clientX, y: event.clientY })
  }

  const editLine = (index: number) => {
    const line = lines[index]
    if (!line) return
    const product = productMap.get(line.productId)
    if (!product) {
      toast.error('Produk ini sudah tidak tersedia — hapus item dan pilih yang lain')
      return
    }
    setVariantProduct(product)
    setVariantEdit({ line, index })
    setVariantOpen(true)
  }

  // ---- flying feedback ----
  const [fly, setFly] = useState<{ id: number; x: number; y: number } | null>(null)

  // ---- held orders ----
  const [heldOpen, setHeldOpen] = useState(false)
  const [recallPending, setRecallPending] = useState<{ items: DraftLine[]; meta: Record<string, unknown> } | null>(null)

  const hold = async () => {
    if (lines.length === 0) return
    const label =
      meta.tableLabel ? `Meja ${meta.tableLabel}` : meta.customerName || `Pesanan ${formatTime(new Date())}`
    try {
      await apiFetch('/api/pos/held', {
        method: 'POST',
        body: JSON.stringify({ label, items: lines, meta }),
      })
      void queryClient.invalidateQueries({ queryKey: ['pos-held'] })
      setLines([])
      setMeta(defaultCartMeta)
      setDiscount(null)
      toast.success(`“${label}” ditahan — panggil lagi dari daftar Ditahan`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menahan pesanan')
    }
  }

  const applyRecall = (items: DraftLine[], metaSnapshot: Record<string, unknown>) => {
    setLines(items)
    setMeta({ ...defaultCartMeta, ...(metaSnapshot as Partial<CartMeta>) })
    setDiscount(null)
    setTab('new')
  }

  // ---- charge flow ----
  const [tab, setTab] = useState<'new' | 'active'>('new')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [chargeTarget, setChargeTarget] = useState<
    { mode: 'new'; total: number } | { mode: 'existing'; order: OrderDTO } | null
  >(null)
  const [metaError, setMetaError] = useState<string | null>(null)
  const idempotencyRef = useRef('')

  const startChargeNew = () => {
    if (lines.length === 0) {
      toast.error('Keranjang masih kosong')
      return
    }
    if (meta.type === 'DELIVERY') {
      if (!meta.customerName.trim()) {
        setMetaError('customerName')
        toast.error('Nama penerima wajib diisi untuk pesanan antar')
        return
      }
      if (!meta.deliveryLocation.trim()) {
        setMetaError('deliveryLocation')
        toast.error('Lokasi antar wajib diisi')
        return
      }
      if (settings?.ordering.requirePhoneForDelivery && !meta.customerPhone.trim()) {
        setMetaError('customerPhone')
        toast.error('Nomor HP penerima wajib diisi')
        return
      }
    }
    setMetaError(null)
    idempotencyRef.current = ''
    setChargeTarget({ mode: 'new', total: totals.total })
  }

  const submitCharge = async (payment: PaymentInput): Promise<ChargeResult> => {
    if (chargeTarget?.mode === 'existing') {
      const order = await apiFetch<OrderDTO>(`/api/orders/${chargeTarget.order.id}/payment`, {
        method: 'POST',
        body: JSON.stringify(payment),
      })
      await refetchOpenOrders()
      void queryClient.invalidateQueries({ queryKey: ['pos-cash'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      return {
        order,
        printKot: !!settings?.receipts.autoPrintKot && order.status === 'PAID',
        printReceipt: !!settings?.receipts.autoPrintReceipt,
      }
    }
    if (!idempotencyRef.current) idempotencyRef.current = newId()
    const res = await apiFetch<ChargeResult>('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        items: lines,
        type: meta.type,
        tableLabel: meta.type === 'DINE_IN' && meta.tableLabel ? meta.tableLabel : undefined,
        customerName: meta.customerName || undefined,
        customerPhone: meta.customerPhone || undefined,
        deliveryLocation: meta.type === 'DELIVERY' && meta.deliveryLocation ? meta.deliveryLocation : undefined,
        note: meta.note || undefined,
        discount: discount ?? undefined,
        payment,
        idempotencyKey: idempotencyRef.current,
      }),
    })
    setLines([])
    setMeta(defaultCartMeta)
    setDiscount(null)
    idempotencyRef.current = ''
    await refetchOpenOrders()
    void queryClient.invalidateQueries({ queryKey: ['pos-cash'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    return res
  }

  // ---- QRIS verification ----
  const [verifyTarget, setVerifyTarget] = useState<OrderDTO | null>(null)

  const confirmQris = async () => {
    if (!verifyTarget) return
    try {
      await apiFetch(`/api/orders/${verifyTarget.id}/payment-verify`, {
        method: 'POST',
        body: JSON.stringify({ action: 'CONFIRM' }),
      })
      toast.success(`${verifyTarget.code} terverifikasi — pembayaran diterima`)
      setVerifyTarget(null)
      await refetchOpenOrders()
      void queryClient.invalidateQueries({ queryKey: ['pos-cash'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memverifikasi')
    }
  }

  const rejectQris = async (note: string) => {
    if (!verifyTarget) return
    try {
      await apiFetch(`/api/orders/${verifyTarget.id}/payment-verify`, {
        method: 'POST',
        body: JSON.stringify({ action: 'REJECT', note }),
      })
      toast.success(`QRIS ${verifyTarget.code} ditolak — pesanan kembali belum bayar`)
      setVerifyTarget(null)
      await refetchOpenOrders()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menolak pembayaran')
    }
  }

  // ---- serve / deliver ----
  const transition = async (
    order: OrderDTO,
    status: 'READY' | 'OUT_FOR_DELIVERY' | 'COMPLETED',
    extra?: { reason?: string; courierName?: string },
    successMsg?: string
  ) => {
    try {
      await apiFetch(`/api/orders/${order.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, ...extra }),
      })
      toast.success(successMsg ?? `${order.code} diperbarui`)
      await refetchOpenOrders()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memperbarui status')
    }
  }

  const reprint = async (order: OrderDTO, template: 'KOT' | 'RECEIPT') => {
    if (!settings) return
    try {
      await apiFetch(`/api/orders/${order.id}/reprint`, {
        method: 'POST',
        body: JSON.stringify({ template }),
      })
    } catch {
      /* audit failure never blocks printing */
    }
    if (template === 'KOT') printKot(order, settings.receipts)
    else printReceipt(order, settings.receipts)
    toast.success(`Mencetak ${template === 'KOT' ? 'struk dapur' : 'struk pelanggan'} ${order.code}`)
  }

  const itemCount = lines.reduce((s, l) => s + l.qty, 0)

  const railProps = {
    tab,
    onTabChange: setTab,
    activeCount: openOrders.length,
    cash,
    cashLoading,
    lines,
    meta,
    discount,
    totals,
    settings,
    canDiscount: can('order.discount'),
    metaError,
    resolve,
    onQty: changeQty,
    onRemove: removeLine,
    onEditLine: editLine,
    onUpdateMeta: (patch: Partial<CartMeta>) => {
      setMetaError(null)
      setMeta((m) => ({ ...m, ...patch }))
    },
    onDiscount: setDiscount,
    onCharge: startChargeNew,
    onHold: () => void hold(),
    onOpenHeld: () => setHeldOpen(true),
    heldCount: held?.length ?? 0,
    openOrders,
    openOrdersLoading,
    onPayOrder: (o: OrderDTO) => setChargeTarget({ mode: 'existing', order: o }),
    onVerifyQris: (o: OrderDTO) => setVerifyTarget(o),
    onServe: (o: OrderDTO) =>
      void transition(o, 'COMPLETED', undefined, `${o.code} selesai — sudah diserahkan`),
    onDeliver: (o: OrderDTO, courier: string) =>
      void transition(o, 'OUT_FOR_DELIVERY', { courierName: courier }, `${o.code} diantar oleh ${courier}`),
    onArrive: (o: OrderDTO) => void transition(o, 'COMPLETED', undefined, `${o.code} tiba di tujuan`),
    onReprint: (o: OrderDTO, t: 'KOT' | 'RECEIPT') => void reprint(o, t),
  }

  return (
    <div className="relative flex flex-col bg-cream/40 dark:bg-background md:h-[calc(100dvh-3.5rem)] md:flex-row md:overflow-hidden">
      {/* Left: products */}
      <div className="min-w-0 flex-1 md:overflow-hidden">
        <ProductPanel
          menu={menu}
          loading={menuLoading}
          error={!!menuError}
          onRetry={() => void refetchMenu()}
          onPick={pickProduct}
        />
      </div>

      {/* Right: persistent cart rail */}
      <aside className="hidden md:flex md:w-[370px] md:flex-col md:border-l md:bg-card xl:w-[410px]" aria-label="Panel keranjang kasir">
        <CartRail {...railProps} />
      </aside>

      {/* Mobile floating summary bar */}
      <div className="fixed inset-x-3 bottom-[calc(68px+env(safe-area-inset-bottom))] z-20 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex min-h-[52px] w-full items-center gap-3 rounded-xl bg-espresso px-4 text-cream shadow-lg transition-transform active:scale-[0.98]"
          aria-label="Buka keranjang"
        >
          <ShoppingBag className="h-5 w-5 text-caramel-light" aria-hidden />
          <span className="flex-1 text-left text-sm font-semibold">
            {itemCount > 0 ? `${itemCount} item · ${formatIDR(totals.total)}` : 'Keranjang kosong'}
          </span>
          <span className="flex items-center gap-0.5 text-xs font-semibold text-caramel-light">
            Keranjang <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        </button>
      </div>

      {/* Mobile cart sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md">
          <SheetTitle className="sr-only">Keranjang kasir</SheetTitle>
          <CartRail {...railProps} />
        </SheetContent>
      </Sheet>

      {/* Variant sheet */}
      <VariantSheet
        product={variantProduct}
        open={variantOpen}
        onOpenChange={(open) => {
          setVariantOpen(open)
          if (!open) setVariantEdit(null)
        }}
        onAdd={(line) => {
          addLine(line)
          toast.success(`${line.productName} masuk keranjang`)
        }}
        editing={variantEdit}
        onEdit={(index, line) => {
          setLines((prev) => prev.map((l, i) => (i === index ? line : l)))
          setVariantOpen(false)
          setVariantEdit(null)
          toast.success('Item diperbarui')
        }}
      />

      {/* Held orders */}
      <HeldSheet
        open={heldOpen}
        onOpenChange={setHeldOpen}
        onRecall={(items, metaSnapshot) => {
          if (lines.length > 0) {
            setRecallPending({ items, meta: metaSnapshot })
            return
          }
          applyRecall(items, metaSnapshot)
        }}
      />

      {/* Recall-overwrites-cart confirm */}
      <Dialog open={recallPending !== null} onOpenChange={(open) => !open && setRecallPending(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ganti isi keranjang?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Keranjang sekarang berisi {itemCount} item. Memanggil pesanan ditahan akan menggantinya —
            tahan dulu keranjang sekarang kalau masih dipakai.
          </p>
          <DialogFooter className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="min-h-[44px]" onClick={() => setRecallPending(null)}>
              Batal
            </Button>
            <Button
              className="min-h-[44px] bg-espresso text-cream hover:bg-espresso-soft"
              onClick={() => {
                if (recallPending) applyRecall(recallPending.items, recallPending.meta)
                setRecallPending(null)
              }}
            >
              Ganti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Charge */}
      {settings && (
        <ChargeDialog
          open={chargeTarget !== null}
          onOpenChange={(open) => !open && setChargeTarget(null)}
          total={chargeTarget?.mode === 'existing' ? chargeTarget.order.total : totals.total}
          settings={settings}
          title={chargeTarget?.mode === 'existing' ? `Terima Bayar ${chargeTarget.order.code}` : 'Terima Pembayaran'}
          subtitle={chargeTarget?.mode === 'existing' ? chargeTarget.order.customerName ?? undefined : undefined}
          onSubmit={submitCharge}
        />
      )}

      {/* QRIS verify */}
      <QrisVerifyDialog
        open={verifyTarget !== null}
        onOpenChange={(open) => !open && setVerifyTarget(null)}
        orderCode={verifyTarget?.code ?? ''}
        amount={verifyTarget?.total ?? 0}
        buyerRef={verifyTarget?.payments.find((p) => p.status === 'PENDING_VERIFICATION')?.qrReference ?? null}
        reminderText={
          settings?.payments.qrisReminderText ??
          'Periksa mutasi di aplikasi merchant sebelum konfirmasi — bukti tangkapan layar bisa dipalsukan.'
        }
        onConfirm={confirmQris}
        onReject={rejectQris}
      />

      {/* Flying add feedback */}
      <AnimatePresence>
        {fly && (
          <motion.span
            key={fly.id}
            aria-hidden
            initial={{ x: fly.x - 20, y: fly.y - 20, scale: 1, opacity: 0.85 }}
            animate={{ x: (typeof window !== 'undefined' ? window.innerWidth : 400) - 70, y: (typeof window !== 'undefined' ? window.innerHeight : 700) - 120, scale: 0.2, opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeIn' }}
            onAnimationComplete={() => setFly(null)}
            className="pointer-events-none fixed left-0 top-0 z-50 h-10 w-10 rounded-full bg-caramel shadow-md"
          />
        )}
      </AnimatePresence>
    </div>
  )
}
