// Grants-not-roles RBAC (SPEC §1.7). Client-safe constants + helpers.
import type { Role, SessionUser } from './types'

export const ALL_GRANTS = [
  'order.create',
  'order.voidItem',
  'order.cancel',
  'order.discount',
  'payment.confirm',
  'payment.refund',
  'availability.toggle',
  'product.manage',
  'stock.manage',
  'stock.delete',
  'recipe.manage',
  'count.approve',
  'report.viewAll',
  'data.import',
  'data.report',
  'user.manage',
  'settings.manage',
  'activity.view',
] as const

export type Grant = (typeof ALL_GRANTS)[number]

export const GRANT_LABELS: Record<Grant, string> = {
  'order.create': 'Membuat pesanan baru (Kasir)',
  'order.voidItem': 'Membatalkan item pesanan',
  'order.cancel': 'Membatalkan pesanan',
  'order.discount': 'Memberi diskon pesanan',
  'payment.confirm': 'Konfirmasi pembayaran QRIS',
  'payment.refund': 'Mencatat pengembalian dana',
  'availability.toggle': 'Mengubah status habis/tersedia produk',
  'product.manage': 'Mengelola produk & kategori',
  'stock.manage': 'Mencatat stok masuk/keluar/limbah',
  'stock.delete': 'Menghapus item stok',
  'recipe.manage': 'Mengelola resep produk',
  'count.approve': 'Menyetujui hasil opname',
  'report.viewAll': 'Melihat laporan semua tanggal & kas yang diharapkan',
  'data.import': 'Impor data Excel',
  'data.report': 'Membuat laporan X/Z & ekspor',
  'user.manage': 'Mengelola pengguna',
  'settings.manage': 'Mengubah pengaturan',
  'activity.view': 'Melihat log aktivitas',
}

export const GRANT_GROUPS: { domain: string; grants: Grant[] }[] = [
  { domain: 'Pesanan', grants: ['order.create', 'order.voidItem', 'order.cancel', 'order.discount', 'availability.toggle'] },
  { domain: 'Pembayaran', grants: ['payment.confirm', 'payment.refund'] },
  { domain: 'Stok', grants: ['stock.manage', 'stock.delete', 'recipe.manage', 'count.approve'] },
  { domain: 'Data', grants: ['report.viewAll', 'data.import', 'data.report'] },
  { domain: 'Sistem', grants: ['user.manage', 'settings.manage', 'activity.view'] },
]

export const ROLE_GRANTS: Record<Role, string[]> = {
  ADMIN: [...ALL_GRANTS],
  CASHIER: ['order.create', 'payment.confirm', 'availability.toggle', 'data.report'],
  BARISTA: ['availability.toggle', 'stock.manage'],
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  CASHIER: 'Kasir',
  BARISTA: 'Barista',
}

export function effectiveGrants(user: { role: string; grants: unknown }): string[] {
  const overrides = Array.isArray(user.grants) ? (user.grants as string[]) : null
  if (overrides) return overrides
  return ROLE_GRANTS[(user.role as Role) ?? 'BARISTA'] ?? []
}

export function hasGrant(
  user: Pick<SessionUser, 'grants'> | null | undefined,
  grant: string
): boolean {
  return !!user?.grants?.includes(grant)
}

/** Page access matrix (SPEC §1.7). Role-based page gating; grants gate actions within pages. */
export const PAGE_ROLES: Record<string, Role[]> = {
  '/dashboard': ['ADMIN', 'CASHIER', 'BARISTA'],
  '/pos': ['ADMIN', 'CASHIER'],
  '/kitchen': ['ADMIN', 'CASHIER', 'BARISTA'],
  '/orders': ['ADMIN', 'CASHIER', 'BARISTA'],
  '/products': ['ADMIN', 'CASHIER', 'BARISTA'],
  '/stock': ['ADMIN', 'CASHIER', 'BARISTA'],
  '/reports': ['ADMIN', 'CASHIER'],
  '/data': ['ADMIN', 'CASHIER'],
  '/users': ['ADMIN'],
  '/settings': ['ADMIN'],
  '/activity': ['ADMIN'],
}

export function canAccessPage(pathname: string, role: Role | undefined): boolean {
  if (!role) return false
  // Accept both '/dashboard' and 'dashboard' (PageGuard passes bare keys)
  const normalized = '/' + pathname.replace(/^\/+/, '')
  const page = Object.keys(PAGE_ROLES)
    .filter((p) => normalized === p || normalized.startsWith(p + '/'))
    .sort((a, b) => b.length - a.length)[0]
  if (!page) return true
  return PAGE_ROLES[page].includes(role)
}

export function homeForRole(role: Role | undefined): string {
  switch (role) {
    case 'ADMIN':
      return '/dashboard'
    case 'CASHIER':
      return '/pos'
    case 'BARISTA':
      return '/kitchen'
    default:
      return '/login'
  }
}
