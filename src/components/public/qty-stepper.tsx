'use client'

// 44px qty stepper (min 1, max 99) — product sheet + cart lines.
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  compact = false,
  label,
  ariaLabels,
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  compact?: boolean
  label?: string
  /** Localized +/− button labels (defaults via i18n). */
  ariaLabels?: { decrease: string; increase: string }
}) {
  const { t } = useI18n()
  const decrease = ariaLabels?.decrease ?? t('cart.decreaseQty')
  const increase = ariaLabels?.increase ?? t('cart.increaseQty')
  const btn = cn('flex items-center justify-center transition-colors', compact ? 'size-10' : 'size-11')
  return (
    <div
      role="group"
      aria-label={label ?? t('product.qty')}
      className="inline-flex items-center rounded-full border border-border bg-background"
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={decrease}
        className={cn(btn, 'rounded-l-full hover:bg-cream-deep disabled:opacity-40 dark:hover:bg-espresso-soft/30')}
      >
        <Minus className="size-4" />
      </button>
      <span
        className={cn(
          'text-center font-mono text-sm font-semibold tabular-nums',
          compact ? 'w-9' : 'w-10'
        )}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={increase}
        className={cn(btn, 'rounded-r-full hover:bg-cream-deep disabled:opacity-40 dark:hover:bg-espresso-soft/30')}
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}
