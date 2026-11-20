// Excel library (Agent D): SheetJS wrappers — import templates, parse/preview/apply,
// and export serializers. Exports reuse report computations (one source of truth).
import 'server-only'
import * as XLSX from 'xlsx'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { NextResponse } from 'next/server'
import { db } from './db'
import { audit } from './audit'
import { hashPassword } from './auth'
import { computeDayReport, getReportSummary } from './reports'
import { formatDateTime, todayJakarta } from './format'
import { ORDER_STATUS_LABEL, ORDER_TYPE_LABEL } from './types'
import type { SessionUser } from './types'

// ---------- Types ----------

export type ImportType = 'PRODUCTS' | 'STOCK' | 'RECIPES' | 'USERS'
export type ImportStatus = 'NEW' | 'UPDATE' | 'ERROR'

export interface ImportRow {
  row: number
  data: Record<string, string>
  status: ImportStatus
  message?: string
  current?: Record<string, string>
}

export interface ImportPreview {
  rows: ImportRow[]
  counts: { new: number; update: number; error: number }
}

export interface ImportResult {
  inserted: number
  updated: number
  failed: { row: number; message: string }[]
  snapshotSaved: boolean
}

export interface SheetSpec {
  name: string
  rows: (string | number)[][]
}

export const IMPORT_TYPES: ImportType[] = ['PRODUCTS', 'STOCK', 'RECIPES', 'USERS']
const TEMPLATE_VERSION = '1.0'
const MAX_ROWS = 2000

// ---------- Workbook helpers ----------

function autoCols(rows: (string | number)[][]): { wch: number }[] {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0)
  return Array.from({ length: width }, (_, c) => ({
    wch: Math.min(42, Math.max(10, rows.reduce((m, r) => Math.max(m, String(r[c] ?? '').length), 8) + 2)),
  }))
}

export function buildWorkbook(sheets: SheetSpec[]): Buffer {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows)
    ws['!cols'] = autoCols(s.rows)
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

/** Uniform xlsx file response for download routes. */
export function xlsxResponse(buf: Buffer, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

// ---------- Small parse helpers (Indonesian Excel friendly) ----------

function parseBool(v: string | undefined, fallback: boolean): boolean {
  const s = (v ?? '').trim().toUpperCase()
  if (!s) return fallback
  if (['YA', 'Y', 'TRUE', '1'].includes(s)) return true
  if (['TIDAK', 'T', 'FALSE', '0'].includes(s)) return false
  return fallback
}

function parseNum(v: string | undefined): number | null {
  if (v === undefined || v === null) return null
  const s = String(v).replace(/[Rp\s]/gi, '').replace(/\./g, '').replace(',', '.').trim()
  if (!s || isNaN(Number(s))) return null
  return Number(s)
}

function numOr(v: string | undefined, fallback: number): number {
  const n = parseNum(v)
  return n === null || isNaN(n) ? fallback : n
}

function intOr(v: string | undefined, fallback: number): number {
  return Math.round(numOr(v, fallback))
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

// ---------- Templates ----------

function petunjukRows(title: string, lines: string[]): (string | number)[][] {
  return [
    [`${title} — Sekelas Cafe`],
    [`Versi template ${TEMPLATE_VERSION} — diunduh ${todayJakarta()}`],
    [],
    ...lines.map((l, i) => [`${i + 1}.`, l] as (string | number)[]),
  ]
}

export async function buildTemplate(type: ImportType): Promise<Buffer> {
  if (type === 'PRODUCTS') return buildTemplateProducts()
  if (type === 'STOCK') return buildTemplateStock()
  if (type === 'RECIPES') return buildTemplateRecipes()
  return buildTemplateUsers()
}

async function buildTemplateProducts(): Promise<Buffer> {
  const [products, group] = await Promise.all([
    db.product.findMany({
      where: { isActive: true },
      include: { category: { select: { name: true } } },
      orderBy: { sortOrder: 'asc' },
      take: 2,
    }),
    db.variantGroup.findFirst({
      where: { product: { isActive: true } },
      include: {
        product: { select: { name: true } },
        options: { orderBy: { sortOrder: 'asc' }, take: 2 },
      },
    }),
  ])

  const mainRows: (string | number)[][] = [
    ['Nama', 'Kategori', 'Deskripsi', 'URL Gambar', 'Harga Dasar', 'Harga Satuan', 'Aktif', 'Tersedia', 'Urutan', 'Catatan'],
    ...products.map((p) => [
      p.name,
      p.category.name,
      p.description ?? '',
      p.imageUrl ?? '',
      p.basePrice,
      p.unitCost ?? '',
      'YA',
      p.isAvailable ? 'YA' : 'TIDAK',
      p.sortOrder,
      'Harga dalam Rupiah bulat, tanpa titik — contoh: 8000 (bukan 8.000). Nama yang sudah ada akan memperbarui produk itu.',
    ] as (string | number)[]),
  ]

  const variantRows: (string | number)[][] = [
    ['Produk', 'Grup', 'Tipe', 'Wajib', 'Min', 'Maks', 'Opsi', 'Harga Delta', 'Default', 'Urutan', 'Catatan'],
  ]
  if (group && group.options.length > 0) {
    for (const o of group.options) {
      variantRows.push([
        group.product.name,
        group.name,
        group.selectionType,
        group.isRequired ? 'YA' : 'TIDAK',
        group.minSelect,
        group.maxSelect,
        o.label,
        o.priceDelta,
        o.isDefault ? 'YA' : 'TIDAK',
        o.sortOrder,
        'Satu baris = satu opsi. Atribut grup (Tipe/Wajib/Min/Maks) dibaca dari baris pertama tiap grup.',
      ])
    }
  } else {
    variantRows.push(['Kopi Susu', 'Ukuran', 'SINGLE', 'YA', 1, 1, 'Reguler', 0, 'YA', 1, 'Satu baris = satu opsi. Tipe SINGLE atau MULTI.'])
  }

  return buildWorkbook([
    {
      name: 'Petunjuk',
      rows: petunjukRows('Template Impor Produk', [
        'Isi lembar "Produk" dengan data menu. Baris dengan Nama yang sudah ada akan MEMPERBARUI data tersebut.',
        'Harga ditulis dalam angka Rupiah tanpa titik — contoh: 8000 (bukan 8.000).',
        '"Harga Satuan" adalah harga pokok per porsi (opsional, untuk laporan margin). Kosongkan jika tidak dipakai.',
        'Kolom "Aktif" = produk tampil di menu; "Tersedia" = status habis/tersedia hari ini. Isi YA atau TIDAK.',
        'Kategori yang belum terdaftar akan dibuat otomatis saat impor.',
        'Lembar "Varian Grup" bersifat OPSIONAL — kosongkan seluruhnya jika tidak ingin mengubah varian.',
        'Satu baris lembar "Varian Grup" mewakili SATU OPSI varian; atribut grup (Tipe/Wajib/Min/Maks) dibaca dari baris pertama grup tersebut.',
        'Jika lembar "Varian Grup" terisi untuk satu produk, SEMUA grup varian produk itu akan diganti dengan isi lembar ini.',
        'Jangan mengubah nama kolom atau menukar posisinya pada baris pertama.',
        'Kolom "Catatan" di akhir hanya untuk anotasi manusia — isinya tidak dibaca saat impor.',
        'Batas berkas: maksimal 2.000 baris data dan 5 MB.',
      ]),
    },
    { name: 'Produk', rows: mainRows },
    { name: 'Varian Grup', rows: variantRows },
  ])
}

async function buildTemplateStock(): Promise<Buffer> {
  const items = await db.stockItem.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, take: 2 })
  return buildWorkbook([
    {
      name: 'Petunjuk',
      rows: petunjukRows('Template Impor Bahan Stok', [
        'SKU adalah kunci pencocokan — baris dengan SKU yang sudah ada akan MEMPERBARUI data item tersebut.',
        'Satuan memakai: gr, ml, pcs, cup, atau btl.',
        'Jumlah boleh desimal (contoh: 12,5).',
        'Jika jumlah item yang sudah ada berubah, selisihnya tercatat sebagai penyesuaian (ADJUSTMENT) di buku pergerakan stok.',
        '"Ambang Rendah" = batas stok minimum sebelum ditandai RENDAH. "Biaya Satuan" dalam Rupiah (boleh desimal).',
        'Kolom "Aktif" diisi YA atau TIDAK.',
        'Jangan mengubah nama kolom pada baris pertama.',
        'Kolom "Catatan" di akhir hanya untuk anotasi manusia — isinya tidak dibaca saat impor.',
        'Batas berkas: maksimal 2.000 baris data dan 5 MB.',
      ]),
    },
    {
      name: 'Bahan Stok',
      rows: [
        ['SKU', 'Nama', 'Satuan', 'Jumlah', 'Ambang Rendah', 'Biaya Satuan', 'Aktif', 'Catatan'],
        ...items.map(
          (i) =>
            [i.sku, i.name, i.unit, i.qty, i.lowThreshold, i.unitCost, 'YA', 'SKU unik — dipakai untuk pencocokan pembaruan. Satuan: gr, ml, pcs, cup, atau btl.'] as (string | number)[]
        ),
      ],
    },
  ])
}

