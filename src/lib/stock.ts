// Stock engine: attributed append-only movements, waste, restock, recipes with
// non-blocking deduction, counts/opname with COUNT_VARIANCE approvals.
import 'server-only'
import { db } from './db'
import { audit } from './audit'
import { emitRealtime } from './realtime'
import { getSettings } from './settings'
import type { SessionUser, StockCountDTO, StockItemDTO, StockMovementDTO, StockStatus } from './types'

function statusOf(qty: number, threshold: number): StockStatus {
  if (qty <= 0) return 'HABIS'
  if (qty <= threshold) return 'RENDAH'
  return 'AMAN'
}

export function toStockItemDTO(i: {
  id: string
  sku: string
  name: string
  unit: string
  qty: number
  lowThreshold: number
  unitCost: number
  isActive: boolean
  updatedAt: Date
}): StockItemDTO {
  return {
    id: i.id,
    sku: i.sku,
    name: i.name,
    unit: i.unit,
    qty: i.qty,
    lowThreshold: i.lowThreshold,
    unitCost: i.unitCost,
    isActive: i.isActive,
    status: statusOf(i.qty, i.lowThreshold),
    updatedAt: i.updatedAt.toISOString(),
  }
}

export async function listStockItems(filters: { search?: string; lowOnly?: boolean; unit?: string }) {
  const where: Record<string, unknown> = { isActive: true }
  if (filters.search) {
    const q = filters.search.trim()
    where.OR = [{ name: { contains: q } }, { sku: { contains: q.toUpperCase() } }]
  }
  if (filters.unit) where.unit = filters.unit
  const items = await db.stockItem.findMany({ where, orderBy: { name: 'asc' } })
  let dtos = items.map(toStockItemDTO)
  if (filters.lowOnly) dtos = dtos.filter((i) => i.status !== 'AMAN')
  const totalValue = dtos.reduce((s, i) => s + i.qty * i.unitCost, 0)
  return { items: dtos, totalValue }
}

export async function upsertStockItem(
  data: { id?: string; sku: string; name: string; unit: string; qty?: number; lowThreshold: number; unitCost?: number },
  actor: SessionUser
): Promise<StockItemDTO> {
  const sku = data.sku.trim().toUpperCase()
  if (!sku || !data.name.trim()) throw new Error('SKU dan nama wajib diisi')
  const dupe = await db.stockItem.findFirst({ where: { sku, ...(data.id ? { id: { not: data.id } } : {}) } })
  if (dupe) throw new Error(`SKU ${sku} sudah dipakai oleh "${dupe.name}"`)
  if (data.id) {
    const before = await db.stockItem.findUnique({ where: { id: data.id } })
    if (!before) throw new Error('Item tidak ditemukan')
    const updated = await db.stockItem.update({
      where: { id: data.id },
      data: { sku, name: data.name.trim(), unit: data.unit, lowThreshold: data.lowThreshold, unitCost: data.unitCost ?? 0 },
    })
    await audit(actor, 'stock.update', 'StockItem', { entityId: updated.id, label: updated.name, before: { name: before.name, sku: before.sku, lowThreshold: before.lowThreshold }, after: { name: updated.name, sku, lowThreshold: data.lowThreshold } })
    return toStockItemDTO(updated)
  }
  const created = await db.stockItem.create({
    data: { sku, name: data.name.trim(), unit: data.unit, qty: data.qty ?? 0, lowThreshold: data.lowThreshold, unitCost: data.unitCost ?? 0 },
  })
  // opening qty recorded as RESTOCK_IN movement
  if ((data.qty ?? 0) > 0) {
    await db.stockMovement.create({
      data: { stockItemId: created.id, type: 'RESTOCK_IN', qtyDelta: data.qty ?? 0, resultingQty: data.qty ?? 0, reason: 'Stok awal', userId: actor.id },
    })
  }
  await audit(actor, 'stock.create', 'StockItem', { entityId: created.id, label: created.name, after: { sku, qty: data.qty ?? 0 } })
  return toStockItemDTO(created)
}

