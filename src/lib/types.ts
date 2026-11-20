// Canonical shared types (client-safe). Single source of truth for DTO shapes.

export type Role = 'ADMIN' | 'CASHIER' | 'BARISTA'
export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING_VERIFICATION'
  | 'PAID'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'CANCELLED'
export type OrderType = 'DINE_IN' | 'TAKE_AWAY' | 'DELIVERY'
export type PaymentMethod = 'CASH' | 'QRIS'
export type PaymentStatus = 'CONFIRMED' | 'PENDING_VERIFICATION' | 'REJECTED'
export type StockStatus = 'AMAN' | 'RENDAH' | 'HABIS'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Menunggu Bayar',
  PENDING_VERIFICATION: 'Verifikasi QRIS',
  PAID: 'Dibayar',
  PREPARING: 'Dimasak',
  READY: 'Siap',
  OUT_FOR_DELIVERY: 'Diantar',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
}

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  DINE_IN: 'Makan di Tempat',
  TAKE_AWAY: 'Bungkus',
  DELIVERY: 'Antar',
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  CONFIRMED: 'Terkonfirmasi',
  PENDING_VERIFICATION: 'Menunggu Verifikasi',
  REJECTED: 'Ditolak',
}

// ---------- Session ----------
export interface SessionUser {
  id: string
  name: string
  username: string
  role: Role
  grants: string[]
  isTraining: boolean
}

// ---------- Menu ----------
export interface VariantOptionDTO {
  id: string
  label: string
  priceDelta: number
  isDefault: boolean
}

export interface VariantGroupDTO {
  id: string
  name: string
  selectionType: 'SINGLE' | 'MULTI'
  isRequired: boolean
  minSelect: number
  maxSelect: number
  isActive: boolean
  options: VariantOptionDTO[]
}

export interface ProductDTO {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  basePrice: number
  isAvailable: boolean
  variantGroups: VariantGroupDTO[]
}

export interface CategoryDTO {
  id: string
  name: string
  products: ProductDTO[]
}

export interface MenuDTO {
  categories: CategoryDTO[]
}

// Cart / draft line (storefront + POS + held orders)
export interface DraftLine {
  productId: string
  productName?: string
  qty: number
  optionIds: string[]
  note?: string
}

// ---------- Orders ----------
export interface OrderItemDTO {
  id: string
  productId: string | null
  name: string
  qty: number
  unitPrice: number
  lineTotal: number
  variantLabels: string[] // e.g. ["Large", "Gula 50%", "+ Extra Shot"]
  note: string | null
  checkedCount: number
  isVoided: boolean
  voidReason: string | null
}

export interface PaymentDTO {
  id: string
  method: PaymentMethod
  amount: number
  cashReceived: number | null
  changeDue: number | null
  qrReference: string | null
  status: PaymentStatus
  verifiedBy: string | null
  paidAt: string
}

export interface TimelineEntry {
  status: OrderStatus | 'CREATED'
  label: string
  at: string | null
  by: string | null
}

export interface OrderDTO {
  id: string
  code: string
  businessDate: string
  type: OrderType
  status: OrderStatus
  source: 'POS' | 'PUBLIC'
  isTraining: boolean
  customerName: string | null
  customerPhone: string | null
  tableLabel: string | null
  deliveryLocation: string | null
  courierName: string | null
  note: string | null
  subtotal: number
  deliveryFee: number
  discountTotal: number
  discountReason: string | null
  taxTotal: number
  total: number
  cashier: string | null
  preparedBy: string | null
  servedBy: string | null
  needsAck: boolean
  createdAt: string
  paidAt: string | null
  preparingAt: string | null
  readyAt: string | null
  outForDeliveryAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  items: OrderItemDTO[]
  payments: PaymentDTO[]
  paymentStatus: 'UNPAID' | PaymentStatus
  timeline: TimelineEntry[]
}