async function buildTemplateRecipes(): Promise<Buffer> {
  const first = await db.recipeItem.findFirst({ include: { product: { select: { name: true } } }, orderBy: { product: { name: 'asc' } } })
  let lines: { product: string; sku: string; qty: number }[] = []
  if (first) {
    const rows = await db.recipeItem.findMany({
      where: { productId: first.productId },
      include: { stockItem: { select: { sku: true } } },
      take: 2,
    })
    lines = rows.map((r) => ({ product: first.product.name, sku: r.stockItem.sku, qty: r.qtyPerUnit }))
  }
  if (lines.length === 0) lines = [{ product: 'Kopi Susu', sku: 'KP-ARABICA', qty: 18 }]
  return buildWorkbook([
    {
      name: 'Petunjuk',
      rows: petunjukRows('Template Impor Resep', [
        'Resep dicocokkan berdasarkan NAMA PRODUK — semua baris dengan produk yang sama menjadi SATU resep utuh (resep lama produk itu diganti).',
        '"SKU Bahan" harus sudah terdaftar di halaman Data Stok.',
        '"Takaran per Porsi" memakai satuan bahan — contoh: 18 berarti 18 gr kopi untuk satu porsi.',
        'Produk yang tidak punya baris resep di berkas ini tidak akan berubah.',
        'Jangan mengubah nama kolom pada baris pertama.',
        'Kolom "Catatan" di akhir hanya untuk anotasi manusia — isinya tidak dibaca saat impor.',
        'Batas berkas: maksimal 2.000 baris data dan 5 MB.',
      ]),
    },
    {
      name: 'Resep',
      rows: [
        ['Produk', 'SKU Bahan', 'Takaran per Porsi', 'Catatan'],
        ...lines.map(
          (l) =>
            [l.product, l.sku, l.qty, 'Takaran dalam satuan bahan per 1 porsi produk — contoh: 18 berarti 18 gr.'] as (string | number)[]
        ),
      ],
    },
  ])
}

async function buildTemplateUsers(): Promise<Buffer> {
  const users = await db.user.findMany({ orderBy: { createdAt: 'asc' }, take: 2 })
  return buildWorkbook([
    {
      name: 'Petunjuk',
      rows: petunjukRows('Template Impor Pengguna', [
        'Username adalah kunci pencocokan — baris dengan username yang sudah ada akan MEMPERBARUI data (kata sandi TIDAK ikut diubah).',
        'Pengguna BARU otomatis mendapat kata sandi default "password123" — minta ia segera menggantinya setelah login.',
        'Peran diisi: ADMIN, CASHIER, atau BARISTA.',
        'PIN opsional 4–6 digit untuk login cepat di tablet bersama. Kosongkan jika tidak dipakai.',
        'Kolom "Aktif" dan "Latihan" diisi YA atau TIDAK. Latihan = akun untuk berlatih (mode latihan).',
        'Jangan mengubah nama kolom pada baris pertama.',
        'Kolom "Catatan" di akhir hanya untuk anotasi manusia — isinya tidak dibaca saat impor.',
        'Batas berkas: maksimal 2.000 baris data dan 5 MB.',
      ]),
    },
    {
      name: 'Pengguna',
      rows: [
        ['Username', 'Nama', 'Peran', 'PIN', 'Aktif', 'Latihan', 'Catatan'],
        ...users.map(
          (u) =>
            [u.username, u.name, u.role, '', 'YA', u.isTraining ? 'YA' : 'TIDAK', 'PIN 4–6 digit atau kosongkan. Username adalah kunci pencocokan — sandi tidak ikut diubah.'] as (string | number)[]
        ),
      ],
    },
  ])
}

// ---------- Import: parse + preview ----------

interface ParsedSheet {
  headers: string[]
  data: string[][]
}

function readSheet(wb: XLSX.WorkBook, preferredNames: string[]): ParsedSheet | null {
  let name = wb.SheetNames.find((n) => preferredNames.map(norm).includes(norm(n)))
  if (!name) name = wb.SheetNames[0]
  if (!name) return null
  const ws = wb.Sheets[name]
  if (!ws) return null
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false, blankrows: false })
  const rows = aoa.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').trim()) : []))
  const headers = rows[0] ?? []
  const data = rows.slice(1).filter((r) => r.some((c) => c !== ''))
  return { headers, data }
}

function colIndex(headers: string[], expected: string): number {
  const i = headers.findIndex((h) => norm(h) === norm(expected))
  if (i < 0) throw new Error(`Kolom "${expected}" tidak ditemukan pada baris pertama — gunakan template resmi dari Perpustakaan Template`)
  return i
}

function pick(row: string[], idx: number): string {
  return (row[idx] ?? '').trim()
}

