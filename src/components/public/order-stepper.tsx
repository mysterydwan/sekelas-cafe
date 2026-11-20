'use client'

// Order status stepper: Diterima → Dibayar → Dimasak → Siap → (Diantar) → Selesai.
// Vertical on mobile, horizontal on desktop. Current step pulses subtly.
// Fully localized (id / jv-Krama Alus / en).
import { motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import type { OrderDTO, TimelineEntry } from '@/lib/types'
import { useI18n, type TKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const STEPS = ['CREATED', 'PAID', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'] as const
type StepKey = (typeof STEPS)[number]

const STEP_LABEL_KEY: Record<StepKey, TKey> = {
  CREATED: 'steps.created',
  PAID: 'steps.paid',
  PREPARING: 'steps.preparing',
  READY: 'steps.ready',
  OUT_FOR_DELIVERY: 'steps.outForDelivery',
  COMPLETED: 'steps.completed',
}

export function OrderStepper({
  order,
  variant = 'full',
}: {
  order: OrderDTO
  variant?: 'full' | 'mini'
}) {
  const { t } = useI18n()
  const mini = variant === 'mini'
  const byKey = new Map<string, TimelineEntry>()
  for (const tl of order.timeline) {
    if (tl.status === 'CREATED') byKey.set('CREATED', tl)
    else if (STEPS.includes(tl.status as StepKey)) byKey.set(tl.status, tl)
  }
  const steps = (order.type === 'DELIVERY' ? STEPS : STEPS.filter((s) => s !== 'OUT_FOR_DELIVERY')).map(
    (key) => ({
      key,
      label: t(STEP_LABEL_KEY[key]),
      at: byKey.get(key)?.at ?? null,
    })
  )
  const cancelled = order.status === 'CANCELLED'
  const currentIdx = steps.reduce((acc, s, i) => (s.at ? i : acc), 0)

  return (
    <ol className={cn('flex flex-col md:flex-row', mini ? 'gap-0' : 'gap-0')} aria-label={t('track.statusTitle')}>
      {steps.map((s, i) => {
        const done = Boolean(s.at)
        const isCurrent = !cancelled && i === currentIdx && done
        const dimmed = cancelled || (!done && i > currentIdx)
        return (
          <li
            key={s.key}
            className={cn(
              'relative flex gap-4 pb-6 last:pb-0 md:flex-1 md:flex-col md:items-center md:gap-2 md:pb-0 md:text-center',
              dimmed && 'opacity-45'
            )}
          >
            {/* connectors */}
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute bottom-0 left-4 top-8 w-0.5 md:bottom-auto md:left-1/2 md:right-0 md:top-4 md:h-0.5 md:w-auto',
                  done && i <= currentIdx ? 'bg-caramel' : 'bg-border'
                )}
              />
            )}

            {/* dot */}
            {cancelled && s.at ? (
              <span
                className={cn(
                  'relative z-10 flex shrink-0 items-center justify-center rounded-full bg-danger text-white',
                  mini ? 'size-7' : 'size-8'
                )}
              >
                <X className={mini ? 'size-3.5' : 'size-4'} />
              </span>
            ) : isCurrent ? (
              <motion.span
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className={cn(
                  'relative z-10 flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-caramel/30',
                  mini ? 'size-7' : 'size-8'
                )}
              >
                <Check className={mini ? 'size-3.5' : 'size-4'} />
              </motion.span>
            ) : (
              <span
                className={cn(
                  'relative z-10 flex shrink-0 items-center justify-center rounded-full border-2',
                  mini ? 'size-7' : 'size-8',
                  done
                    ? 'border-caramel bg-caramel text-espresso-deep'
                    : 'border-border bg-background text-transparent'
                )}
              >
                {done && <Check className={mini ? 'size-3.5' : 'size-4'} />}
              </span>
            )}

            <div className="min-w-0">
              <p
                className={cn(
                  'leading-tight font-medium',
                  mini ? 'text-xs' : 'text-sm',
                  isCurrent && 'text-foreground'
                )}
              >
                {s.label}
              </p>
              {!mini && (
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {s.at ? formatStepTime(s.at) : '—'}
                </p>
              )}
              {s.key === 'OUT_FOR_DELIVERY' && order.courierName && !mini && (
                <p className="text-[11px] text-caramel">{t('track.courierName', { name: order.courierName })}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function formatStepTime(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso))
}