export async function deactivateStockItem(id: string, actor: SessionUser) {
  const item = await db.stockItem.findUnique({ where: { id } })
  if (!item) throw new Error('Item tidak ditemukan')
  await db.stockItem.update({ where: { id }, data: { isActive: false } })
  await audit(actor, 'stock.deactivate', 'StockItem', { entityId: id, label: item.name })
}

async function applyMovement(opts: {
  stockItemId: string
  type: string
  delta: number // signed
  resultingQty?: number // for ADJUSTMENT absolute set
  refOrderId?: string
  reason?: string
  note?: string
  userId?: string
  date?: Date // optional backdated timestamp (e.g. recorded purchase date)
}) {
  const item = await db.stockItem.findUnique({ where: { id: opts.stockItemId } })
  if (!item) throw new Error('Item stok tidak ditemukan')
  const resulting = opts.resultingQty !== undefined ? opts.resultingQty : item.qty + opts.delta
  await db.stockMovement.create({
    data: {
      stockItemId: item.id,
      type: opts.type,
      qtyDelta: opts.resultingQty !== undefined ? resulting - item.qty : opts.delta,
      resultingQty: resulting,
      refOrderId: opts.refOrderId ?? null,
      reason: opts.reason ?? null,
      note: opts.note ?? null,
      userId: opts.userId ?? null,
      createdAt: opts.date ?? new Date(),
    },
  })
  await db.stockItem.update({ where: { id: item.id }, data: { qty: resulting } })
  // low-stock detection + event
  const wasLow = statusOf(item.qty, item.lowThreshold) !== 'AMAN'
  const isLow = statusOf(resulting, item.lowThreshold) !== 'AMAN'
  if (!wasLow && isLow) {
    await emitRealtime('stock:low', { sku: item.sku, name: item.name, qty: resulting, lowThreshold: item.lowThreshold })
  }
  await emitRealtime('stock:movement', { sku: item.sku, name: item.name })
  return { item, resulting }
}

export async function recordMovement(
  input: { itemId: string; type: 'RESTOCK_IN' | 'WASTE' | 'MANUAL_OUT' | 'ADJUSTMENT'; qty: number; reason?: string; note?: string },
  actor: SessionUser
): Promise<{ item: StockItemDTO; movement: StockMovementDTO }> {
  if (!input.qty || input.qty <= 0) throw new Error('Jumlah harus lebih dari 0')
  const reasonMap: Record<string, string> = { RESTOCK_IN: 'Masuk', WASTE: 'Limbah', MANUAL_OUT: 'Keluar manual', ADJUSTMENT: 'Penyesuaian' }
  const delta = input.type === 'RESTOCK_IN' ? input.qty : input.type === 'ADJUSTMENT' ? 0 : -input.qty
  const { item, resulting } = await applyMovement({
    stockItemId: input.itemId,
    type: input.type,
    delta,
    resultingQty: input.type === 'ADJUSTMENT' ? input.qty : undefined,
    reason: input.reason ?? reasonMap[input.type],
    note: input.note,
    userId: actor.id,
  })
  await audit(actor, `stock.${input.type.toLowerCase()}`, 'StockItem', {
    entityId: item.id,
    label: item.name,
    after: { qty: resulting, reason: input.reason },
  })
  const mov = await db.stockMovement.findFirst({ where: { stockItemId: item.id }, orderBy: { createdAt: 'desc' } })
  return {
    item: toStockItemDTO({ ...item, qty: resulting }),
    movement: mov
      ? {
          id: mov.id,
          sku: item.sku,
          name: item.name,
          type: mov.type,
          qtyDelta: mov.qtyDelta,
          resultingQty: mov.resultingQty,
          refOrderCode: null,
          reason: mov.reason,
          note: mov.note,
          user: actor.name,
          createdAt: mov.createdAt.toISOString(),
        }
      : {
          id: '',
          sku: item.sku,
          name: item.name,
          type: input.type,
          qtyDelta: delta,
          resultingQty: resulting,
          refOrderCode: null,
          reason: input.reason ?? null,
          note: input.note ?? null,
          user: actor.name,
          createdAt: new Date().toISOString(),
        },
  }
}

