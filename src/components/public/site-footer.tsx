'use client'

// Sticky footer (mt-auto) on the espresso-deep surface, safe-area aware.
// The long address text is replaced by a live Google Maps embed (responsive
// 4:3 card) — location at a glance instead of a paragraph.
import Link from 'next/link'
import { Clock, ExternalLink, MapPin, MessageCircle } from 'lucide-react'
import type { PublicSettingsDTO } from '@/lib/types'
import { summarizeHoursLocalized, useI18n } from '@/lib/i18n'
import { waLink } from './utils'
import { cn } from '@/lib/utils'

const MAPS_EMBED_SRC =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3950.1952116484254!2d111.89830667500792!3d-8.081563991946538!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e78e2fe4e42ef85%3A0x873776b0da703415!2sSMKN%201%20Boyolangu%20Tulungagung!5e0!3m2!1sid!2sid!4v1795156303140!5m2!1sid!2sid'
const MAPS_LINK =
  'https://www.google.com/maps/place/SMKN+1+Boyolangu+Tulungagung/@-8.081564,111.8983067,17z'

export function SiteFooter({
  settings,
  extraBottom,
}: {
  settings?: PublicSettingsDTO
  extraBottom?: boolean
}) {
  const { lang, t } = useI18n()
  const name = settings?.profile.name || 'Sekelas Cafe'
  const tagline = settings?.profile.tagline || 'Ngopi sekelas, rasa juara.'
  const hours = settings
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

  return (
    <footer className="mt-auto bg-espresso-deep text-[#F0E7DA]">
      <div className={cn('mx-auto w-full max-w-6xl px-4 py-10', extraBottom && 'pb-28')}>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt={`Logo ${name}`} className="h-10 w-auto object-contain" />
              <p className="font-display text-lg font-semibold text-[#FBF7F0]">{name}</p>
            </div>
            <p className="mt-3 max-w-xs text-sm italic leading-relaxed text-[#F0E7DA]/60">{tagline}</p>
            <Link
              href="/board"
              className="mt-5 inline-flex min-h-11 items-center gap-2.5 rounded-lg font-mono text-sm text-[#F0E7DA]/80 transition-colors hover:text-[#E7C078]"
            >
              {t('footer.board')}
            </Link>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D9A441]">
              {t('footer.visit')}
            </h2>
            {/* Live map embed replaces the long address text */}
            <div className="mt-3 overflow-hidden rounded-2xl border border-white/15 shadow-lg shadow-black/20">
              <div className="relative aspect-[4/3] w-full">
                <iframe
                  src={MAPS_EMBED_SRC}
                  title={`${name} — Google Maps`}
                  className="absolute inset-0 size-full"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            </div>
            <a
              href={MAPS_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex min-h-11 items-center gap-2 text-sm text-[#F0E7DA]/80 transition-colors hover:text-[#E7C078]"
            >
              <MapPin className="size-4 shrink-0 text-[#D9A441]" />
              {t('footer.openMap')}
              <ExternalLink className="size-3.5 opacity-60" />
            </a>
            <div className="mt-2 flex items-start gap-2.5 text-sm text-[#F0E7DA]/80">
              <Clock className="mt-0.5 size-4 shrink-0 text-[#D9A441]" />
              <span>
                {hours} <span className="text-[#F0E7DA]/50">WIB</span>
              </span>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D9A441]">
              {t('footer.contact')}
            </h2>
            <ul className="mt-3 space-y-3 text-sm text-[#F0E7DA]/80">
              {wa && (
                <li>
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2.5 rounded-lg transition-colors hover:text-[#E7C078]"
                  >
                    <MessageCircle className="size-4 shrink-0 text-[#D9A441]" />
                    {settings?.profile.phone}
                  </a>
                </li>
              )}
              <li className="text-xs leading-relaxed text-[#F0E7DA]/50">{t('footer.managedBy')}</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="pb-[env(safe-area-inset-bottom)]" />
    </footer>
  )
}
