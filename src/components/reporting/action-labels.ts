// Human-readable labels for audit actions + entities (client-safe).
import { ORDER_STATUS_LABEL } from '@/lib/types'
import type { OrderStatus } from '@/lib/types'

const ACTION_LABELS: Record<string, string> = {
  'order.create': 'Pesanan dibuat',
  'order.voidItem': 'Item pesanan dibatalkan',
  'order.cancel': 'Pesanan dibatalkan',
  'order.courier': 'Kurir ditetapkan',
  'order.hold': 'Pesanan diparkir',
  'order.heldDelete': 'Pesanan diparkir dihapus',
  'order.check': 'Item pesanan dicentang',
  'order.ack': 'Pesanan dikonfirmasi dapur',
  'order.served': 'Pesanan disajikan',
  'order.recall': 'Pesanan dipanggil kembali',
  'print.reprint': 'Cetak ulang struk/KOT',
  'payment.take': 'Pembayaran diterima',
  'payment.verifyQris': 'QRIS diverifikasi',
  'payment.rejectQris': 'Pembayaran QRIS ditolak',
  'cash.opening_float': 'Modal awal diatur',
  'cash.cash_in': 'Uang masuk dicatat',
  'cash.cash_out': 'Uang keluar dicatat',
  'stock.create': 'Item stok dibuat',
  'stock.update': 'Item stok diperbarui',
  'stock.deactivate': 'Item stok dinonaktifkan',
  'stock.delete': 'Item stok dihapus',
  'stock.restock': 'Pembelian stok (restock)',
  'stock.restock_in': 'Stok masuk',
  'stock.waste': 'Limbah stok dicatat',
  'stock.adjustment': 'Penyesuaian stok',
  'stock.manual_out': 'Stok keluar manual',
  'stock.count_variance': 'Variansi hasil opname',
  'recipe.save': 'Resep disimpan',
  'count.saveDraft': 'Draft opname disimpan',
  'count.approve': 'Hasil opname disetujui',
  'product.create': 'Produk dibuat',
  'product.update': 'Produk diperbarui',
  'product.delete': 'Produk dinonaktifkan',
  'product.bulk': 'Aksi massal produk',
  'product.availability': 'Status habis/tersedia diubah',
  'category.create': 'Kategori dibuat',
  'category.update': 'Kategori diperbarui',
  'category.delete': 'Kategori dihapus',
  'user.create': 'Pengguna dibuat',
  'user.update': 'Pengguna diperbarui',
  'settings.update': 'Pengaturan diubah',
  'settings.patch': 'Pengaturan diubah',
  'report.zClose': 'Hari ditutup (Z-Report)',
  'data.import': 'Impor data Excel',
}

export function formatAction(action: string): string {
  if (action.startsWith('order.status:')) {
    const status = action.slice('order.status:'.length) as OrderStatus
    return `Status Pesanan → ${ORDER_STATUS_LABEL[status] ?? status}`
  }
  return ACTION_LABELS[action] ?? action
}

const ENTITY_LABELS: Record<string, string> = {
  Order: 'Pesanan',
  OrderItem: 'Item Pesanan',
  Product: 'Produk',
  Category: 'Kategori',
  VariantGroup: 'Grup Varian',
  StockItem: 'Bahan Stok',
  StockMovement: 'Pergerakan Stok',
  StockCount: 'Opname Stok',
  RecipeItem: 'Resep',
  User: 'Pengguna',
  Payment: 'Pembayaran',
  HeldOrder: 'Pesanan Diparkir',
  CashMovement: 'Kas',
  DailyReport: 'Laporan Harian',
  Setting: 'Pengaturan',
  Import: 'Impor Data',
}

export function formatEntity(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity
}