export async function recordRestock(
  input: { supplier: string; lines: { itemId: string; qty: number; unitCost: number }[]; date?: Date },
  actor: SessionUser
) {
  if (!input.supplier.trim()) throw new Error('Nama pemasok wajib diisi')
  if (input.lines.length === 0) throw new Error('Tambahkan minimal satu baris')
  for (const line of input.lines) {
    if (!line.itemId || line.qty <= 0) throw new Error('Baris pembelian tidak valid')
    const item = await db.stockItem.findUnique({ where: { id: line.itemId } })
    if (!item) throw new Error('Item stok tidak ditemukan')
    await applyMovement({
      stockItemId: line.itemId,
      type: 'RESTOCK_IN',
      delta: line.qty,
      reason: `Pembelian dari ${input.supplier.trim()}`,
      userId: actor.id,
      date: input.date,
    })
    // weighted unit cost
    const newQty = item.qty + line.qty
    const newCost = newQty > 0 ? (item.qty * item.unitCost + line.qty * line.unitCost) / newQty : line.unitCost
    await db.stockItem.update({ where: { id: line.itemId }, data: { unitCost: Math.round(newCost) } })
  }
  await audit(actor, 'stock.restock', 'StockItem', {
    after: { supplier: input.supplier, lines: input.lines.length },
  })
}

/** Per-ingredient shortfall recorded while deducting recipes (SPEC §3.11 — never blocks the sale). */
export interface StockShortfall {
  sku: string
  name: string
  qtyNeeded: number
  qtyBefore: number
  orderCode: string
}

/** Recipe deduction — NEVER blocks the sale; flags shortfalls instead (SPEC guard). */
export async function deductRecipesForOrder(
  orderId: string,
  actor: SessionUser | null
): Promise<StockShortfall[]> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
  if (!order || order.isTraining) return []
  const shortfalls: StockShortfall[] = []
  for (const item of order.items) {
    if (item.isVoided || !item.productId) continue
    const recipes = await db.recipeItem.findMany({
      where: { productId: item.productId },
      include: { stockItem: true },
    })
    for (const r of recipes) {
      if (!r.stockItem.isActive) continue
      const needed = r.qtyPerUnit * item.qty
      if (r.stockItem.qty < needed) {
        shortfalls.push({
          sku: r.stockItem.sku,
          name: r.stockItem.name,
          qtyNeeded: Math.round(needed * 100) / 100,
          qtyBefore: r.stockItem.qty,
          orderCode: order.code,
        })
      }
      await applyMovement({
        stockItemId: r.stockItemId,
        type: 'SALE_DEDUCT',
        delta: -needed,
        refOrderId: orderId,
        reason: `Pesanan ${order.code}`,
        userId: actor?.id,
      })
    }
  }
  return shortfalls
}

// ---------- Recipes ----------
export async function saveRecipes(
  productId: string,
  lines: { stockItemId: string; qtyPerUnit: number }[],
  actor: SessionUser
) {
  if (lines.some((l) => !l.stockItemId || l.qtyPerUnit <= 0)) throw new Error('Baris resep tidak valid')
  await db.$transaction([
    db.recipeItem.deleteMany({ where: { productId } }),
    db.recipeItem.createMany({
      data: lines.map((l) => ({ productId, stockItemId: l.stockItemId, qtyPerUnit: l.qtyPerUnit })),
    }),
  ])
  const product = await db.product.findUnique({ where: { id: productId } })
  await audit(actor, 'recipe.save', 'Product', { entityId: productId, label: product?.name, after: { lines: lines.length } })
}

export async function getRecipes(productId: string) {
  return db.recipeItem.findMany({ where: { productId }, include: { stockItem: true } })
}

