'use client'

import { cn } from '@/lib/utils'
import { formatIDR } from '@/lib/format'

/** Right-aligned mono money display (SPEC: mono amounts). */
export function Money({
  value,
  className,
  signed = false,
}: {
  value: number
  className?: string
  signed?: boolean
}) {
  return (
    <span className={cn('font-mono tabular-nums', signed && value > 0 && 'text-success', signed && value < 0 && 'text-destructive', className)}>
      {signed && value > 0 ? '+' : ''}
      {formatIDR(value)}
    </span>
  )
}

/** Order code display — mono, tracking-wide. */
export function OrderCode({ code, className }: { code: string; className?: string }) {
  return <span className={cn('font-mono font-semibold tracking-wide', className)}>{code}</span>
}