export interface OrderListRow {
  id: string
  code: string
  type: OrderType
  status: OrderStatus
  total: number
  itemCount: number
  customerLabel: string
  paymentLabel: string
  cashier: string | null
  createdAt: string
}

export interface OrderListResult {
  rows: OrderListRow[]
  total: number
  page: number
  pageSize: number
}

// ---------- Create order input (POS + public) ----------
export interface DiscountInput {
  type: 'RP' | 'PERCENT'
  value: number
  reason: string
}

export interface PaymentInput {
  method: 'CASH' | 'QRIS' | 'SPLIT'
  cashReceived?: number // CASH
  cashPortion?: number // SPLIT
  qrReference?: string
}

export interface CreateOrderInput {
  items: DraftLine[]
  type: OrderType
  tableLabel?: string
  customerName?: string
  customerPhone?: string
  deliveryLocation?: string
  note?: string
  discount?: DiscountInput
  payment?: PaymentInput | null // null => bayar di kasir
  source: 'POS' | 'PUBLIC'
  isTraining?: boolean
  idempotencyKey?: string
}

// ---------- Settings ----------
export interface SettingsDTO {
  profile: {
    name: string
    tagline: string
    phone: string
    address: string
    logoUrl: string
    heroImageUrl: string
    orderCodePrefix: string
  }
  hours: {
    days: { open: string; close: string; closed: boolean }[] // index 0 = Sunday
    enforcement: 'STRICT' | 'LOOSE'
  }
  ordering: {
    selfOrderEnabled: boolean
    deliveryEnabled: boolean
    deliveryFee: number
    deliveryLocations: string[]
    requirePhoneForDelivery: boolean
    taxRatePercent: number
  }
  payments: {
    qrisImageUrl: string
    qrisMerchantName: string
    qrisReminderText: string
    splitEnabled: boolean
  }
  receipts: {
    paperWidth: 58 | 80
    headerLines: string[]
    footerLines: string[]
    autoPrintReceipt: boolean
    autoPrintKot: boolean
    whatsappReceipt: boolean
  }
  stock: {
    deductionTrigger: 'READY' | 'PAID'
    defaultLowThreshold: number
    soundAlerts: boolean
  }
  system: {
    practiceMode: boolean
    kdsAmberMinutes: number
    kdsRedMinutes: number
    businessDayCloseReminder: string
  }
}

export interface PublicSettingsDTO {
  profile: SettingsDTO['profile']
  hours: SettingsDTO['hours']
  ordering: SettingsDTO['ordering']
  payments: { qrisImageUrl: string; qrisMerchantName: string }
  /** practice-mode availability — needed by the pre-auth login screen */
  system: { practiceMode: boolean }
}

// ---------- Cash drawer ----------
export interface CashMovementDTO {
  id: string
  type: 'OPENING_FLOAT' | 'CASH_IN' | 'CASH_OUT'
  amount: number
  reason: string | null
  user: string | null
  createdAt: string
}

export interface CashStatusDTO {
  businessDate: string
  hasFloat: boolean
  openingFloat: number
  cashIn: number
  cashOut: number
  cashPayments: number
  /** null when the caller lacks report.viewAll (SPEC §1.7 expected-cash visibility) */
  expectedCash: number | null
  movements: CashMovementDTO[]
}

// ---------- Held orders ----------
export interface HeldOrderDTO {
  id: string
  label: string
  itemCount: number
  createdAt: string
  createdBy: string
}

// ---------- Dashboard ----------
export interface DashboardDTO {
  role: Role
  kpis: { label: string; value: string; hint?: string; href?: string }[]
  expectedCash: number | null // null unless report.viewAll
  alerts: {
    id: string
    kind: 'LOW_STOCK' | 'PENDING_QRIS' | 'UNPAID' | 'UNCLOSED_DAY' | 'STOCK_SHORTFALL' | 'AUTO_CLOSED_DAY'
    label: string
    detail: string
    href: string
  }[]
  feed: { id: string; label: string; at: string }[]
  hourly: { hour: string; revenue: number; orders: number }[]
  topProducts: { name: string; qty: number; revenue: number }[]
  quickActions: { label: string; href: string }[]
  queueDepth: number
  avgPrepMinutes: number | null
}

