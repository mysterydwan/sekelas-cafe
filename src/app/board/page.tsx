'use client'

// `/board` — order board (SPEC §3.3): full-bleed ALWAYS-dark counter display,
// trilingual (id / en / jv via useI18n). Live clock + localized date, a
// warming queue rail (SEDANG DISIAPKAN) with elapsed timers and age-tinted
// left accents, a gold hero zone (SIAP DIAMBIL) with huge container-query
// scaled codes + waiting timers, ready chime + flash, completed codes
// fading after 5 minutes, per-device sound toggle, fullscreen, offline dot —
// zero staff interaction required.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BellRing,
  Bike,
  ChefHat,
  CircleCheck,
  Clock,
  Coffee,
  Maximize,
  Minimize,
  ShoppingBag,
  UtensilsCrossed,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { apiFetch } from '@/lib/client'
import type { OrderType } from '@/lib/types'
import { useRealtime, useRealtimeStatus } from '@/hooks/use-realtime'
import { isSoundEnabled, playChime, setSoundEnabled } from '@/hooks/use-sound'
import { formatDateLongLocalized, useI18n } from '@/lib/i18n'
import type { BoardDTO } from '@/components/public/types'
import { cn } from '@/lib/utils'

const COMPLETED_TTL_MS = 5 * 60 * 1000

// Digits are language-neutral — one formatter serves all three locales.
const clockFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Jakarta',
})

// Queue age tiers — the rail's left accent warms as an order waits longer.
type WaitTier = 'fresh' | 'warm' | 'hot'

function waitTier(elapsedMin: number): WaitTier {
  if (elapsedMin >= 10) return 'hot'
  if (elapsedMin >= 5) return 'warm'
  return 'fresh'
}

const RAIL_ACCENT: Record<WaitTier, string> = {
  fresh: 'border-l-white/10',
  warm: 'border-l-[#B26A00]/40',
  hot: 'border-l-[#B03A2E]/60',
}

const CHIP_TONE: Record<WaitTier, string> = {
  fresh: 'text-white/80',
  warm: 'text-[#E7C078]',
  hot: 'text-[#F0A9A0]',
}

/** Whole minutes since an ISO timestamp, clamped at zero (clock-skew safe). */
function minutesSince(iso: string, now: Date | null): number {
  if (!now) return 0
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000))
}

/** "274 mnt" stays compact; long waits read as "4j 34m" (id) / "4h 34m" (en). */
function elapsedLabel(t: (k: 'board.elapsedMin' | 'board.elapsedHourMin', v?: Record<string, string | number>) => string, mins: number): string {
  if (mins < 60) return t('board.elapsedMin', { n: mins })
  return t('board.elapsedHourMin', { h: Math.floor(mins / 60), m: mins % 60 })
}

function TypeBadge({
  type,
  label,
  tone,
}: {
  type: OrderType
  label: string
  tone: 'gold' | 'neutral'
}) {
  const Icon = type === 'DINE_IN' ? UtensilsCrossed : type === 'TAKE_AWAY' ? ShoppingBag : Bike
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] md:text-[11px]',
        tone === 'gold'
          ? 'bg-[#D9A441] text-[#241610] shadow-[0_6px_20px_-8px_rgba(217,164,65,0.6)]'
          : 'border border-white/10 bg-white/[0.06] text-white/65'
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  )
}

