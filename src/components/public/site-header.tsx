'use client'

// Public storefront header: logo (NEVER cropped), name, live open/closed chip,
// track dialog, install-app button (PWA), language switcher, WhatsApp link,
// theme toggle.
import Link from 'next/link'
import { MessageCircle, PackageSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PublicSettingsDTO } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { OpenStatusChip, type OpenStatus } from './open-status'
import { ThemeToggle } from './theme-toggle'
import { TrackDialog } from './track-dialog'
import { LanguageSwitcher } from './language-switcher'
import { useInstallPrompt } from '@/components/pwa/use-install-prompt'
import { waLink } from './utils'

export function SiteHeader({
  settings,
  openStatus,
  openChanged,
}: {
  settings?: PublicSettingsDTO
  openStatus: OpenStatus | null
  openChanged?: boolean
}) {
  const { t } = useI18n()
  const name = settings?.profile.name || 'Sekelas Cafe'
  const wa = settings?.profile.phone ? waLink(settings.profile.phone) : null
  const { canInstall, promptInstall } = useInstallPrompt()

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-cream/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label={t('header.home', { name })}>
          {/* Logo as-is: no crop, no frame, no shadow (SPEC §1.2) */}
          <img
            src={settings?.profile.logoUrl || '/logo.png'}
            alt={`Logo ${name}`}
            className="h-10 w-auto shrink-0 object-contain"
          />
          <span className="truncate font-display text-base font-semibold text-foreground sm:text-lg">
            {name}
          </span>
        </Link>
        <OpenStatusChip status={openStatus} changed={openChanged} className="ml-1 hidden min-[420px]:inline-flex" />

        <nav className="ml-auto flex items-center gap-1" aria-label={t('common.menu')}>
          {canInstall && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 rounded-full text-caramel hover:bg-cream-deep dark:hover:bg-espresso-soft/40"
              aria-label={t('pwa.installTitle')}
              title={t('pwa.installTitle')}
              onClick={() => void promptInstall()}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
                aria-hidden="true"
              >
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
            </Button>
          )}

          <TrackDialog>
            <Button
              variant="outline"
              className="h-11 rounded-full border-border bg-background/70 px-4 text-foreground hover:bg-cream-deep dark:hover:bg-espresso-soft/30"
            >
              <PackageSearch className="size-4" />
              <span className="hidden sm:inline">{t('header.trackOrder')}</span>
              <span className="sr-only sm:hidden">{t('header.trackOrder')}</span>
            </Button>
          </TrackDialog>

          {wa && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              asChild
              className="size-11 rounded-full text-foreground hover:bg-cream-deep dark:hover:bg-espresso-soft/30"
            >
              <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={t('header.chatWa', { name })}>
                <MessageCircle className="size-5" />
              </a>
            </Button>
          )}

          <LanguageSwitcher />
          <ThemeToggle />
        </nav>
      </div>
      {/* Mobile: chip on its own row under the main bar */}
      <div className="flex h-9 items-center px-4 min-[420px]:hidden">
        <OpenStatusChip status={openStatus} changed={openChanged} />
      </div>
    </header>
  )
}
