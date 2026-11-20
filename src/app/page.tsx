'use client'

// `/` — Storefront & digital menu (SPEC §3.1). Fully localized
// (id / jv-Krama Alus / en).
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, Clock, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/client'
import type { ProductDTO, PublicSettingsDTO, RealtimeEvents } from '@/lib/types'
import { useI18n, summarizeHoursLocalized } from '@/lib/i18n'
import { useRealtime } from '@/hooks/use-realtime'
import { cartCount, cartSubtotal, useCartStore } from '@/stores/cart'
import { SiteHeader } from '@/components/public/site-header'
import { SiteFooter } from '@/components/public/site-footer'
import { MenuSection } from '@/components/public/menu-section'
import { ProductSheet, type AddToCartPayload } from '@/components/public/product-sheet'
import { CartSheet } from '@/components/public/cart-sheet'
import { CartBar } from '@/components/public/cart-bar'
import { ConnectionBanner } from '@/components/public/connection-banner'
import { useOpenStatus } from '@/components/public/open-status'
import { applyAvailability, fetchMenuWithCache } from '@/components/public/menu-data'
import type { MenuQueryData } from '@/components/public/types'
import { scrollToId, waLink } from '@/components/public/utils'
import { ProductImage } from '@/components/public/product-image'

const DEFAULT_HOURS = [
  { open: '07:00', close: '14:00', closed: true },
  { open: '07:00', close: '14:00', closed: false },
  { open: '07:00', close: '14:00', closed: false },
  { open: '07:00', close: '14:00', closed: false },
  { open: '07:00', close: '14:00', closed: false },
  { open: '07:00', close: '14:00', closed: false },
  { open: '07:00', close: '14:00', closed: true },
]

const DEFAULT_ADDRESS = 'SMKN 1 Boyolangu, Tulungagung'

/** Shorten the settings address for the hero chip — first two comma segments,
 *  capped at ~48 chars with an ellipsis so the pill never wraps. */
function shortAddress(address: string): string {
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const short = parts.slice(0, 2).join(', ') || address.trim()
  return short.length > 48 ? `${short.slice(0, 48).trimEnd()}…` : short
}