export async function recipeCoverage() {
  const products = await db.product.findMany({
    where: { isActive: true },
    include: { recipes: true },
    orderBy: { name: 'asc' },
  })
  return products.map((p) => ({ id: p.id, name: p.name, hasRecipe: p.recipes.length > 0 }))
}

// ---------- Counts (opname) ----------

/**
 * "10 item tercepat" (SPEC §3.11): stock items with the most SALE_DEDUCT
 * movements in the last 7 days (count first, total qty as tiebreaker).
 * Falls back to the first 10 active items when there is no recent sales history.
 */
export async function quickPickItemIds(): Promise<string[]> {
  const since = new Date(Date.now() - 7 * 86_400_000)
  const movs = await db.stockMovement.findMany({
    where: { type: 'SALE_DEDUCT', createdAt: { gte: since } },
    select: { stockItemId: true, qtyDelta: true },
  })
  const agg = new Map<string, { count: number; qty: number }>()
  for (const m of movs) {
    const cur = agg.get(m.stockItemId) ?? { count: 0, qty: 0 }
    cur.count += 1
    cur.qty += Math.abs(m.qtyDelta)
    agg.set(m.stockItemId, cur)
  }
  const ranked = [...agg.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].qty - a[1].qty)
    .slice(0, 10)
    .map(([id]) => id)
  if (ranked.length > 0) {
    // keep only still-active items (deactivated ones would block the count grid)
    const active = await db.stockItem.findMany({
      where: { id: { in: ranked }, isActive: true },
      select: { id: true },
    })
    const activeIds = ranked.filter((id) => active.some((a) => a.id === id))
    if (activeIds.length > 0) return activeIds
  }
  const fallback = await db.stockItem.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    take: 10,
    select: { id: true },
  })
  return fallback.map((i) => i.id)
}

export async function getCount(businessDate: string): Promise<StockCountDTO | null> {
  const count = await db.stockCount.findFirst({
    where: { businessDate, status: 'DRAFT' },
    include: { approvedBy: { select: { name: true } } },
  })
  if (!count) return null
  return {
    id: count.id,
    businessDate: count.businessDate,
    status: count.status as 'DRAFT' | 'APPROVED',
    lines: (count.lines as StockCountDTO['lines']) ?? [],
    approvedBy: null,
    createdAt: count.createdAt.toISOString(),
    updatedAt: count.updatedAt.toISOString(),
  }
}

/**
 * Upsert today's draft. Scope rules:
 * - new draft + `itemIds` → count only those items ("10 item tercepat" preset);
 * - new draft without `itemIds` → all active items (existing behavior);
 * - existing draft → preserve its scope (draft line ids ∪ posted line ids),
 *   upgrading back to "all items" when that union already covers every active
 *   item, so full counts keep picking up newly created items.
 */
export async function saveCount(
  lines: { stockItemId: string; countedQty: number | null }[],
  actor: SessionUser,
  opts?: { itemIds?: string[] }
): Promise<StockCountDTO> {
  const businessDate = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Jakarta',
  }).format(new Date())
  const existing = await db.stockCount.findFirst({ where: { businessDate, status: 'DRAFT' } })
  const activeItems = await db.stockItem.findMany({ where: { isActive: true }, select: { id: true }, orderBy: { name: 'asc' } })
  let scopeIds: string[] | null = null
  if (existing) {
    const existingIds = ((existing.lines as StockCountDTO['lines']) ?? []).map((l) => l.stockItemId)
    const union = new Set([...existingIds, ...lines.map((l) => l.stockItemId)])
    const isFullScope = activeItems.every((i) => union.has(i.id))
    if (!isFullScope) scopeIds = [...union]
  } else if (opts?.itemIds && opts.itemIds.length > 0) {
    scopeIds = opts.itemIds
  }
  const items = await db.stockItem.findMany({
    where: { isActive: true, ...(scopeIds ? { id: { in: scopeIds } } : {}) },
    orderBy: { name: 'asc' },
  })
  const full = items.map((i) => {
    const line = lines.find((l) => l.stockItemId === i.id)
    const counted = line?.countedQty ?? null
    return {
      stockItemId: i.id,
      sku: i.sku,
      name: i.name,
      unit: i.unit,
      systemQty: i.qty,
      countedQty: counted,
      variance: counted === null ? null : counted - i.qty,
    }
  })
  if (existing) {
    await db.stockCount.update({ where: { id: existing.id }, data: { lines: full as never, updatedAt: new Date() } })
  } else {
    await db.stockCount.create({ data: { businessDate, lines: full as never } })
  }
  await audit(actor, 'count.saveDraft', 'StockCount', { after: { lines: full.length } })
  return (await getCount(businessDate))!
}

