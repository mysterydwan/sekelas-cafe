// Server- AND client-safe i18n constants (NO 'use client' directive) —
// imported by the root server layout to read the language cookie without
// touching the client-only provider module.
export type Lang = 'id' | 'en' | 'jv'
export const LANG_COOKIE = 'sekelas-lang'
export const DEFAULT_LANG: Lang = 'id'

export function normalizeLang(value: string | undefined | null): Lang {
  return value === 'en' || value === 'jv' ? value : 'id'
}