export default function StorefrontPage() {
  const { lang, t } = useI18n()
  const queryClient = useQueryClient()

  const settingsQuery = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => apiFetch<PublicSettingsDTO>('/api/public/settings'),
    staleTime: 5 * 60_000,
  })
  const menuQuery = useQuery({
    queryKey: ['public-menu'],
    queryFn: fetchMenuWithCache,
    staleTime: 60_000,
  })

  // Rehydrate the persisted cart after mount (SSR-safe)
  useEffect(() => {
    void useCartStore.persist.rehydrate()
  }, [])

  // Live updates: sold-out flips + day-close settings refetch
  useRealtime(['menu:availability', 'day:closed'], (event, payload) => {
    if (event === 'menu:availability') {
      const { productId, isAvailable } = payload as RealtimeEvents['menu:availability']
      queryClient.setQueryData<MenuQueryData>(['public-menu'], (old) =>
        old ? { ...old, menu: applyAvailability(old.menu, productId, isAvailable) } : old
      )
    } else {
      void queryClient.invalidateQueries({ queryKey: ['public-settings'] })
    }
  })

  const settings = settingsQuery.data
  const menu = menuQuery.data?.menu
  const { status: openStatus, changed: openChanged } = useOpenStatus(settings?.hours)

  const allProducts = useMemo<ProductDTO[]>(
    () => (menu?.categories ?? []).flatMap((c) => c.products),
    [menu]
  )
  const firstAvailable = useMemo(
    () => allProducts.find((p) => p.isAvailable) ?? null,
    [allProducts]
  )

  // Product sheet
  const [productOpen, setProductOpen] = useState(false)
  const [activeProduct, setActiveProduct] = useState<ProductDTO | null>(null)
  const openProduct = (p: ProductDTO) => {
    setActiveProduct(p)
    setProductOpen(true)
  }

  // Cart sheet
  const [cartOpen, setCartOpen] = useState(false)
  const lines = useCartStore((s) => s.lines)
  const serviceType = useCartStore((s) => s.serviceType)
  const count = cartCount(lines)
  const subtotal = cartSubtotal(lines)
  const cartTotal = subtotal + (serviceType === 'DELIVERY' ? (settings?.ordering.deliveryFee ?? 1000) : 0)

  // ADD flow: the sheet stays open with a "masuk keranjang" confirmation so a
  // customer can add more variants of the same item (e.g. 2 Large + 1 Small).
  const addLine = (payload: AddToCartPayload) => {
    useCartStore.getState().addLine(payload)
  }

  const viewCartFromSheet = () => {
    setProductOpen(false)
    setCartOpen(true)
  }

  const browseMenu = () => {
    setCartOpen(false)
    scrollToId('menu')
  }

  // "Pesan Sekarang": scroll to the menu, then focus the first available product
  const orderNow = () => {
    scrollToId('menu')
    if (firstAvailable) {
      window.setTimeout(() => openProduct(firstAvailable), 450)
    }
  }

  const hoursSummary = settings
    ? summarizeHoursLocalized(lang, settings.hours.days)
    : summarizeHoursLocalized(lang, DEFAULT_HOURS)
  const wa = settings?.profile.phone ? waLink(settings.profile.phone) : null
  const closed = openStatus ? !openStatus.open : false
  const strictClosed = closed && (settings?.hours.enforcement ?? 'STRICT') === 'STRICT'

  return (
    <div className="flex min-h-screen flex-col bg-cream text-foreground">
      <SiteHeader settings={settings} openStatus={openStatus} openChanged={openChanged} />
      <ConnectionBanner />

      {/* Outside-hours banners — browsing stays allowed, checkout gated in cart */}
      {strictClosed && settings && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-danger/10 px-4 py-2 text-center text-xs font-medium text-danger"
        >
          <span>{t('storefront.closedStrict', { hours: hoursSummary })}</span>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              {t('storefront.contactUs')}
            </a>
          )}
        </div>
      )}
      {closed && !strictClosed && settings && (
        <div
          role="status"
          className="bg-warning/10 px-4 py-2 text-center text-xs font-medium text-warning"
        >
          {t('storefront.closedLoose', { hours: hoursSummary })}
        </div>
      )}

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-12 pt-10 text-center md:pt-16" aria-label={t('common.menu')}>
          <img
            src={settings?.profile.logoUrl || '/logo.png'}
            alt=""
            aria-hidden="true"
            className="mx-auto h-16 w-auto object-contain md:h-20"
          />
          <h1 className="mx-auto mt-5 max-w-2xl font-display text-2xl italic leading-snug text-foreground md:text-4xl">
            {settings?.profile.tagline || 'Ngopi sekelas, rasa juara.'}
          </h1>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex h-9 items-center gap-2 rounded-full bg-cream-deep px-4 text-xs font-medium text-foreground dark:bg-espresso-soft/40">
              <Clock className="size-3.5 text-caramel" />
              {hoursSummary} WIB
            </span>
            {settings && (
              <a
                href="https://www.google.com/maps/place/SMKN+1+Boyolangu+Tulungagung/@-8.081564,111.8983067,17z"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 max-w-full items-center gap-2 rounded-full bg-cream-deep px-4 text-xs font-medium text-foreground transition-colors hover:text-caramel dark:bg-espresso-soft/40"
              >
                <MapPin className="size-3.5 shrink-0 text-caramel" />
                <span className="truncate">
                  {settings.profile.address ? shortAddress(settings.profile.address) : DEFAULT_ADDRESS}
                </span>
              </a>
            )}
          </div>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={orderNow}
              className="h-12 min-w-44 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {t('common.orderNow')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => scrollToId('menu')}
              className="h-12 min-w-44 rounded-full border-border bg-background/60 px-8 text-base font-medium hover:bg-cream-deep dark:hover:bg-espresso-soft/30"
            >
              {t('common.viewMenu')} <ArrowDown className="size-4" />
            </Button>
          </div>
        </section>

        {/* About (only when a hero image is configured) */}
        {settings?.profile.heroImageUrl && (
          <section className="mx-auto w-full max-w-6xl px-4 pb-12" aria-label={settings.profile.name || 'Sekelas Cafe'}>
            <div className="overflow-hidden rounded-2xl bg-espresso-deep">
              <div className="grid md:grid-cols-2">
                <ProductImage
                  src={settings.profile.heroImageUrl}
                  name={settings.profile.name || 'Sekelas Cafe'}
                  alt={settings.profile.name || 'Sekelas Cafe'}
                  className="h-56 w-full object-cover md:h-80"
                />
                <div className="flex flex-col justify-center gap-3 p-6 text-[#F0E7DA] md:p-10">
                  <h2 className="font-display text-xl text-[#FBF7F0] md:text-2xl">
                    {settings.profile.name || 'Sekelas Cafe'}
                  </h2>
                  <p className="text-sm italic leading-relaxed text-[#F0E7DA]/70">
                    {settings.profile.tagline}
                  </p>
                  <p className="text-xs leading-relaxed text-[#F0E7DA]/50">
                    SMKN 1 Boyolangu · {hoursSummary} WIB
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Menu */}
        <MenuSection
          data={menu}
          isLoading={menuQuery.isLoading}
          isError={menuQuery.isError}
          stale={Boolean(menuQuery.data?.stale)}
          savedAt={menuQuery.data?.savedAt}
          onRetry={() => void menuQuery.refetch()}
          onOpenProduct={openProduct}
          waHref={wa}
        />

        <div className="h-10" aria-hidden="true" />
      </main>

      <SiteFooter settings={settings} extraBottom={count > 0} />

      <CartBar count={count} total={cartTotal} onOpen={() => setCartOpen(true)} />
      <ProductSheet
        product={activeProduct}
        open={productOpen}
        onOpenChange={setProductOpen}
        onAdd={addLine}
        onViewCart={viewCartFromSheet}
      />
      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        settings={settings}
        settingsLoading={settingsQuery.isLoading}
        menu={menu}
        openStatus={openStatus}
        onBrowse={browseMenu}
      />
    </div>
  )
}
