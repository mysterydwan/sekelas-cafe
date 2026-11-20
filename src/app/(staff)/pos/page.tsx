'use client'

import { PageGuard } from '@/components/staff/page-guard'
import { PosWorkspace } from '@/components/staff/pos/workspace'

export default function PosPage() {
  return (
    <PageGuard page="pos">
      <PosWorkspace />
    </PageGuard>
  )
}