// ---------- Reports ----------
export interface DayReportSnapshot {
  businessDate: string
  gross: number
  discounts: number
  voids: number
  net: number
  cashTotal: number
  qrisTotal: number
  deliveryFees: number
  taxTotal: number
  orderCount: number
  itemCount: number
  byType: Record<string, { count: number; revenue: number }>
  byHour: { hour: string; revenue: number; orders: number }[]
  openingFloat: number
  cashIn: number
  cashOut: number
  countedCash: number | null
  expectedCash: number
  variance: number | null
  merchantQrisTotal: number | null
  merchantQrisVariance: number | null
  topProducts: { name: string; qty: number; revenue: number }[]
  voidsList: { code: string; reason: string; amount: number; by: string | null; at: string }[]
  wasteTotal: number
}

export interface ReportSummaryDTO {
  from: string
  to: string
  gross: number
  discounts: number
  voids: number
  net: number
  deliveryFees: number
  taxTotal: number
  orderCount: number
  itemCount: number
  aov: number
  byPayment: { method: string; total: number; count: number }[]
  byType: { type: string; count: number; revenue: number }[]
  hourly: { hour: string; revenue: number; orders: number }[]
  productMix: { name: string; qty: number; revenue: number; share: number }[]
  voidsList: { code: string; reason: string; amount: number; by: string | null; at: string }[]
  stockUsage: { name: string; unit: string; consumed: number; wasted: number }[]
  pendingPayments: { code: string; amount: number; at: string }[]
}

export interface DailyReportRow {
  id: string
  businessDate: string
  kind: 'X' | 'Z'
  status: string
  isAutoClosed: boolean
  closedAt: string | null
  generatedBy: string | null
  snapshot: DayReportSnapshot
}

// ---------- Stock ----------
export interface StockItemDTO {
  id: string
  sku: string
  name: string
  unit: string
  qty: number
  lowThreshold: number
  unitCost: number
  isActive: boolean
  status: StockStatus
  updatedAt: string
}

export interface StockMovementDTO {
  id: string
  sku: string
  name: string
  type: string
  qtyDelta: number
  resultingQty: number
  refOrderCode: string | null
  reason: string | null
  note: string | null
  user: string | null
  createdAt: string
}

export interface StockCountDTO {
  id: string
  businessDate: string
  status: 'DRAFT' | 'APPROVED'
  lines: {
    stockItemId: string
    sku: string
    name: string
    unit: string
    systemQty: number
    countedQty: number | null
    variance: number | null
  }[]
  approvedBy: string | null
  createdAt: string
  updatedAt: string
}

// ---------- Users ----------
export interface UserDTO {
  id: string
  name: string
  username: string
  role: Role
  grants: string[] | null
  isActive: boolean
  isTraining: boolean
  hasPin: boolean
  lastLoginAt: string | null
}

// ---------- Audit ----------
export interface AuditLogDTO {
  id: string
  user: string | null
  role: string | null
  action: string
  entity: string
  entityId: string | null
  label: string | null
  before: unknown
  after: unknown
  createdAt: string
}

// ---------- Realtime payloads ----------
export interface RealtimeEvents {
  'order:created': { id: string; code: string; status: OrderStatus; type: OrderType }
  'order:status': { id: string; code: string; status: OrderStatus }
  'order:itemChecked': { id: string; code: string; itemId: string; checkedCount: number }
  'order:needsAck': { id: string; code: string }
  'payment:updated': { id: string; code: string; paymentStatus: string; status: OrderStatus }
  'stock:low': { sku: string; name: string; qty: number; lowThreshold: number }
  'stock:movement': { sku: string; name: string }
  'menu:availability': { productId: string; isAvailable: boolean }
  'day:closed': { businessDate: string }
}