export default function BoardPage() {
  const { lang, t } = useI18n()
  const [now, setNow] = useState<Date | null>(null)
  const [sound, setSound] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [flash, setFlash] = useState(false)

  // Live clock — ticks every second; elapsed/waiting timers share `now`.
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  // Per-device sound preference
  useEffect(() => {
    Promise.resolve().then(() => setSound(isSoundEnabled()))
  }, [])

  // Fullscreen state sync
  useEffect(() => {
    const handler = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const query = useQuery({
    queryKey: ['public-board'],
    queryFn: () => apiFetch<BoardDTO>('/api/public/board'),
    refetchInterval: 15_000, // WS-driven + polling fallback
    placeholderData: (prev) => prev, // never blank on refetch errors
  })

  useRealtime(['order:status', 'order:created'], () => {
    void query.refetch()
  })

  const status = useRealtimeStatus()

  // New ready code -> chime + visual flash (never sound-only)
  const prevReadyRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    const ready = query.data?.ready
    if (!ready) return
    const current = new Set(ready.map((r) => r.code))
    const prev = prevReadyRef.current
    prevReadyRef.current = current
    if (prev === null) return // first load: no chime
    const added = [...current].filter((c) => !prev.has(c))
    if (added.length === 0) return
    const t0 = setTimeout(() => {
      playChime('ready')
      setFlash(true)
    }, 0)
    const t1 = setTimeout(() => setFlash(false), 1900)
    return () => {
      clearTimeout(t0)
      clearTimeout(t1)
    }
  }, [query.data])

  // Completed codes: client-side 5-minute fade window
  const completed = useMemo(() => {
    if (!query.data || !now) return []
    const cutoff = now.getTime() - COMPLETED_TTL_MS
    return query.data.recentCompleted.filter((r) => new Date(r.completedAt).getTime() >= cutoff)
  }, [query.data, now])

  const preparing = query.data?.preparing ?? []
  const ready = query.data?.ready ?? []
  const idle =
    !query.isLoading && preparing.length === 0 && ready.length === 0 && completed.length === 0

  const toggleSound = () => {
    const next = !sound
    setSound(next)
    setSoundEnabled(next)
    if (next) playChime('ready') // audible confirmation
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        /* denied — board works fine windowed */
      })
    }
  }

  const clock = now ? clockFormatter.format(now) : '--.--.--'
  const dateLine = now ? formatDateLongLocalized(lang, now) : '\u00A0'

  const badgeLabel = (type: OrderType, tableLabel: string | null): string => {
    if (type === 'DINE_IN') {
      // Seed/POS data may store "Meja 2" — strip a redundant leading "Meja"/"Table"
      // so the badge reads "MEJA 2", never "MEJA Meja 2".
      const cleaned = tableLabel?.replace(/^\s*(meja|table)\s+/i, '').trim()
      return cleaned ? t('board.tableBadge', { label: cleaned }) : t('board.tableOnly')
    }
    if (type === 'TAKE_AWAY') return t('board.takeAwayBadge')
    return t('board.deliveryBadge')
  }

  return (
    <div
      className="board-kiosk flex min-h-screen select-none flex-col bg-[#171210] text-[#F0E7DA] lg:h-dvh lg:min-h-0 lg:overflow-hidden"
      style={{
        backgroundImage:
          'radial-gradient(56rem 30rem at 50% -8%, rgba(217,164,65,0.10) 0%, transparent 65%),' +
          'radial-gradient(44rem 26rem at 92% 108%, rgba(198,139,51,0.06) 0%, transparent 70%)',
      }}
    >
      {/* Header: identity + live clock + controls */}
      <header className="shrink-0 border-b border-white/10 px-5 py-5 sm:px-6 md:px-10 md:py-6">
        <div className="flex flex-col items-center gap-5 md:flex-row md:gap-6">
          <div className="flex min-w-0 items-center gap-3.5 md:flex-1 md:justify-start md:gap-4">
            <img
              src="/logo.png"
              alt="Logo Sekelas Cafe"
              className="h-12 w-auto shrink-0 object-contain md:h-14"
            />
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold tracking-[0.08em] md:text-xl">
                SEKELAS CAFE
              </p>
              <p className="mt-0.5 truncate text-[11px] tracking-wide text-white/55 md:text-xs">
                {t('board.subtitle')}
              </p>
            </div>
          </div>

          {/* Giant clock — truly centered on counter screens */}
          <div className="order-first flex flex-col items-center md:order-none" aria-live="off">
            <p
              role="timer"
              aria-label={t('board.clockLabel', { time: clock })}
              className="font-mono text-[clamp(2.25rem,7vw,5rem)] font-bold leading-none tracking-tight tabular-nums text-[#D9A441] [text-shadow:0_0_38px_rgba(217,164,65,0.3)]"
            >
              {clock}
            </p>
            <p className="mt-2 text-xs text-white/60 sm:text-sm md:text-base">{dateLine}</p>
          </div>

          <div className="flex items-center gap-2.5 md:flex-1 md:justify-end">
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={sound}
              aria-label={sound ? t('board.soundOff') : t('board.soundOn')}
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9A441]',
                sound
                  ? 'border-[#D9A441]/40 bg-[#D9A441]/10 text-[#D9A441]'
                  : 'border-white/15 text-white/55 hover:border-white/30 hover:bg-white/10 hover:text-white'
              )}
            >
              {sound ? (
                <Volume2 className="size-5" aria-hidden="true" />
              ) : (
                <VolumeX className="size-5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? t('board.exitFullscreen') : t('board.fullscreen')}
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/55 transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9A441]"
            >
              {fullscreen ? (
                <Minimize className="size-5" aria-hidden="true" />
              ) : (
                <Maximize className="size-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Zones: SIAP DIAMBIL dominant (top on mobile, wide gold zone on desktop) */}
      <main
        aria-busy={query.isLoading}
        className="flex flex-1 flex-col-reverse justify-end gap-5 p-4 sm:p-5 md:p-6 lg:grid lg:min-h-0 lg:grid-cols-[minmax(300px,2fr)_3fr] lg:grid-rows-[minmax(0,1fr)] lg:justify-start lg:gap-6 lg:p-8 xl:gap-8 xl:p-10"
      >
        {/* Queue rail — left accent warms with age at a glance */}
        <section aria-labelledby="board-preparing-h" className="flex min-h-0 flex-col lg:min-w-0">
          <div className="flex items-center gap-3">
            <h2
              id="board-preparing-h"
              className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.28em] text-white/45 md:text-xs"
            >
              <ChefHat className="size-4 shrink-0 text-[#D9A441]/70" aria-hidden="true" />
              {t('board.preparing')}
              <span aria-hidden="true" className="text-white/25">
                ·
              </span>
              <span className="font-mono text-sm font-bold tracking-normal tabular-nums text-[#D9A441]">
                {preparing.length}
              </span>
            </h2>
            <span
              aria-hidden="true"
              className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent"
            />
          </div>

          <div className="scrollbar-warm mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-1.5 [scrollbar-gutter:stable]">
            {query.isLoading ? (
              <>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    aria-hidden="true"
                    className="h-28 animate-pulse rounded-2xl border border-white/5 bg-white/5"
                  />
                ))}
              </>
            ) : preparing.length === 0 ? (
              !idle && (
                <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
                  <span className="flex size-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <Coffee className="size-6 text-white/35" aria-hidden="true" />
                  </span>
                  <p className="text-sm text-white/40">{t('board.queueEmpty')}</p>
                </div>
              )
            ) : (
              <AnimatePresence initial={false}>
                {preparing.map((e) => {
                  const elapsed = minutesSince(e.createdAt, now)
                  const tier = waitTier(elapsed)
                  return (
                    <motion.article
                      key={e.code}
                      layout
                      initial={{ opacity: 0, x: -18 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 18 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                      className={cn(
                        'flex min-h-[6.5rem] grow flex-col justify-center rounded-2xl border border-white/10 border-l-4 bg-white/5 p-4 md:p-5',
                        RAIL_ACCENT[tier]
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                        <p className="font-mono text-3xl font-bold tabular-nums md:text-4xl">
                          {e.code}
                        </p>
                        <TypeBadge
                          type={e.type}
                          label={badgeLabel(e.type, e.tableLabel)}
                          tone="neutral"
                        />
                        <span
                          aria-label={t('board.waitingMin', { n: elapsed })}
                          className={cn(
                            'ml-auto inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3.5 py-1.5 font-mono text-base font-semibold tabular-nums md:text-lg',
                            CHIP_TONE[tier]
                          )}
                        >
                          <Clock className="size-4 md:size-[18px]" aria-hidden="true" />
                          {elapsedLabel(t, elapsed)}
                        </span>
                      </div>
                    </motion.article>
                  )
                })}
              </AnimatePresence>
            )}
          </div>
        </section>

        {/* Hero zone — SIAP DIAMBIL, gold-dominant, readable at 3 meters */}
        <section aria-labelledby="board-ready-h" className="flex min-h-0 flex-col lg:min-w-0">
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col rounded-3xl border-2 p-4 transition-colors sm:p-5 md:p-6 xl:p-7',
              flash
                ? 'animate-pulse border-[#D9A441] bg-[#D9A441]/[0.12]'
                : 'border-[#D9A441]/25 bg-[#D9A441]/[0.06]'
            )}
          >
            <div className="flex items-center gap-3">
              <h2
                id="board-ready-h"
                className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.28em] text-[#D9A441] md:text-xs"
              >
                <BellRing className="size-4 shrink-0" aria-hidden="true" />
                {t('board.ready')}
                <span aria-hidden="true" className="text-[#D9A441]/40">
                  ·
                </span>
                <span className="font-mono text-sm font-bold tracking-normal tabular-nums">
                  {ready.length}
                </span>
              </h2>
              <span
                aria-hidden="true"
                className="h-px flex-1 bg-gradient-to-r from-[#D9A441]/20 to-transparent"
              />
            </div>

            <div
              className={cn(
                'scrollbar-warm mt-4 grid min-h-0 flex-1 auto-rows-fr gap-4 overflow-y-auto overscroll-contain pr-1.5 [scrollbar-gutter:stable] md:gap-5',
                ready.length === 1 ? 'md:grid-cols-1' : 'md:grid-cols-2'
              )}
            >
              {query.isLoading ? (
                <>
                  <div
                    aria-hidden="true"
                    className="h-56 animate-pulse rounded-2xl border border-[#D9A441]/10 bg-black/20 md:h-64"
                  />
                  <div
                    aria-hidden="true"
                    className="hidden h-64 animate-pulse rounded-2xl border border-[#D9A441]/10 bg-black/20 md:block"
                  />
                </>
              ) : ready.length === 0 ? (
                !idle && (
                  <div className="col-span-full flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[#D9A441]/20 px-6 py-14 text-center">
                    <span className="flex size-14 items-center justify-center rounded-full border border-[#D9A441]/25 bg-[#D9A441]/[0.07]">
                      <BellRing className="size-6 text-[#D9A441]/50" aria-hidden="true" />
                    </span>
                    <p className="text-sm text-white/35">{t('board.noneReady')}</p>
                  </div>
                )
              ) : (
                <AnimatePresence initial={false}>
                  {ready.map((e) => {
                    const waiting = minutesSince(e.readyAt, now)
                    return (
                      <motion.article
                        key={e.code}
                        layout
                        initial={{ opacity: 0, scale: 0.85, y: 14 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: -10 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                        className="@container flex flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-[#241610]/80 px-3 py-9 shadow-[0_14px_50px_-16px_rgba(217,164,65,0.3)] sm:gap-5 sm:py-11"
                      >
                        {/* Huge caramel mono type — cqw scales with the card itself */}
                        <p className="font-mono text-[clamp(3.25rem,18cqw,7.5rem)] font-bold leading-none tracking-tight tabular-nums text-[#D9A441] [text-shadow:0_0_44px_rgba(217,164,65,0.35)]">
                          {e.code}
                        </p>
                        <TypeBadge
                          type={e.type}
                          label={badgeLabel(e.type, e.tableLabel)}
                          tone="gold"
                        />
                        <span
                          aria-label={t('board.waitingMin', { n: waiting })}
                          className="inline-flex items-center gap-2 font-mono text-base font-semibold tabular-nums text-white/80 md:text-lg"
                        >
                          <Clock className="size-[18px] text-[#D9A441]/80" aria-hidden="true" />
                          {elapsedLabel(t, waiting)}
                        </span>
                      </motion.article>
                    )
                  })}
                </AnimatePresence>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Recently completed — dimmed, fades out after 5 minutes */}
      {completed.length > 0 && (
        <footer
          className="shrink-0 border-t border-white/10 px-5 py-3.5 sm:px-6 md:px-10"
          aria-label={t('board.recent')}
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.28em] text-white/30 md:text-[11px]">
              <CircleCheck className="size-3.5 text-white/25" aria-hidden="true" />
              {t('board.recent')}
            </p>
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <AnimatePresence initial={false}>
                {completed.map((e) => {
                  const age = now ? now.getTime() - new Date(e.completedAt).getTime() : 0
                  const opacity = Math.max(0.15, 1 - age / COMPLETED_TTL_MS) * 0.45
                  return (
                    <motion.span
                      key={e.code}
                      layout
                      exit={{ opacity: 0 }}
                      className="font-mono text-xl font-semibold tabular-nums text-[#F0E7DA] md:text-2xl"
                      style={{ opacity }}
                    >
                      {e.code}
                    </motion.span>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>
        </footer>
      )}

      {/* Idle screen */}
      {idle && (
        <div className="pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[#171210]/85 px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 170, damping: 18 }}
            className="flex size-24 items-center justify-center rounded-full border border-[#D9A441]/25 bg-[#D9A441]/[0.06]"
          >
            <Coffee className="size-10 text-[#D9A441]/60" aria-hidden="true" />
          </motion.div>
          <div>
            <p className="font-display text-2xl tracking-wide text-white/45 md:text-3xl">
              Sekelas Cafe
            </p>
            <p className="mt-2 text-sm text-white/30 md:text-base">{t('board.idle')}</p>
          </div>
        </div>
      )}

      {/* Offline: bottom-center indicator — board keeps its last state.
          Centered so it can never collide with the ready panel frame. */}
      {!status.connected && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#D95B4D]/40 bg-black/85 px-5 py-2.5 shadow-lg backdrop-blur-sm"
        >
          <span className="relative flex size-3">
            <span
              aria-hidden="true"
              className="absolute inline-flex size-full animate-ping rounded-full bg-[#B03A2E]/70"
            />
            <span
              aria-hidden="true"
              className="relative inline-flex size-3 rounded-full bg-[#D95B4D]"
            />
          </span>
          <span className="text-sm font-semibold tracking-wide text-white/90">
            {t('board.offline')}
          </span>
        </div>
      )}
    </div>
  )
}
