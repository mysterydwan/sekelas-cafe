'use client'

// Digital menu: sticky search (debounced 200ms, `/` shortcut) + category chips,
// responsive product grid, sold-out badges, skeletons, stale-cache fallback UI.
// Fully localized (id / jv-Krama Alus / en).
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { MessageCircle, RefreshCw, Search, SearchX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ProductImage } from './product-image'
import { formatIDR } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import type { MenuDTO, ProductDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { hasPricedVariants } from './utils'

interface FlatProduct extends ProductDTO {
  categoryId: string
  categoryName: string
}

export function MenuSection({
  data,
  isLoading,
  isError,
  stale,
  savedAt,
  onRetry,
  onOpenProduct,
  waHref,
}: {
  data?: MenuDTO
  isLoading: boolean
  isError: boolean
  stale: boolean
  savedAt?: number
  onRetry: () => void
  onOpenProduct: (p: ProductDTO) => void
  /** wa.me link from public settings — powers the empty-menu CTA. */
  waHref?: string | null
}) {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [activeCat, setActiveCat] = useState('all')
  const searchRef = useRef<HTMLInputElement>(null)

  // Debounce 200ms
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 200)
    return () => clearTimeout(t)
  }, [search])

  // Skeleton anti-flash (SPEC §1.5): skeletons only render after a 200ms
  // delay — fast loads (cache/network) go straight to the real grid.
  const [showSkeleton, setShowSkeleton] = useState(false)
  useEffect(() => {
    if (!isLoading) {
      setShowSkeleton(false)
      return
    }
    const timer = setTimeout(() => setShowSkeleton(true), 200)
    return () => clearTimeout(timer)
  }, [isLoading])

  // "/" focuses search (SPEC §1.5)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const products = useMemo<FlatProduct[]>(
    () =>
      (data?.categories ?? []).flatMap((c) =>
        c.products.map((p) => ({ ...p, categoryId: c.id, categoryName: c.name }))
      ),
    [data]
  )

  const filtered = useMemo(() => {
    let list = products
    if (activeCat !== 'all') list = list.filter((p) => p.categoryId === activeCat)
    if (debounced) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(debounced) || p.categoryName.toLowerCase().includes(debounced)
      )
    }
    return list
  }, [products, activeCat, debounced])

  const hasMenu = (data?.categories ?? []).some((c) => c.products.length > 0)
  const clearFilters = () => {
    setSearch('')
    setActiveCat('all')
  }

  const formatRelative = (timestamp: number): string => {
    const mins = Math.max(1, Math.round((Date.now() - timestamp) / 60000))
    if (mins < 60) return t('menu.minutesAgo', { n: mins })
    return t('menu.hoursAgo', { n: Math.round(mins / 60) })
  }

  return (
    <section id="menu" aria-label={t('common.menu')} className="scroll-mt-24">
      {/* Sticky search + category chips */}
      <div className="sticky top-[100px] z-30 border-b border-border/60 bg-cream/95 px-4 py-3 backdrop-blur-md min-[420px]:top-16 sm:top-16">
        <div className="mx-auto w-full max-w-6xl">
          <div className="relative mx-auto max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('menu.searchPlaceholder')}
              aria-label={t('menu.searchLabel')}
              className="h-11 rounded-full border-border bg-background pl-11 pr-11"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={t('menu.clearSearch')}
                className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <nav
            aria-label={t('menu.categories')}
            className="scrollbar-warm -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1"
          >
            <CategoryChip active={activeCat === 'all'} onClick={() => setActiveCat('all')}>
              {t('menu.all')}
            </CategoryChip>
            {(data?.categories ?? [])
              .filter((c) => c.products.length > 0)
              .map((c) => (
                <CategoryChip
                  key={c.id}
                  active={activeCat === c.id}
                  onClick={() => setActiveCat(c.id)}
                >
                  {c.name}
                </CategoryChip>
              ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pt-6">
        {/* Stale cache notice (API down, localStorage menu served) */}
        {stale && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
            <p className="text-sm text-warning">
              {t('menu.staleBanner', {
                saved: savedAt ? t('menu.savedAt', { ago: formatRelative(savedAt) }) : '',
              })}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="h-9 gap-2 rounded-full border-warning/50 text-warning hover:bg-warning/10"
            >
              <RefreshCw className="size-3.5" /> {t('menu.reload')}
            </Button>
          </div>
        )}

        {/* Error without cache */}
        {isError && !data && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <SearchX className="size-10 text-muted-foreground/50" />
            <div>
              <p className="font-medium">{t('menu.errorTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('menu.errorHint')}</p>
            </div>
            <Button
              type="button"
              onClick={onRetry}
              className="h-11 rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90"
            >
              <RefreshCw className="size-4" /> {t('common.retry')}
            </Button>
          </div>
        )}

        {/* Skeleton grid — delayed 200ms so fast loads never flash */}
        {isLoading && showSkeleton && (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="space-y-2.5">
                <Skeleton className="aspect-square w-full rounded-xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-4 w-2/5" />
              </li>
            ))}
          </ul>
        )}

        {/* Loaded states */}
        {!isLoading && !isError && data && (
          <>
            {!hasMenu && (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <p className="font-display text-xl">{t('menu.emptyTitle')}</p>
                <p className="text-sm text-muted-foreground">{t('menu.emptyHint')}</p>
                {waHref && (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full bg-success px-6 text-sm font-semibold text-white transition-colors hover:bg-success/90"
                  >
                    <MessageCircle className="size-4" aria-hidden />
                    {t('menu.contactWa')}
                  </a>
                )}
              </div>
            )}

            {hasMenu && filtered.length === 0 && (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <SearchX className="size-10 text-muted-foreground/50" />
                <div>
                  <p className="font-medium">{t('menu.noResultsTitle')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('menu.noResultsHint', { query: search })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearFilters}
                  className="h-11 rounded-full px-6"
                >
                  <X className="size-4" /> {t('menu.clearFilters')}
                </Button>
              </div>
            )}

            {filtered.length > 0 && (
              <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((p) => (
                  <motion.li
                    key={p.id}
                    layout="position"
                    whileHover={{ y: -3 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenProduct(p)}
                      className="group block w-full text-left"
                      aria-label={t('menu.viewProduct', {
                        name: p.name,
                        suffix: p.isAvailable ? '' : t('menu.soldOutSuffix'),
                      })}
                    >
                      <div className="relative overflow-hidden rounded-xl bg-cream-deep">
                        <ProductImage
                          src={p.imageUrl}
                          name={p.name}
                          className={cn(
                            'aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105',
                            !p.isAvailable && 'grayscale'
                          )}
                        />
                        {!p.isAvailable && (
                          <Badge className="absolute left-2 top-2 border-transparent bg-danger text-white">
                            {t('menu.soldOut')}
                          </Badge>
                        )}
                      </div>
                      <div className="pt-2.5">
                        <p className="line-clamp-1 text-sm font-medium text-foreground">{p.name}</p>
                        <p className="mt-0.5 line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">
                          {p.description ?? '—'}
                        </p>
                        <p className="mt-1.5 text-sm">
                          {hasPricedVariants(p) && (
                            <span className="mr-1 text-xs text-muted-foreground">{t('menu.from')}</span>
                          )}
                          <span className="font-mono font-semibold tabular-nums text-foreground">
                            {formatIDR(p.basePrice)}
                          </span>
                        </p>
                      </div>
                    </button>
                  </motion.li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors',
        active
          ? 'border-transparent bg-espresso-deep text-[#FBF7F0]'
          : 'border-border bg-background text-foreground hover:border-espresso/40 dark:hover:border-caramel/40'
      )}
    >
      {children}
    </button>
  )
}
