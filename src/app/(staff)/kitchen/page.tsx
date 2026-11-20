'use client'

// /kitchen — Kitchen Display System (SPEC §3.7). Always-dark full-bleed board
// gated to staff roles; CASHIER gets view-only mode inside the board.

import { PageGuard } from '@/components/staff/page-guard'
import { KitchenBoard } from '@/components/staff/kitchen/kitchen-board'

export default function KitchenPage() {
  return (
    <PageGuard page="/kitchen">
      <KitchenBoard />
    </PageGuard>
  )
}