export async function parseImportFile(buffer: Buffer, type: ImportType): Promise<ImportPreview> {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buffer, { type: 'buffer' })
  } catch {
    throw new Error('Berkas tidak dapat dibaca — pastikan format .xlsx atau .csv yang valid')
  }

  const rows: ImportRow[] = []
  const counts = { new: 0, update: 0, error: 0 }
  const add = (row: number, data: Record<string, string>, status: ImportStatus, message?: string, current?: Record<string, string>) => {
    rows.push({ row, data, status, ...(message ? { message } : {}), ...(current ? { current } : {}) })
    counts[status === 'NEW' ? 'new' : status === 'UPDATE' ? 'update' : 'error'] += 1
  }

  if (type === 'PRODUCTS') {
    const main = readSheet(wb, ['Produk', 'Products'])
    if (!main) throw new Error('Berkas kosong atau tidak memiliki lembar data')
    if (main.data.length > MAX_ROWS) throw new Error(`Berkas melebihi ${MAX_ROWS} baris data — pecah menjadi beberapa berkas`)
    const c = {
      nama: colIndex(main.headers, 'Nama'),
      kategori: colIndex(main.headers, 'Kategori'),
      deskripsi: colIndex(main.headers, 'Deskripsi'),
      gambar: colIndex(main.headers, 'URL Gambar'),
      dasar: colIndex(main.headers, 'Harga Dasar'),
      satuan: colIndex(main.headers, 'Harga Satuan'),
      aktif: colIndex(main.headers, 'Aktif'),
      tersedia: colIndex(main.headers, 'Tersedia'),
      urutan: colIndex(main.headers, 'Urutan'),
    }
    const existing = await db.product.findMany({ include: { category: { select: { name: true } } } })
    const byName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p]))
    const seen = new Set<string>()
    const fileNames = new Set<string>()

    main.data.forEach((r, i) => {
      const rowNo = i + 2
      const data: Record<string, string> = {
        Nama: pick(r, c.nama),
        Kategori: pick(r, c.kategori),
        Deskripsi: pick(r, c.deskripsi),
        'URL Gambar': pick(r, c.gambar),
        'Harga Dasar': pick(r, c.dasar),
        'Harga Satuan': pick(r, c.satuan),
        Aktif: pick(r, c.aktif) || 'YA',
        Tersedia: pick(r, c.tersedia) || 'YA',
        Urutan: pick(r, c.urutan) || '0',
      }
      const name = data['Nama']
      const lower = name.toLowerCase()
      if (name) fileNames.add(lower)
      const harga = parseNum(data['Harga Dasar'])
      if (!name) return add(rowNo, data, 'ERROR', 'Nama wajib diisi')
      if (!data['Kategori']) return add(rowNo, data, 'ERROR', 'Kategori wajib diisi')
      if (seen.has(lower)) return add(rowNo, data, 'ERROR', `Nama "${name}" duplikat di dalam berkas`)
      seen.add(lower)
      if (harga === null || harga < 0) return add(rowNo, data, 'ERROR', 'Harga Dasar harus angka bulat ≥ 0')

      const ex = byName.get(lower)
      if (ex) {
        return add(rowNo, data, 'UPDATE', undefined, {
          Nama: ex.name,
          Kategori: ex.category.name,
          Deskripsi: ex.description ?? '',
          'URL Gambar': ex.imageUrl ?? '',
          'Harga Dasar': String(ex.basePrice),
          'Harga Satuan': ex.unitCost === null ? '' : String(ex.unitCost),
          Aktif: ex.isActive ? 'YA' : 'TIDAK',
          Tersedia: ex.isAvailable ? 'YA' : 'TIDAK',
          Urutan: String(ex.sortOrder),
        })
      }
      add(rowNo, data, 'NEW')
    })

    // Optional second sheet: variant groups
    const hasVariantSheet = wb.SheetNames.some((n) => ['varian grup', 'varian', 'variant groups', 'variants'].map(norm).includes(norm(n)))
    if (hasVariantSheet) {
      const vs = readSheet(wb, ['Varian Grup', 'Varian'])
      if (vs && vs.data.length > 0) {
        if (rows.length + vs.data.length > MAX_ROWS) throw new Error(`Berkas melebihi ${MAX_ROWS} baris data — pecah menjadi beberapa berkas`)
        const vc = {
          produk: colIndex(vs.headers, 'Produk'),
          grup: colIndex(vs.headers, 'Grup'),
          tipe: colIndex(vs.headers, 'Tipe'),
          wajib: colIndex(vs.headers, 'Wajib'),
          min: colIndex(vs.headers, 'Min'),
          maks: colIndex(vs.headers, 'Maks'),
          opsi: colIndex(vs.headers, 'Opsi'),
          delta: colIndex(vs.headers, 'Harga Delta'),
          def: colIndex(vs.headers, 'Default'),
          urutan: colIndex(vs.headers, 'Urutan'),
        }
        const seenV = new Set<string>()
        vs.data.forEach((r, i) => {
          const rowNo = main.data.length + i + 2
          const data: Record<string, string> = {
            __sheet: 'varian',
            Produk: pick(r, vc.produk),
            Grup: pick(r, vc.grup),
            Tipe: (pick(r, vc.tipe) || 'SINGLE').toUpperCase(),
            Wajib: pick(r, vc.wajib) || 'TIDAK',
            Min: pick(r, vc.min) || '0',
            Maks: pick(r, vc.maks) || '1',
            Opsi: pick(r, vc.opsi),
            'Harga Delta': pick(r, vc.delta) || '0',
            Default: pick(r, vc.def) || 'TIDAK',
            Urutan: pick(r, vc.urutan) || '0',
          }
          if (!data['Produk']) return add(rowNo, data, 'ERROR', 'Kolom Produk wajib diisi (lembar Varian Grup)')
          if (!data['Grup']) return add(rowNo, data, 'ERROR', 'Kolom Grup wajib diisi (lembar Varian Grup)')
          if (!data['Opsi']) return add(rowNo, data, 'ERROR', 'Kolom Opsi wajib diisi (lembar Varian Grup)')
          const lower = data['Produk'].toLowerCase()
          if (!byName.has(lower) && !fileNames.has(lower)) {
            return add(rowNo, data, 'ERROR', `Produk "${data['Produk']}" tidak ditemukan — tambahkan dulu di lembar Produk`)
          }
          const key = `${lower}|${data['Grup'].toLowerCase()}|${data['Opsi'].toLowerCase()}`
          if (seenV.has(key)) return add(rowNo, data, 'ERROR', `Opsi "${data['Opsi']}" duplikat untuk grup "${data['Grup']}"`)
          seenV.add(key)
          if (!['SINGLE', 'MULTI'].includes(data['Tipe'])) return add(rowNo, data, 'ERROR', 'Tipe harus SINGLE atau MULTI')
          if (byName.has(lower)) add(rowNo, data, 'UPDATE', 'Grup varian produk ini akan diganti seluruhnya')
          else add(rowNo, data, 'NEW')
        })
      }
    }
    return { rows, counts }
  }

  if (type === 'STOCK') {
    const s = readSheet(wb, ['Bahan Stok', 'Stok', 'Stock'])
    if (!s) throw new Error('Berkas kosong atau tidak memiliki lembar data')
    if (s.data.length > MAX_ROWS) throw new Error(`Berkas melebihi ${MAX_ROWS} baris data — pecah menjadi beberapa berkas`)
    const c = {
      sku: colIndex(s.headers, 'SKU'),
      nama: colIndex(s.headers, 'Nama'),
      satuan: colIndex(s.headers, 'Satuan'),
      jumlah: colIndex(s.headers, 'Jumlah'),
      ambang: colIndex(s.headers, 'Ambang Rendah'),
      biaya: colIndex(s.headers, 'Biaya Satuan'),
      aktif: colIndex(s.headers, 'Aktif'),
    }
    const existing = await db.stockItem.findMany()
    const bySku = new Map(existing.map((i) => [i.sku.toUpperCase(), i]))
    const seen = new Set<string>()
    s.data.forEach((r, i) => {
      const rowNo = i + 2
      const data: Record<string, string> = {
        SKU: pick(r, c.sku).toUpperCase(),
        Nama: pick(r, c.nama),
        Satuan: pick(r, c.satuan) || 'pcs',
        Jumlah: pick(r, c.jumlah) || '0',
        'Ambang Rendah': pick(r, c.ambang) || '0',
        'Biaya Satuan': pick(r, c.biaya) || '0',
        Aktif: pick(r, c.aktif) || 'YA',
      }
      if (!data['SKU']) return add(rowNo, data, 'ERROR', 'SKU wajib diisi')
      if (!data['Nama']) return add(rowNo, data, 'ERROR', 'Nama wajib diisi')
      if (seen.has(data['SKU'])) return add(rowNo, data, 'ERROR', `SKU ${data['SKU']} duplikat di dalam berkas`)
      seen.add(data['SKU'])
      if (parseNum(data['Jumlah']) === null || numOr(data['Jumlah'], -1) < 0) return add(rowNo, data, 'ERROR', 'Jumlah harus angka ≥ 0')
      const ex = bySku.get(data['SKU'])
      if (ex) {
        return add(rowNo, data, 'UPDATE', undefined, {
          SKU: ex.sku,
          Nama: ex.name,
          Satuan: ex.unit,
          Jumlah: String(ex.qty),
          'Ambang Rendah': String(ex.lowThreshold),
          'Biaya Satuan': String(ex.unitCost),
          Aktif: ex.isActive ? 'YA' : 'TIDAK',
        })
      }
      add(rowNo, data, 'NEW')
    })
    return { rows, counts }
  }

  if (type === 'RECIPES') {
    const s = readSheet(wb, ['Resep', 'Recipes'])
    if (!s) throw new Error('Berkas kosong atau tidak memiliki lembar data')
    if (s.data.length > MAX_ROWS) throw new Error(`Berkas melebihi ${MAX_ROWS} baris data — pecah menjadi beberapa berkas`)
    const c = {
      produk: colIndex(s.headers, 'Produk'),
      sku: colIndex(s.headers, 'SKU Bahan'),
      qty: colIndex(s.headers, 'Takaran per Porsi'),
    }
    const [products, stock, recipes] = await Promise.all([
      db.product.findMany({ select: { id: true, name: true } }),
      db.stockItem.findMany({ select: { id: true, sku: true } }),
      db.recipeItem.findMany({ select: { productId: true, stockItemId: true, qtyPerUnit: true } }),
    ])
    const prodByLower = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]))
    const stockBySku = new Map(stock.map((i) => [i.sku.toUpperCase(), i]))
    const qtyByProductStock = new Map<string, number>()
    for (const r of recipes) qtyByProductStock.set(`${r.productId}|${r.stockItemId}`, r.qtyPerUnit)
    const stockIdByProduct = new Map<string, Set<string>>()
    for (const r of recipes) {
      const set = stockIdByProduct.get(r.productId) ?? new Set<string>()
      set.add(r.stockItemId)
      stockIdByProduct.set(r.productId, set)
    }
    const seen = new Set<string>()
    s.data.forEach((r, i) => {
      const rowNo = i + 2
      const data: Record<string, string> = {
        Produk: pick(r, c.produk),
        'SKU Bahan': pick(r, c.sku).toUpperCase(),
        'Takaran per Porsi': pick(r, c.qty),
      }
      if (!data['Produk']) return add(rowNo, data, 'ERROR', 'Kolom Produk wajib diisi')
      const prod = prodByLower.get(data['Produk'].toLowerCase())
      if (!prod) return add(rowNo, data, 'ERROR', `Produk "${data['Produk']}" tidak ditemukan`)
      if (!data['SKU Bahan']) return add(rowNo, data, 'ERROR', 'SKU Bahan wajib diisi')
      const item = stockBySku.get(data['SKU Bahan'])
      if (!item) return add(rowNo, data, 'ERROR', `SKU "${data['SKU Bahan']}" tidak terdaftar di Data Stok`)
      const qty = parseNum(data['Takaran per Porsi'])
      if (qty === null || qty <= 0) return add(rowNo, data, 'ERROR', 'Takaran per Porsi harus angka > 0')
      const key = `${prod.id}|${item.id}`
      if (seen.has(key)) return add(rowNo, data, 'ERROR', `Bahan ${data['SKU Bahan']} duplikat untuk produk "${data['Produk']}"`)
      seen.add(key)
      const hasRecipe = (stockIdByProduct.get(prod.id)?.size ?? 0) > 0
      const curQty = qtyByProductStock.get(key)
      if (hasRecipe && curQty !== undefined) {
        return add(rowNo, data, 'UPDATE', undefined, {
          Produk: data['Produk'],
          'SKU Bahan': data['SKU Bahan'],
          'Takaran per Porsi': String(curQty),
        })
      }
      add(rowNo, data, hasRecipe ? 'UPDATE' : 'NEW', hasRecipe ? 'Bahan baru ditambahkan ke resep yang sudah ada' : undefined)
    })
    return { rows, counts }
  }

  // USERS
  const s = readSheet(wb, ['Pengguna', 'Users'])
  if (!s) throw new Error('Berkas kosong atau tidak memiliki lembar data')
  if (s.data.length > MAX_ROWS) throw new Error(`Berkas melebihi ${MAX_ROWS} baris data — pecah menjadi beberapa berkas`)
  const c = {
    username: colIndex(s.headers, 'Username'),
    nama: colIndex(s.headers, 'Nama'),
    peran: colIndex(s.headers, 'Peran'),
    pin: colIndex(s.headers, 'PIN'),
    aktif: colIndex(s.headers, 'Aktif'),
    latihan: colIndex(s.headers, 'Latihan'),
  }
  const existing = await db.user.findMany()
  const byUsername = new Map(existing.map((u) => [u.username.trim().toLowerCase(), u]))
  const seen = new Set<string>()
  s.data.forEach((r, i) => {
    const rowNo = i + 2
    const data: Record<string, string> = {
      Username: pick(r, c.username).toLowerCase(),
      Nama: pick(r, c.nama),
      Peran: pick(r, c.peran).toUpperCase(),
      PIN: pick(r, c.pin),
      Aktif: pick(r, c.aktif) || 'YA',
      Latihan: pick(r, c.latihan) || 'TIDAK',
    }
    if (!data['Username']) return add(rowNo, data, 'ERROR', 'Username wajib diisi')
    if (!/^[a-z0-9._-]{3,20}$/.test(data['Username'])) {
      return add(rowNo, data, 'ERROR', 'Username 3–20 karakter, hanya huruf kecil/angka/titik/garis bawah/tanda hubung')
    }
    if (!data['Nama']) return add(rowNo, data, 'ERROR', 'Nama wajib diisi')
    if (seen.has(data['Username'])) return add(rowNo, data, 'ERROR', `Username "${data['Username']}" duplikat di dalam berkas`)
    seen.add(data['Username'])
    if (!['ADMIN', 'CASHIER', 'BARISTA'].includes(data['Peran'])) {
      return add(rowNo, data, 'ERROR', 'Peran harus ADMIN, CASHIER, atau BARISTA')
    }
    if (data['PIN'] && !/^\d{4,6}$/.test(data['PIN'])) return add(rowNo, data, 'ERROR', 'PIN harus 4–6 digit angka')
    const ex = byUsername.get(data['Username'])
    if (ex) {
      return add(rowNo, data, 'UPDATE', undefined, {
        Username: ex.username,
        Nama: ex.name,
        Peran: ex.role,
        PIN: ex.pin ? '(terpasang)' : '',
        Aktif: ex.isActive ? 'YA' : 'TIDAK',
        Latihan: ex.isTraining ? 'YA' : 'TIDAK',
      })
    }
    add(rowNo, data, 'NEW', 'Kata sandi default: password123')
  })
  return { rows, counts }
}

