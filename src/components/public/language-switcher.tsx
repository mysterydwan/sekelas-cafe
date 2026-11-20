'use client'

// Language switcher (id / jv-Krama Alus / en) — globe button + dropdown.
// Cookie-persisted via useI18n().setLang (SSR reads the same cookie, so no
// hydration flash on the next load).
import { useEffect, useRef, useState } from 'react'
import { Check, Languages } from 'lucide-react'
import { LANGS, useI18n, type Lang } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Esc
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (next: Lang) => {
    setLang(next)
    setOpen(false)
  }

  const active = LANGS.find((l) => l.code === lang)

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t('header.languageLabel')}${active ? ` — ${active.native}` : ''}`}
        className="flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-cream-deep dark:hover:bg-espresso-soft/40"
      >
        <Languages className="size-5" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('header.language')}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-2xl border border-border bg-background p-1.5 shadow-xl"
        >
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {t('header.language')}
          </p>
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              role="option"
              aria-selected={l.code === lang}
              onClick={() => choose(l.code)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                l.code === lang
                  ? 'bg-cream-deep font-semibold text-foreground dark:bg-espresso-soft/40'
                  : 'text-foreground/85 hover:bg-cream-deep/70 dark:hover:bg-espresso-soft/25'
              )}
            >
              <span className="flex flex-col">
                <span>{l.native}</span>
                <span className="text-[11px] text-muted-foreground">{l.english}</span>
              </span>
              {l.code === lang && <Check className="size-4 shrink-0 text-caramel" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
