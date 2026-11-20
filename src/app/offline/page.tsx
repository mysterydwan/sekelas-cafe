'use client'

// Offline fallback shell served by the service worker when a navigation
// request fails and no cached copy exists. Intentionally static — no data
// fetching, no metadata export (client component) — so the SW can precache
// it once and serve it instantly while offline.

import { WifiOff } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'

export default function OfflinePage() {
  const { t } = useI18n()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-cream px-4 py-10 text-center">
      <main className="flex w-full max-w-sm flex-col items-center">
        {/* Brand — never cropped, never framed */}
        <img
          src="/logo.png"
          alt="Logo Sekelas Cafe"
          className="h-16 w-auto object-contain"
          draggable={false}
        />

        {/* Status icon in a soft ring */}
        <span
          aria-hidden
          className="mt-10 flex size-16 items-center justify-center rounded-full bg-cream-deep ring-8 ring-caramel-pale/30"
        >
          <WifiOff className="size-7 text-espresso" />
        </span>

        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight">
          {t('pwa.offlineTitle')}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t('pwa.offlineDesc')}
        </p>

        <Button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-8 h-12 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t('pwa.reload')}
        </Button>

        <p className="mt-10 text-xs italic text-muted-foreground">
          {t('pwa.offlineTagline')}
        </p>
      </main>
    </div>
  )
}