// ---------- Import: transactional apply ----------

export async function applyImport(
  type: ImportType,
  rows: ImportRow[],
  actor: SessionUser,
  fileName?: string
): Promise<ImportResult> {
  const snapshotSaved = await saveSnapshot(type)
  const valid = rows.filter((r) => r.status !== 'ERROR')
  const failed: { row: number; message: string }[] = []
  let inserted = 0
  let updated = 0

  if (type === 'PRODUCTS') {
    const productRows = valid.filter((r) => r.data['__sheet'] !== 'varian')
    const variantRows = valid.filter((r) => r.data['__sheet'] === 'varian')

    await db.$transaction(async (tx) => {
      // category resolution (create if missing)
      const catNames = new Map<string, string>()
      for (const r of productRows) {
        const c = (r.data['Kategori'] ?? '').trim()
        if (c) catNames.set(c.toLowerCase(), c)
      }
      const allCats = await tx.category.findMany({ select: { id: true, name: true } })
      const catByLower = new Map(allCats.map((c) => [c.name.trim().toLowerCase(), c]))
      const maxSort = await tx.category.aggregate({ _max: { sortOrder: true } })
      let nextSort = (maxSort._max.sortOrder ?? 0) + 1
      const catId = new Map<string, string>()
      for (const [lower, name] of catNames) {
        const ex = catByLower.get(lower)
        if (ex) {
          catId.set(lower, ex.id)
        } else {
          const created = await tx.category.create({ data: { name, sortOrder: nextSort++ } })
          catId.set(lower, created.id)
        }
      }

      // products upsert by name
      const allProducts = await tx.product.findMany({ select: { id: true, name: true } })
      const prodByLower = new Map(allProducts.map((p) => [p.name.trim().toLowerCase(), p]))
      const idByName = new Map<string, string>()
      for (const r of productRows) {
        const d = r.data
        const name = (d['Nama'] ?? '').trim()
        const lower = name.toLowerCase()
        const catKey = (d['Kategori'] ?? '').trim().toLowerCase()
        const categoryId = catId.get(catKey)
        const harga = parseNum(d['Harga Dasar'])
        if (!name || !categoryId || harga === null || harga < 0) {
          failed.push({ row: r.row, message: 'Data baris tidak valid saat diterapkan' })
          continue
        }
        const unitCostRaw = parseNum(d['Harga Satuan'])
        const payload = {
          categoryId,
          description: d['Deskripsi']?.trim() || null,
          imageUrl: d['URL Gambar']?.trim() || null,
          basePrice: Math.round(harga),
          unitCost: unitCostRaw === null || isNaN(unitCostRaw) ? null : Math.round(unitCostRaw),
          isActive: parseBool(d['Aktif'], true),
          isAvailable: parseBool(d['Tersedia'], true),
          sortOrder: intOr(d['Urutan'], 0),
        }
        const ex = prodByLower.get(lower)
        if (ex) {
          await tx.product.update({ where: { id: ex.id }, data: payload })
          idByName.set(lower, ex.id)
          updated += 1
        } else {
          const created = await tx.product.create({ data: { name, ...payload } })
          idByName.set(lower, created.id)
          inserted += 1
        }
      }

      // variant groups: replace per product
      const byProduct = new Map<string, ImportRow[]>()
      for (const r of variantRows) {
        const lower = (r.data['Produk'] ?? '').trim().toLowerCase()
        const list = byProduct.get(lower) ?? []
        list.push(r)
        byProduct.set(lower, list)
      }
      for (const [lower, vrows] of byProduct) {
        const pid = idByName.get(lower) ?? prodByLower.get(lower)?.id
        if (!pid) {
          for (const r of vrows) failed.push({ row: r.row, message: `Produk "${r.data['Produk']}" tidak ditemukan` })
          continue
        }
        const existedBefore = prodByLower.has(lower)
        await tx.variantOption.deleteMany({ where: { group: { productId: pid } } })
        await tx.variantGroup.deleteMany({ where: { productId: pid } })
        const groups = new Map<string, ImportRow[]>()
        for (const r of vrows) {
          const g = (r.data['Grup'] ?? '').trim().toLowerCase()
          const list = groups.get(g) ?? []
          list.push(r)
          groups.set(g, list)
        }
        let gsort = 0
        for (const [, grows] of groups) {
          const first = grows[0].data
          const g = await tx.variantGroup.create({
            data: {
              productId: pid,
              name: (first['Grup'] ?? '').trim(),
              selectionType: ['SINGLE', 'MULTI'].includes((first['Tipe'] ?? '').toUpperCase()) ? (first['Tipe'] as string).toUpperCase() : 'SINGLE',
              isRequired: parseBool(first['Wajib'], false),
              minSelect: intOr(first['Min'], 0),
              maxSelect: Math.max(1, intOr(first['Maks'], 1)),
              sortOrder: gsort++,
            },
          })
          await tx.variantOption.createMany({
            data: grows.map((r, i) => ({
              groupId: g.id,
              label: (r.data['Opsi'] ?? '').trim(),
              priceDelta: intOr(r.data['Harga Delta'], 0),
              isDefault: parseBool(r.data['Default'], false),
              sortOrder: intOr(r.data['Urutan'], i),
            })),
          })
        }
        if (existedBefore) updated += 1
        else inserted += 1
      }
    })
  } else if (type === 'STOCK') {
    await db.$transaction(async (tx) => {
      const items = await tx.stockItem.findMany()
      const bySku = new Map(items.map((i) => [i.sku.toUpperCase(), i]))
      for (const r of valid) {
        const d = r.data
        const sku = (d['SKU'] ?? '').trim().toUpperCase()
        const qty = numOr(d['Jumlah'], 0)
        if (!sku || !(d['Nama'] ?? '').trim() || qty < 0) {
          failed.push({ row: r.row, message: 'Data baris tidak valid saat diterapkan' })
          continue
        }
        const payload = {
          name: d['Nama'].trim(),
          unit: d['Satuan']?.trim() || 'pcs',
          lowThreshold: numOr(d['Ambang Rendah'], 0),
          unitCost: numOr(d['Biaya Satuan'], 0),
          isActive: parseBool(d['Aktif'], true),
        }
        const ex = bySku.get(sku)
        if (ex) {
          await tx.stockItem.update({ where: { id: ex.id }, data: payload })
          if (Math.abs(qty - ex.qty) > 1e-9) {
            await tx.stockMovement.create({
              data: {
                stockItemId: ex.id,
                type: 'ADJUSTMENT',
                qtyDelta: qty - ex.qty,
                resultingQty: qty,
                reason: `Impor Excel${fileName ? ` — ${fileName}` : ''}`,
                userId: actor.id,
              },
            })
            await tx.stockItem.update({ where: { id: ex.id }, data: { qty } })
          }
          updated += 1
        } else {
          const created = await tx.stockItem.create({ data: { sku, ...payload, qty } })
          if (qty > 0) {
            await tx.stockMovement.create({
              data: {
                stockItemId: created.id,
                type: 'RESTOCK_IN',
                qtyDelta: qty,
                resultingQty: qty,
                reason: 'Stok awal (impor Excel)',
                userId: actor.id,
              },
            })
          }
          inserted += 1
        }
      }
    })
  } else if (type === 'RECIPES') {
    await db.$transaction(async (tx) => {
      const [products, stock, recipes] = await Promise.all([
        tx.product.findMany({ select: { id: true, name: true } }),
        tx.stockItem.findMany({ select: { id: true, sku: true } }),
        tx.recipeItem.findMany({ select: { productId: true } }),
      ])
      const prodByLower = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]))
      const stockBySku = new Map(stock.map((i) => [i.sku.toUpperCase(), i]))
      const hadRecipe = new Set(recipes.map((r) => r.productId))
      const byProduct = new Map<string, { row: number; stockItemId: string; qty: number }[]>()
      for (const r of valid) {
        const d = r.data
        const prod = prodByLower.get((d['Produk'] ?? '').trim().toLowerCase())
        const item = stockBySku.get((d['SKU Bahan'] ?? '').trim().toUpperCase())
        const qty = numOr(d['Takaran per Porsi'], 0)
        if (!prod || !item || qty <= 0) {
          failed.push({ row: r.row, message: 'Produk/SKU tidak ditemukan atau takaran tidak valid saat diterapkan' })
          continue
        }
        const list = byProduct.get(prod.id) ?? []
        list.push({ row: r.row, stockItemId: item.id, qty })
        byProduct.set(prod.id, list)
      }
      for (const [productId, lines] of byProduct) {
        await tx.recipeItem.deleteMany({ where: { productId } })
        await tx.recipeItem.createMany({ data: lines.map((l) => ({ productId, stockItemId: l.stockItemId, qtyPerUnit: l.qty })) })
        if (hadRecipe.has(productId)) updated += 1
        else inserted += 1
      }
    })
  } else if (type === 'USERS') {
    const defaultHash = await hashPassword('password123')
    await db.$transaction(async (tx) => {
      const users = await tx.user.findMany({ select: { id: true, username: true } })
      const byLower = new Map(users.map((u) => [u.username.trim().toLowerCase(), u]))
      for (const r of valid) {
        const d = r.data
        const username = (d['Username'] ?? '').trim().toLowerCase()
        const peran = (d['Peran'] ?? '').trim().toUpperCase()
        if (!username || !(d['Nama'] ?? '').trim() || !['ADMIN', 'CASHIER', 'BARISTA'].includes(peran)) {
          failed.push({ row: r.row, message: 'Data baris tidak valid saat diterapkan' })
          continue
        }
        const pin = d['PIN']?.trim() || null
        const payload = {
          name: d['Nama'].trim(),
          role: peran,
          pin: pin && /^\d{4,6}$/.test(pin) ? pin : null,
          isActive: parseBool(d['Aktif'], true),
          isTraining: parseBool(d['Latihan'], false),
        }
        const ex = byLower.get(username)
        if (ex) {
          await tx.user.update({ where: { id: ex.id }, data: payload })
          updated += 1
        } else {
          await tx.user.create({ data: { username, ...payload, passwordHash: defaultHash } })
          inserted += 1
        }
      }
    })
  }

  await audit(actor, 'data.import', 'Import', {
    label: `${type}${fileName ? ` — ${fileName}` : ''}`,
    after: { inserted, updated, failed: failed.length, snapshotSaved },
  })

  return { inserted, updated, failed, snapshotSaved }
}

