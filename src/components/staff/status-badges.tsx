'use client'

import { Badge } from '@/components/ui/badge'
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, type OrderStatus, type PaymentStatus, type StockStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'bg-caramel-pale/40 text-espresso border-caramel/40',
  PENDING_VERIFICATION: 'bg-caramel/15 text-warning border-caramel/50',
  PAID: 'bg-cream text-espresso border-caramel/30',
  PREPARING: 'bg-caramel/20 text-espresso border-caramel/50',
  READY: 'bg-caramel text-espresso-deep border-caramel',
  OUT_FOR_DELIVERY: 'bg-caramel-pale text-espresso border-caramel/40',
  COMPLETED: 'bg-success/15 text-success border-success/40',
  CANCELLED: 'bg-destructive/10 text-destructive border-destructive/40 line-through',
}

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_STYLES[status] ?? '', className)}>
      {status === 'READY' && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-espresso-deep" aria-hidden />}
      {ORDER_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

const PAYMENT_STYLES: Record<string, string> = {
  UNPAID: 'bg-muted text-muted-foreground border-border',
  CONFIRMED: 'bg-success/15 text-success border-success/40',
  PENDING_VERIFICATION: 'bg-caramel/15 text-warning border-caramel/50',
  REJECTED: 'bg-destructive/10 text-destructive border-destructive/40',
}

export function PaymentBadge({ status }: { status: 'UNPAID' | PaymentStatus }) {
  const label =
    status === 'UNPAID' ? 'Belum Bayar' : PAYMENT_STATUS_LABEL[status as PaymentStatus] ?? status
  return (
    <Badge variant="outline" className={cn('font-medium', PAYMENT_STYLES[status] ?? '')}>
      {label}
    </Badge>
  )
}

const STOCK_STYLES: Record<StockStatus, string> = {
  AMAN: 'bg-success/15 text-success border-success/40',
  RENDAH: 'bg-caramel/20 text-warning border-caramel/50',
  HABIS: 'bg-destructive/10 text-destructive border-destructive/40',
}

export function StockStatusBadge({ status }: { status: StockStatus }) {
  return (
    <Badge variant="outline" className={cn('font-medium', STOCK_STYLES[status])}>
      {status}
    </Badge>
  )
}
