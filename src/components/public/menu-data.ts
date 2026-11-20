// Menu fetching with localStorage fallback (SPEC §3.1: cached menu + "menu lama" badge).
import { apiFetch } from '@/lib/client'
import type { MenuDTO } from '@/lib/types'
import type { MenuQueryData } from './types'

export const MENU_CACHE_KEY = 'sekelas-menu-cache'

/**
 * Try the API first; on failure serve the cached menu marked stale.
 * Always refresh the cache after a successful load.
 */
export async function fetchMenuWithCache(): Promise<MenuQueryData> {
  try {
    const menu = await apiFetch<MenuDTO>('/api/public/menu')
    try {
      localStorage.setItem(MENU_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), menu }))
    } catch {
      /* storage full/blocked — cache is best-effort */
    }
    return { menu, stale: false }
  } catch (err) {
    try {
      const raw = localStorage.getItem(MENU_CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { savedAt?: number; menu?: MenuDTO }
        if (parsed?.menu && Array.isArray(parsed.menu.categories)) {
          return { menu: parsed.menu, stale: true, savedAt: parsed.savedAt }
        }
      }
    } catch {
      /* corrupted cache — ignore */
    }
    throw err
  }
}

/** Pure updater for realtime menu:availability events (flips sold-out instantly). */
export function applyAvailability(menu: MenuDTO, productId: string, isAvailable: boolean): MenuDTO {
  return {
    categories: menu.categories.map((c) => ({
      ...c,
      products: c.products.map((p) => (p.id === productId ? { ...p, isAvailable } : p)),
    })),
  }
}