/** Pre-import automatic snapshot (SPEC §1.8) — best-effort xlsx copy of the current data. */
async function saveSnapshot(type: ImportType): Promise<boolean> {
  try {
    const buf =
      type === 'PRODUCTS'
        ? await exportProducts()
        : type === 'STOCK'
          ? await exportStock()
          : type === 'USERS'
            ? await exportUsers()
            : await exportRecipesAll()
    const dir = path.join(process.cwd(), 'db', 'snapshots')
    await fs.mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await fs.writeFile(path.join(dir, `snapshot-${type.toLowerCase()}-${stamp}.xlsx`), buf)
    return true
  } catch {
    return false
  }
}

// ---------- Export serializers ----------

const dateStart = (d: string) => new Date(d + 'T00:00:00+07:00')
const dateEnd = (d: string) => new Date(d + 'T23:59:59+07:00')

const MOVEMENT_LABELS: Record<string, string> = {
  RESTOCK_IN: 'Masuk (Restock)',
  SALE_DEDUCT: 'Terjual',
  WASTE: 'Limbah',
  ADJUSTMENT: 'Penyesuaian',
  COUNT_VARIANCE: 'Variansi Opname',
  MANUAL_OUT: 'Keluar Manual',
}

function infoBlock(title: string, subtitle: string): (string | number)[][] {
  return [
    [title],
    ['Sekelas Cafe — SMKN 1 Boyolangu'],
    [subtitle],
    [`Diunduh: ${formatDateTime(new Date())}`],
    [],
  ]
}

