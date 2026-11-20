'use client'

// `/track` — order-code entry page. Target of the PWA manifest shortcut
// "Lacak Pesanan" (public/manifest.webmanifest) and a friendly dead-end
// recovery from /track/[code]. Same storefront design language as `/`
// (SPEC §1.2, §1.5). Fully localized (id / jv-Krama Alus / en).
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, PackageSearch } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/client'
import { useI18n } from '@/lib/i18n'
import type { PublicSettingsDTO } from '@/lib/types'
import { SiteHeader } from '@/components/public/site-header'
import { SiteFooter } from '@/components/public/site-footer'
import { ConnectionBanner } from '@/components/public/connection-banner'
import { useOpenStatus } from '@/components/public/open-status'
import { CodeInput } from '@/components/public/code-input'
import { ORDER_CODE_RE } from '@/components/public/utils'

export default function TrackIndexPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [code, setCode] = useState('')
  const valid = ORDER_CODE_RE.test(code)

  const settingsQuery = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => apiFetch<PublicSettingsDTO>('/api/public/settings'),
    staleTime: 5 * 60_000,
  })
  const { status: openStatus } = useOpenStatus(settingsQuery.data?.hours)

  const go = () => {
    if (!valid) return
    router.push(`/track/${code}`)
  }

  return (
    <div className="flex min-h-screen flex-col bg-cream text-foreground">
      <SiteHeader settings={settingsQuery.data} openStatus={openStatus} />
      <ConnectionBanner />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-12 text-center">
        <motion.span
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="flex size-16 items-center justify-center rounded-full bg-cream-deep dark:bg-espresso-soft/30"
          aria-hidden="true"
        >
          <PackageSearch className="size-7 text-caramel" />
        </motion.span>

        <h1 className="mt-5 font-display text-3xl italic leading-snug text-foreground md:text-4xl">
          {t('trackPage.title')}
        </h1>
        <p className="mt-2.5 max-w-sm text-sm text-muted-foreground">
          {t('trackPage.hint')} <span className="font-mono">SKC-012</span>
        </p>

        <div className="mt-7 w-full space-y-3">
          <CodeInput value={code} onChange={setCode} onSubmit={go} autoFocus id="track-code" />
          <Button
            type="button"
            disabled={!valid}
            onClick={go}
            className="h-12 w-full rounded-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {t('track.trackBtn')}
          </Button>
        </div>

        <Link
          href="/"
          className="mt-7 inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> {t('trackPage.backToMenu')}
        </Link>
      </main>

      <SiteFooter settings={settingsQuery.data} />
    </div>
  )
}
