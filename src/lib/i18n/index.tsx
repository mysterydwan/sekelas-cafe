// i18n core: three locales (id / en / jv-Krama Alus), typed dot-path keys,
// cookie-persisted (SSR-consistent — no hydration flash), localized day names,
// long dates, hours summaries and status label maps for the public surface.
'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { id as idDict, type Dict } from './id'
import { en as enDict } from './en'
import { jv as jvDict } from './jv'
import { formatHM, jakartaDayIndex, nowJakartaMinutes, parseTimeHM } from '@/lib/format'
import type { OrderStatus, OrderType, PaymentStatus } from '@/lib/types'
import { LANG_COOKIE, normalizeLang, DEFAULT_LANG, type Lang } from './shared'

export { LANG_COOKIE, normalizeLang, DEFAULT_LANG }
export type { Lang }

export const LANGS: { code: Lang; native: string; english: string }[] = [
  { code: 'id', native: 'Bahasa Indonesia', english: 'Indonesian' },
  { code: 'jv', native: 'Basa Jawa · Krama Alus', english: 'Javanese (formal)' },
  { code: 'en', native: 'English', english: 'English' },
]

const DICTS: Record<Lang, Dict> = { id: idDict, en: enDict, jv: jvDict }

// ---------- Typed dot-path keys ----------

type DictLeaf = string
type DictNode = { [key: string]: DictLeaf | DictNode }
type PathsOf<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${PathsOf<T[K]>}`
    }[keyof T & string]
  : never

export type TKey = PathsOf<Dict>
export type TVars = Record<string, string | number>

function resolve(dict: unknown, path: string): string | undefined {
  let node: unknown = dict
  for (const part of path.split('.')) {
    if (node && typeof node === 'object' && part in (node as DictNode)) {
      node = (node as DictNode)[part]
    } else {
      return undefined
    }
  }
  return typeof node === 'string' ? node : undefined
}

function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m
  )
}

export function translate(lang: Lang, key: TKey, vars?: TVars): string {
  const hit = resolve(DICTS[lang], key) ?? resolve(DICTS.id, key)
  return hit ? interpolate(hit, vars) : String(key)
}

// ---------- Localized calendar data ----------

const DAY_LONG: Record<Lang, string[]> = {
  id: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  jv: ['Ahad', 'Senen', 'Selasa', 'Rebo', 'Kemis', 'Jemuwah', 'Setu'],
}
const DAY_SHORT: Record<Lang, string[]> = {
  id: ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  jv: ['Min', 'Sen', 'Sel', 'Reb', 'Kem', 'Jem', 'Set'],
}
const MONTHS: Record<Lang, string[]> = {
  id: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  jv: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
}

export function dayNameLocalized(lang: Lang, idx: number): string {
  return DAY_LONG[lang][idx] ?? ''
}
export function dayShortLocalized(lang: Lang, idx: number): string {
  return DAY_SHORT[lang][idx] ?? ''
}

/** "Kamis, 20 November 2025" (Asia/Jakarta). */
export function formatDateLongLocalized(lang: Lang, d: string | Date): string {
  const date = new Date(d)
  const parts = new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    parts.find((p) => p.type === 'weekday')?.value ?? ''
  )
  return `${DAY_LONG[lang][wd] ?? ''}, ${get('day')} ${MONTHS[lang][get('month') - 1]} ${get('year')}`
}

type HoursDays = { open: string; close: string; closed: boolean }[]

/** "20 November 2025, 07.15" (Asia/Jakarta, localized month names). */
export function formatDateTimeLocalized(lang: Lang, d: string | Date): string {
  const date = new Date(d)
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Jakarta',
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const base = `${get('day')} ${MONTHS[lang][Number(get('month')) - 1]} ${get('year')} ${get('hour')}.${get('minute')}`
  return lang === 'en' ? base.replace(/ (\d\d\.\d\d)$/, ', $1') : base
}

/** "Senin–Jumat · 07.00–14.00" built from settings, localized (long day names). */
export function summarizeHoursLocalized(lang: Lang, days: HoursDays): string {
  const groups: { from: number; to: number; open: string; close: string }[] = []
  days.forEach((d, i) => {
    if (d.closed) return
    const last = groups[groups.length - 1]
    if (last && last.to === i - 1 && last.open === d.open && last.close === d.close) {
      last.to = i
    } else {
      groups.push({ from: i, to: i, open: d.open, close: d.close })
    }
  })
  if (groups.length === 0) return translate(lang, 'status.noSchedule')
  return groups
    .map(
      (g) =>
        `${DAY_LONG[lang][g.from] ?? ''}${g.to > g.from ? '–' + (DAY_LONG[lang][g.to] ?? '') : ''} · ${formatHM(g.open)}–${formatHM(g.close)}`
    )
    .join(' · ')
}

/** When is the next opening moment (localized)? */
export function nextOpeningLocalized(lang: Lang, days: HoursDays): string {
  const now = nowJakartaMinutes()
  for (let offset = 0; offset < 8; offset++) {
    const idx = (jakartaDayIndex() + offset) % 7
    const d = days[idx]
    if (!d || d.closed) continue
    if (offset === 0 && now >= parseTimeHM(d.open)) continue
    const time = formatHM(d.open)
    if (offset === 0) return translate(lang, 'status.opensTodayAt', { time })
    return translate(lang, 'status.opensAt', { day: DAY_LONG[lang][idx] ?? '', time })
  }
  return translate(lang, 'status.noSchedule')
}

// ---------- Status label maps (public surface) ----------

export function orderStatusLabel(lang: Lang, status: OrderStatus): string {
  return translate(lang, `orderStatus.${status}` as TKey)
}
export function paymentStatusLabel(lang: Lang, status: 'UNPAID' | PaymentStatus): string {
  if (status === 'UNPAID') return translate(lang, 'paymentStatus.UNPAID')
  return translate(lang, `paymentStatus.${status}` as TKey)
}
export function orderTypeLabel(lang: Lang, type: OrderType, tableLabel?: string | null): string {
  if (type === 'DINE_IN' && tableLabel) {
    // Data may store "Meja 2" — strip a redundant prefix so it reads "Meja 2",
    // never "Meja Meja 2".
    const cleaned = tableLabel.replace(/^\s*(meja|table)\s+/i, '').trim()
    return translate(lang, 'orderType.table', { label: cleaned || tableLabel })
  }
  return translate(lang, `orderType.${type}` as TKey)
}

// ---------- React context ----------

interface I18nContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TKey, vars?: TVars) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({
  initialLang,
  children,
}: {
  initialLang?: Lang
  children: React.ReactNode
}) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? DEFAULT_LANG)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    // Cookie => next SSR render matches client state (no hydration flash).
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
  }, [])

  const t = useCallback((key: TKey, vars?: TVars) => translate(lang, key, vars), [lang])

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}

// Re-export for convenience
export type { Dict } from './id'
