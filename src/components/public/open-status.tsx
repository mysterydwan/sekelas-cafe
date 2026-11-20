'use client'

// Live open/closed status — computed client-side from Settings→Hours, re-checked
// every 60s (SPEC §3.1). Chip pulses when the state flips. Fully localized
// (id / jv-Krama Alus / en) via the i18n layer.
import { useEffect, useRef, useState } from 'react'
import { formatHM, jakartaDayIndex, nowJakartaMinutes, parseTimeHM } from '@/lib/format'
import type { PublicSettingsDTO } from '@/lib/types'
import { nextOpeningLocalized, translate, useI18n, type Lang } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export interface OpenStatus {
  open: boolean
  label: string
  detail: string
}

function computeOpenStatus(hours: PublicSettingsDTO['hours'], lang: Lang): OpenStatus {
  const today = hours.days[jakartaDayIndex()]
  if (!today || today.closed) {
    return { open: false, label: translate(lang, 'status.closed'), detail: nextOpeningLocalized(lang, hours.days) }
  }
  const now = nowJakartaMinutes()
  if (now < parseTimeHM(today.open)) {
    return { open: false, label: translate(lang, 'status.closed'), detail: nextOpeningLocalized(lang, hours.days) }
  }
  if (now >= parseTimeHM(today.close)) {
    return { open: false, label: translate(lang, 'status.closed'), detail: nextOpeningLocalized(lang, hours.days) }
  }
  return {
    open: true,
    label: translate(lang, 'status.open'),
    detail: translate(lang, 'status.closesAt', { time: formatHM(today.close) }),
  }
}

/**
 * Recomputes open/closed every 60s. `changed` is true for ~2.6s after a flip
 * so the chip can pulse (SPEC: "chip pulses on state change").
 */
export function useOpenStatus(hours: PublicSettingsDTO['hours'] | undefined): {
  status: OpenStatus | null
  changed: boolean
} {
  const { lang } = useI18n()
  const [status, setStatus] = useState<OpenStatus | null>(null)
  const [changed, setChanged] = useState(false)
  const statusRef = useRef<OpenStatus | null>(null)

  useEffect(() => {
    if (!hours) return
    let flashTimer: ReturnType<typeof setTimeout> | undefined

    const apply = () => {
      const next = computeOpenStatus(hours, lang)
      const had = statusRef.current
      statusRef.current = next
      setStatus(next)
      if (had && had.open !== next.open) {
        setChanged(true)
        flashTimer = setTimeout(() => setChanged(false), 2600)
      }
    }

    // deferred out of the effect body (async callback pattern)
    Promise.resolve().then(apply)
    const interval = setInterval(apply, 60_000)
    return () => {
      clearInterval(interval)
      if (flashTimer) clearTimeout(flashTimer)
    }
  }, [hours, lang])

  return { status, changed }
}

export function OpenStatusChip({
  status,
  changed,
  className,
}: {
  status: OpenStatus | null
  changed?: boolean
  className?: string
}) {
  const { t } = useI18n()
  if (!status) {
    return (
      <span
        className={cn(
          'inline-flex h-6 animate-pulse items-center rounded-full bg-muted px-2.5 text-[11px] font-medium text-muted-foreground',
          className
        )}
        aria-label={t('status.loading')}
      >
        {t('status.loading')}
      </span>
    )
  }
  return (
    <span
      role="status"
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium',
        status.open ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
        changed && 'animate-pulse',
        className
      )}
    >
      <span className="relative flex size-2">
        {changed && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full',
              status.open ? 'bg-success' : 'bg-danger'
            )}
          />
        )}
        <span
          className={cn('relative inline-flex size-2 rounded-full', status.open ? 'bg-success' : 'bg-danger')}
        />
      </span>
      {status.label} · {status.detail}
    </span>
  )
}
