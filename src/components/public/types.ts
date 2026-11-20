// Local shared types for the public experience (Agent A namespace).
// Canonical DTOs live in src/lib/types.ts — these extend them for view needs only.
import type { MenuDTO, OrderType } from '@/lib/types'

/** Shape of /api/public/board (additive tableLabel for "MEJA X" badges). */
export interface BoardPreparingEntry {
  code: string
  type: OrderType
  tableLabel: string | null
  createdAt: string
}

export interface BoardReadyEntry {
  code: string
  type: OrderType
  tableLabel: string | null
  readyAt: string
}

export interface BoardCompletedEntry {
  code: string
  completedAt: string
}

export interface BoardDTO {
  preparing: BoardPreparingEntry[]
  ready: BoardReadyEntry[]
  recentCompleted: BoardCompletedEntry[]
}

/** Menu query data: live menu or cached fallback marked stale. */
export interface MenuQueryData {
  menu: MenuDTO
  stale: boolean
  savedAt?: number
}

export type { MenuDTO }
