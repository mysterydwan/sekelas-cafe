'use client'

// Snapshot dialog — X-report preview + Z history view.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SnapshotFigures } from './figures'
import type { DayReportSnapshot } from '@/lib/types'

export function SnapshotDialog({
  open,
  onOpenChange,
  snap,
  title,
  description,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  snap: DayReportSnapshot | null
  title: string
  description?: string
  footer?: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-warm sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {snap ? <SnapshotFigures snap={snap} /> : <p className="py-8 text-center text-sm text-muted-foreground">Memuat…</p>}
        {footer}
      </DialogContent>
    </Dialog>
  )
}