export async function exportOrders(from: string, to: string): Promise<Buffer> {
  const orders = await db.order.findMany({
    where: { businessDate: { gte: from, lte: to } },
    include: { items: true, payments: true, cashier: { select: { name: true } } },
    orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
  })
  const s1: (string | number)[][] = [
    ...infoBlock('EKSPOR PESANAN', `Rentang: ${from} s.d. ${to}`),
    ['Tanggal', 'Kode', 'Tipe', 'Status', 'Sumber', 'Kasir', 'Pelanggan', 'Subtotal', 'Diskon', 'Ongkir', 'Pajak', 'Total', 'Item', 'Pembayaran'],
  ]
  const s2: (string | number)[][] = [
    ['Tanggal', 'Kode Pesanan', 'Produk', 'Varian', 'Qty', 'Harga Satuan', 'Total Baris', 'Dibatalkan', 'Alasan'],
  ]
  let sumSub = 0, sumDisc = 0, sumFee = 0, sumTax = 0, sumTotal = 0
  for (const o of orders) {
    const items = o.items.map((i) => `${i.qty}x ${i.nameSnapshot}`).join('; ')
    const payments = o.payments
      .filter((p) => p.status !== 'REJECTED')
      .map((p) => `${p.method === 'CASH' ? 'TUNAI' : 'QRIS'} ${p.amount}${p.status === 'PENDING_VERIFICATION' ? ' (CEK)' : ''}`)
      .join('; ')
    s1.push([
      o.businessDate,
      o.code,
      ORDER_TYPE_LABEL[o.type as keyof typeof ORDER_TYPE_LABEL] ?? o.type,
      ORDER_STATUS_LABEL[o.status as keyof typeof ORDER_STATUS_LABEL] ?? o.status,
      o.source,
      o.cashier?.name ?? '',
      o.customerName ?? o.tableLabel ?? '',
      o.subtotal,
      o.discountTotal,
      o.deliveryFee,
      o.taxTotal,
      o.total,
      items,
      payments,
    ])
    sumSub += o.subtotal; sumDisc += o.discountTotal; sumFee += o.deliveryFee; sumTax += o.taxTotal; sumTotal += o.total
    for (const it of o.items) {
      const vs = Array.isArray(it.variantSnapshot)
        ? (it.variantSnapshot as { label?: string }[]).map((v) => v?.label).filter(Boolean).join(', ')
        : ''
      s2.push([
        o.businessDate,
        o.code,
        it.nameSnapshot,
        vs,
        it.qty,
        it.unitPrice,
        it.lineTotal,
        it.isVoided ? 'YA' : 'TIDAK',
        it.voidReason ?? '',
      ])
    }
  }
  s1.push(['', '', '', '', '', 'TOTAL', '', sumSub, sumDisc, sumFee, sumTax, sumTotal, '', ''])
  return buildWorkbook([
    { name: 'Pesanan', rows: s1 },
    { name: 'Rincian Item', rows: s2 },
  ])
}

