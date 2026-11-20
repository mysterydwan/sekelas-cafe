'use client'

// Status chips for the public read views (track + confirmation) — localized.
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { orderStatusLabel, paymentStatusLabel, useI18n } from '@/lib/i18n'
import type { OrderStatus, PaymentStatus } from '@/lib/types'

const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'bg-warning/15 text-warning border-warning/30',
  PENDING_VERIFICATION: 'bg-warning/15 text-warning border-warning/30',
  PAID: 'bg-success/15 text-success border-success/30',
  PREPARING: 'bg-caramel/15 text-caramel border-caramel/40',
  READY: 'bg-caramel text-espresso-deep border-transparent',
  OUT_FOR_DELIVERY: 'bg-espresso-deep text-[#F0E7DA] border-transparent',
  COMPLETED: 'bg-muted text-muted-foreground border-border',
  CANCELLED: 'bg-danger text-white border-transparent',
}

export function OrderStatusChip({
  status,
  className,
}: {
  status: OrderStatus
  className?: string
}) {
  const { lang } = useI18n()
  return (
    <Badge className={cn('border font-medium', ORDER_STATUS_STYLE[status], className)}>
      {orderStatusLabel(lang, status)}
    </Badge>
  )
}

export function PaymentChip({
  status,
  className,
}: {
  status: 'UNPAID' | PaymentStatus
  className?: string
}) {
  const { lang } = useI18n()
  const style =
    status === 'CONFIRMED'
      ? 'bg-success/15 text-success border-success/30'
      : status === 'UNPAID'
        ? 'bg-warning/15 text-warning border-warning/30'
        : status === 'REJECTED'
          ? 'bg-danger/10 text-danger border-danger/30'
          : 'bg-warning/15 text-warning border-warning/30'
  return (
    <Badge className={cn('border font-medium', style, className)}>
      {paymentStatusLabel(lang, status)}
    </Badge>
  )
}