export async function approveCount(actor: SessionUser): Promise<StockCountDTO> {
  const businessDate = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Jakarta',
  }).format(new Date())
  const count = await db.stockCount.findFirst({ where: { businessDate, status: 'DRAFT' } })
  if (!count) throw new Error('Tidak ada draf opname hari ini')
  const lines = (count.lines as StockCountDTO['lines']) ?? []
  const counted = lines.filter((l) => l.countedQty !== null)
  if (counted.length === 0) throw new Error('Isi minimal satu jumlah hitung dulu')
  for (const line of counted) {
    await applyMovement({
      stockItemId: line.stockItemId,
      type: 'COUNT_VARIANCE',
      delta: 0,
      resultingQty: line.countedQty!,
      reason: `Opname ${businessDate}`,
      userId: actor.id,
    })
  }
  await db.stockCount.update({ where: { id: count.id }, data: { status: 'APPROVED', approvedById: actor.id } })
  await audit(actor, 'count.approve', 'StockCount', { after: { lines: counted.length } })
  const done = await db.stockCount.findFirst({
    where: { businessDate },
    include: { approvedBy: { select: { name: true } } },
    orderBy: { updatedAt: 'desc' },
  })
  return {
    id: done!.id,
    businessDate,
    status: 'APPROVED',
    lines,
    approvedBy: done!.approvedBy?.name ?? null,
    createdAt: done!.createdAt.toISOString(),
    updatedAt: done!.updatedAt.toISOString(),
  }
}

// ---------- Movements ledger ----------
export async function listMovements(filters: {
  itemId?: string
  type?: string
  userId?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(200, Math.max(5, filters.pageSize ?? 50))
  const where: Record<string, unknown> = {}
  if (filters.itemId) where.stockItemId = filters.itemId
  if (filters.type) where.type = filters.type
  if (filters.userId) where.userId = filters.userId
  if (filters.from || filters.to) {
    const created: { gte?: Date; lte?: Date } = {}
    if (filters.from) created.gte = new Date(filters.from + 'T00:00:00+07:00')
    if (filters.to) created.lte = new Date(filters.to + 'T23:59:59+07:00')
    where.createdAt = created
  }
  const [rows, total] = await Promise.all([
    db.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        stockItem: { select: { sku: true, name: true } },
        user: { select: { name: true } },
      },
    }),
    db.stockMovement.count({ where }),
  ])
  const refIds = [...new Set(rows.map((r) => r.refOrderId).filter(Boolean))] as string[]
  const refOrders = refIds.length
    ? await db.order.findMany({ where: { id: { in: refIds } }, select: { id: true, code: true } })
    : []
  const codeById = new Map(refOrders.map((o) => [o.id, o.code]))
  return {
    rows: rows.map<StockMovementDTO>((r) => ({
      id: r.id,
      sku: r.stockItem.sku,
      name: r.stockItem.name,
      type: r.type,
      qtyDelta: r.qtyDelta,
      resultingQty: r.resultingQty,
      refOrderCode: r.refOrderId ? codeById.get(r.refOrderId) ?? null : null,
      reason: r.reason,
      note: r.note,
      user: r.user?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  }
}