export async function exportProducts(): Promise<Buffer> {
  const products = await db.product.findMany({
    include: {
      category: { select: { name: true } },
      variantGroups: { include: { options: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: [{ category: { name: 'asc' } }, { sortOrder: 'asc' }],
  })
  const s1: (string | number)[][] = [
    ...infoBlock('EKSPOR PRODUK', `${products.length} produk (termasuk nonaktif)`),
    ['Nama', 'Kategori', 'Deskripsi', 'URL Gambar', 'Harga Dasar', 'Harga Satuan', 'Aktif', 'Tersedia', 'Urutan'],
  ]
  const s2: (string | number)[][] = [['Produk', 'Grup', 'Tipe', 'Wajib', 'Min', 'Maks', 'Opsi', 'Harga Delta', 'Default', 'Urutan']]
  for (const p of products) {
    s1.push([
      p.name,
      p.category.name,
      p.description ?? '',
      p.imageUrl ?? '',
      p.basePrice,
      p.unitCost ?? '',
      p.isActive ? 'YA' : 'TIDAK',
      p.isAvailable ? 'YA' : 'TIDAK',
      p.sortOrder,
    ])
    for (const g of p.variantGroups) {
      for (const o of g.options) {
        s2.push([
          p.name,
          g.name,
          g.selectionType,
          g.isRequired ? 'YA' : 'TIDAK',
          g.minSelect,
          g.maxSelect,
          o.label,
          o.priceDelta,
          o.isDefault ? 'YA' : 'TIDAK',
          o.sortOrder,
        ])
      }
    }
  }
  return buildWorkbook([
    { name: 'Produk', rows: s1 },
    { name: 'Varian Grup', rows: s2 },
  ])
}

export async function exportStock(): Promise<Buffer> {
  const items = await db.stockItem.findMany({ orderBy: { name: 'asc' } })
  const rows: (string | number)[][] = [
    ...infoBlock('EKSPOR BAHAN STOK', `${items.length} item`),
    ['SKU', 'Nama', 'Satuan', 'Jumlah', 'Ambang Rendah', 'Status', 'Biaya Satuan', 'Nilai Stok', 'Aktif'],
  ]
  for (const i of items) {
    const status = i.qty <= 0 ? 'HABIS' : i.qty <= i.lowThreshold ? 'RENDAH' : 'AMAN'
    rows.push([i.sku, i.name, i.unit, i.qty, i.lowThreshold, status, i.unitCost, Math.round(i.qty * i.unitCost), i.isActive ? 'YA' : 'TIDAK'])
  }
  return buildWorkbook([{ name: 'Bahan Stok', rows }])
}

export async function exportMovements(from: string, to: string): Promise<Buffer> {
  const movs = await db.stockMovement.findMany({
    where: { createdAt: { gte: dateStart(from), lte: dateEnd(to) } },
    include: { stockItem: { select: { sku: true, name: true } }, user: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const refIds = [...new Set(movs.map((m) => m.refOrderId).filter((v): v is string => !!v))]
  const orders = refIds.length > 0 ? await db.order.findMany({ where: { id: { in: refIds } }, select: { id: true, code: true } }) : []
  const codeById = new Map(orders.map((o) => [o.id, o.code]))
  const rows: (string | number)[][] = [
    ...infoBlock('EKSPOR PERGERAKAN STOK', `Rentang: ${from} s.d. ${to}`),
    ['Waktu', 'SKU', 'Nama', 'Tipe', 'Perubahan', 'Sisa', 'Pesanan', 'Alasan', 'Catatan', 'Pengguna'],
  ]
  for (const m of movs) {
    rows.push([
      formatDateTime(m.createdAt),
      m.stockItem.sku,
      m.stockItem.name,
      MOVEMENT_LABELS[m.type] ?? m.type,
      m.qtyDelta,
      m.resultingQty,
      m.refOrderId ? (codeById.get(m.refOrderId) ?? '') : '',
      m.reason ?? '',
      m.note ?? '',
      m.user?.name ?? '',
    ])
  }
  return buildWorkbook([{ name: 'Pergerakan Stok', rows }])
}

export async function exportUsers(): Promise<Buffer> {
  const users = await db.user.findMany({ orderBy: { username: 'asc' } })
  const rows: (string | number)[][] = [
    ...infoBlock('EKSPOR PENGGUNA', `${users.length} akun staf`),
    ['Username', 'Nama', 'Peran', 'Aktif', 'Latihan', 'PIN', 'Login Terakhir'],
  ]
  for (const u of users) {
    rows.push([
      u.username,
      u.name,
      u.role,
      u.isActive ? 'YA' : 'TIDAK',
      u.isTraining ? 'YA' : 'TIDAK',
      u.pin ? 'TERPASANG' : '',
      u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '',
    ])
  }
  return buildWorkbook([{ name: 'Pengguna', rows }])
}

/** Recipes full export (also used as the pre-import snapshot for RECIPES). */
export async function exportRecipesAll(): Promise<Buffer> {
  const recipes = await db.recipeItem.findMany({
    include: { product: { select: { name: true } }, stockItem: { select: { sku: true } } },
    orderBy: [{ product: { name: 'asc' } }, { stockItem: { sku: 'asc' } }],
  })
  const rows: (string | number)[][] = [
    ...infoBlock('EKSPOR RESEP', `${new Set(recipes.map((r) => r.productId)).size} produk berresep`),
    ['Produk', 'SKU Bahan', 'Takaran per Porsi'],
  ]
  for (const r of recipes) rows.push([r.product.name, r.stockItem.sku, r.qtyPerUnit])
  return buildWorkbook([{ name: 'Resep', rows }])
}

export async function exportAudit(
  from: string,
  to: string,
  filters: { userId?: string; action?: string; entity?: string } = {}
): Promise<Buffer> {
  const where: Record<string, unknown> = { createdAt: { gte: dateStart(from), lte: dateEnd(to) } }
  if (filters.userId) where.userId = filters.userId
  if (filters.action) where.action = { contains: filters.action }
  if (filters.entity) where.entity = { contains: filters.entity }
  const logs = await db.auditLog.findMany({
    where,
    include: { user: { select: { name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  })
  const activeFilters = [
    filters.userId ? logs.find((l) => l.userId === filters.userId)?.user?.name ?? 'pelaku terpilih' : null,
    filters.action ? `aksi ~ "${filters.action}"` : null,
    filters.entity ? `entitas ~ "${filters.entity}"` : null,
  ].filter(Boolean)
  const rows: (string | number)[][] = [
    ...infoBlock(
      'EKSPOR LOG AKTIVITAS',
      `Rentang: ${from} s.d. ${to} — ${logs.length} entri${activeFilters.length > 0 ? ` (filter: ${activeFilters.join(', ')})` : ''}`
    ),
    ['Waktu', 'Pengguna', 'Peran', 'Aksi', 'Entitas', 'ID Entitas', 'Label', 'Sebelum', 'Sesudah'],
  ]
  for (const l of logs) {
    rows.push([
      formatDateTime(l.createdAt),
      l.user?.name ?? '(sistem)',
      l.user?.role ?? '',
      l.action,
      l.entity,
      l.entityId ?? '',
      l.label ?? '',
      l.before === null ? '' : JSON.stringify(l.before),
      l.after === null ? '' : JSON.stringify(l.after),
    ])
  }
  return buildWorkbook([{ name: 'Log Aktivitas', rows }])
}

// ---------- Daily report pack ----------

export async function exportDailyPack(businessDate: string): Promise<Buffer> {
  const snap = await computeDayReport(businessDate)
  const [payments, movements] = await Promise.all([
    db.payment.findMany({
      where: { order: { businessDate, isTraining: false } },
      include: { order: { select: { code: true } }, verifiedBy: { select: { name: true } } },
      orderBy: { paidAt: 'asc' },
    }),
    db.stockMovement.findMany({
      where: { createdAt: { gte: dateStart(businessDate), lte: dateEnd(businessDate) } },
      include: {
        stockItem: { select: { sku: true, name: true, unit: true, unitCost: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  const lowStock = await db.stockItem.findMany({ where: { isActive: true }, orderBy: { qty: 'asc' } })

  const ringkasan: (string | number)[][] = [
    ['LAPORAN HARIAN — SEKELAS CAFE'],
    [`Tanggal: ${snap.businessDate}`],
    [`Diunduh: ${formatDateTime(new Date())}`],
    [],
    ['PENJUALAN'],
    ['Pendapatan Kotor', snap.gross],
    ['Diskon', snap.discounts],
    ['Pembatalan (Void)', snap.voids],
    ['Ongkir Antar', snap.deliveryFees],
    ['Pajak', snap.taxTotal],
    ['Pendapatan Bersih', snap.net],
    ['Jumlah Pesanan', snap.orderCount],
    ['Item Terjual', snap.itemCount],
    [],
    ['KAS'],
    ['Modal Awal', snap.openingFloat],
    ['Uang Masuk', snap.cashIn],
    ['Uang Keluar', snap.cashOut],
    ['Pembayaran Tunai', snap.cashTotal],
    ['Kas Diharapkan', snap.expectedCash],
    ...(snap.countedCash !== null
      ? ([['Kas Dihitung', snap.countedCash], ['Selisih Kas', snap.variance ?? 0]] as (string | number)[][])
      : []),
    [],
    ['QRIS'],
    ['Total QRIS', snap.qrisTotal],
    ...(snap.merchantQrisTotal !== null
      ? ([['Mutasi Aplikasi Merchant', snap.merchantQrisTotal], ['Selisih QRIS', snap.merchantQrisVariance ?? 0]] as (string | number)[][])
      : []),
    [],
    ['TIPE LAYANAN'],
    ...Object.entries(snap.byType).map(([t, v]) => [t, v.count, v.revenue] as (string | number)[]),
  ]

  const produkRevenue = snap.topProducts.reduce((s, p) => s + p.revenue, 0)
  const produk: (string | number)[][] = [
    ['Peringkat', 'Produk', 'Qty', 'Pendapatan', 'Kontribusi %'],
    ...snap.topProducts.map((p, i) => [i + 1, p.name, p.qty, p.revenue, produkRevenue > 0 ? Math.round((p.revenue / produkRevenue) * 1000) / 10 : 0]),
  ]

  const perJam: (string | number)[][] = [['Jam', 'Pendapatan', 'Pesanan'], ...snap.byHour.map((h) => [`${h.hour}.00`, h.revenue, h.orders])]

  const pembayaran: (string | number)[][] = [
    ['Waktu', 'Kode Pesanan', 'Metode', 'Nominal', 'Status', 'Referensi', 'Verifikator'],
    ...payments.map((p) => [
      formatDateTime(p.paidAt),
      p.order.code,
      p.method === 'CASH' ? 'TUNAI' : 'QRIS',
      p.amount,
      p.status === 'CONFIRMED' ? 'Terkonfirmasi' : p.status === 'PENDING_VERIFICATION' ? 'Menunggu Verifikasi' : 'Ditolak',
      p.qrReference ?? '',
      p.verifiedBy?.name ?? '',
    ]),
  ]

  const voids: (string | number)[][] = [
    ['Waktu', 'Kode', 'Alasan', 'Nominal', 'Oleh'],
    ...snap.voidsList.map((v) => [formatDateTime(v.at), v.code, v.reason, v.amount, v.by ?? '']),
  ]

  const stok: (string | number)[][] = [
    ['PERGERAKAN STOK'],
    ['Waktu', 'SKU', 'Nama', 'Tipe', 'Perubahan', 'Sisa', 'Pengguna'],
    ...movements.map((m) => [
      formatDateTime(m.createdAt),
      m.stockItem.sku,
      m.stockItem.name,
      MOVEMENT_LABELS[m.type] ?? m.type,
      m.qtyDelta,
      m.resultingQty,
      m.user?.name ?? '',
    ]),
    [],
    ['STOK RENDAH / HABIS'],
    ['SKU', 'Nama', 'Jumlah', 'Ambang', 'Satuan'],
    ...lowStock
      .filter((i) => i.qty <= i.lowThreshold)
      .map((i) => [i.sku, i.name, i.qty, i.lowThreshold, i.unit]),
  ]

  // Waste totals per item for the date (SPEC §3.13 daily pack — "Limbah").
  const wasteAgg = new Map<string, { sku: string; name: string; unit: string; qty: number; value: number }>()
  for (const m of movements) {
    if (m.type !== 'WASTE') continue
    const cur =
      wasteAgg.get(m.stockItemId) ??
      { sku: m.stockItem.sku, name: m.stockItem.name, unit: m.stockItem.unit, qty: 0, value: 0 }
    cur.qty += Math.abs(m.qtyDelta)
    cur.value += Math.abs(m.qtyDelta) * m.stockItem.unitCost
    wasteAgg.set(m.stockItemId, cur)
  }
  const wasteRows = [...wasteAgg.values()].sort((a, b) => b.value - a.value)
  const wasteTotal = wasteRows.reduce((s, w) => s + w.value, 0)
  const limbah: (string | number)[][] = [
    ['LIMBAH (WASTE) — SEKELAS CAFE'],
    [`Tanggal: ${snap.businessDate}`],
    [`Diunduh: ${formatDateTime(new Date())}`],
    [],
    ['SKU', 'Bahan', 'Satuan', 'Jumlah Terbuang', 'Perkiraan Nilai (Rp)'],
    ...wasteRows.map((w) => [w.sku, w.name, w.unit, Math.round(w.qty * 100) / 100, Math.round(w.value)]),
    ...(wasteRows.length === 0
      ? ([['—', 'Tidak ada limbah tercatat pada tanggal ini', '', 0, 0]] as (string | number)[][])
      : []),
    [],
    ['Total perkiraan kerugian', '', '', '', Math.round(wasteTotal)],
  ]

  return buildWorkbook([
    { name: 'Ringkasan', rows: ringkasan },
    { name: 'Produk', rows: produk },
    { name: 'Per Jam', rows: perJam },
    { name: 'Pembayaran', rows: pembayaran },
    { name: 'Voids', rows: voids },
    { name: 'Stok', rows: stok },
    { name: 'Limbah', rows: limbah },
  ])
}

// ---------- Report tab export (reports page "Ekspor Excel") ----------

export const REPORT_TABS = ['ringkasan', 'produk', 'pembayaran', 'jam', 'tipe', 'void', 'stok'] as const
export type ReportTab = (typeof REPORT_TABS)[number]

export async function exportReportTab(tab: ReportTab, from: string, to: string): Promise<Buffer> {
  const s = await getReportSummary(from, to)
  const header = infoBlock('LAPORAN SEKELAS CAFE', `Rentang: ${from} s.d. ${to}`)

  if (tab === 'ringkasan') {
    const rows: (string | number)[][] = [
      ...header,
      ['Pendapatan Kotor', s.gross],
      ['Diskon', s.discounts],
      ['Pembatalan (Void)', s.voids],
      ['Ongkir Antar', s.deliveryFees],
      ['Pajak', s.taxTotal],
      ['Pendapatan Bersih', s.net],
      ['Jumlah Pesanan', s.orderCount],
      ['Item Terjual', s.itemCount],
      ['Rata-rata per Pesanan (AOV)', s.aov],
      [],
      ['PEMBAYARAN'],
      ['Metode', 'Total', 'Transaksi'],
      ...s.byPayment.map((p) => [p.method === 'CASH' ? 'TUNAI' : p.method, p.total, p.count]),
      [],
      ['TIPE LAYANAN'],
      ['Tipe', 'Pesanan', 'Pendapatan'],
      ...s.byType.map((t) => [t.type, t.count, t.revenue]),
    ]
    return buildWorkbook([{ name: 'Ringkasan', rows }])
  }

  if (tab === 'produk') {
    return buildWorkbook([
      {
        name: 'Produk',
        rows: [
          ...header,
          ['Peringkat', 'Produk', 'Qty', 'Pendapatan', 'Kontribusi %'],
          ...s.productMix.map((p, i) => [i + 1, p.name, p.qty, p.revenue, Math.round(p.share * 1000) / 10]),
        ],
      },
    ])
  }

  if (tab === 'pembayaran') {
    const total = s.byPayment.reduce((sum, p) => sum + p.total, 0)
    return buildWorkbook([
      {
        name: 'Pembayaran',
        rows: [
          ...header,
          ['Metode', 'Total', 'Transaksi', 'Porsi %'],
          ...s.byPayment.map((p) => [p.method === 'CASH' ? 'TUNAI' : 'QRIS', p.total, p.count, total > 0 ? Math.round((p.total / total) * 1000) / 10 : 0]),
          [],
          ['PEMBAYARAN MENUNGGU VERIFIKASI'],
          ['Kode', 'Nominal', 'Waktu'],
          ...s.pendingPayments.map((p) => [p.code, p.amount, formatDateTime(p.at)]),
        ],
      },
    ])
  }

  if (tab === 'jam') {
    return buildWorkbook([
      { name: 'Per Jam', rows: [...header, ['Jam', 'Pendapatan', 'Pesanan'], ...s.hourly.map((h) => [`${h.hour}.00`, h.revenue, h.orders])] },
    ])
  }

  if (tab === 'tipe') {
    return buildWorkbook([
      {
        name: 'Tipe Layanan',
        rows: [
          ...header,
          ['Tipe', 'Pesanan', 'Pendapatan'],
          ...s.byType.map((t) => [ORDER_TYPE_LABEL[t.type as keyof typeof ORDER_TYPE_LABEL] ?? t.type, t.count, t.revenue]),
          [],
          ['Total Ongkir Antar', s.deliveryFees],
        ],
      },
    ])
  }

  if (tab === 'void') {
    return buildWorkbook([
      {
        name: 'Void & Pembatalan',
        rows: [
          ...header,
          ['Waktu', 'Kode', 'Oleh', 'Alasan', 'Nominal'],
          ...s.voidsList.map((v) => [formatDateTime(v.at), v.code, v.by ?? '', v.reason, v.amount]),
        ],
      },
    ])
  }

  const stokRows: (string | number)[][] = [
    ...header,
    ['Bahan', 'Satuan', 'Terpakai (Jual)', 'Terbuang (Waste)'],
    ...s.stockUsage.map((u) => [u.name, u.unit, u.consumed, u.wasted]),
  ]
  return buildWorkbook([{ name: 'Pemakaian Stok', rows: stokRows }])
}
