// Settings store: per-section JSON rows merged over defaults. Server-only.
import 'server-only'
import { db } from './db'
import type { SettingsDTO, PublicSettingsDTO } from './types'

const DEFAULTS: SettingsDTO = {
  profile: {
    name: 'Sekelas Cafe',
    tagline: 'Ngopi sekelas, rasa juara — kafe siswa SMKN 1 Boyolangu',
    phone: '0851 5182 3036',
    address: 'Jl. Ki Mangunsarkoro VI/3, Beji, Boyolangu, Tulungagung, Jawa Timur',
    logoUrl: '/logo.png',
    heroImageUrl: '',
    orderCodePrefix: 'SKC',
  },
  hours: {
    days: [
      { open: '07:00', close: '14:00', closed: true },  // Sunday
      { open: '07:00', close: '14:00', closed: false }, // Monday
      { open: '07:00', close: '14:00', closed: false },
      { open: '07:00', close: '14:00', closed: false },
      { open: '07:00', close: '14:00', closed: false },
      { open: '07:00', close: '14:00', closed: false }, // Friday
      { open: '07:00', close: '14:00', closed: true },  // Saturday
    ],
    enforcement: 'STRICT',
  },
  ordering: {
    selfOrderEnabled: true,
    deliveryEnabled: true,
    deliveryFee: 1000,
    deliveryLocations: ['Kantin', 'Ruang Guru', 'Lab Komputer', 'Aula', 'Parkiran'],
    requirePhoneForDelivery: false,
    taxRatePercent: 0,
  },
  payments: {
    qrisImageUrl: '/qris-demo.png',
    qrisMerchantName: 'SEKELAS CAFE',
    qrisReminderText:
      'Periksa mutasi di aplikasi merchant sebelum konfirmasi — bukti tangkapan layar bisa dipalsukan.',
    splitEnabled: true,
  },
  receipts: {
    paperWidth: 80,
    headerLines: ['SEKELAS CAFE', 'SMKN 1 BOYOLANGU'],
    footerLines: ['Terima kasih sudah mampir!', 'Sekelas Cafe — SMKN 1 Boyolangu', '0851 5182 3036'],
    autoPrintReceipt: true,
    autoPrintKot: true,
    whatsappReceipt: true,
  },
  stock: {
    deductionTrigger: 'READY',
    defaultLowThreshold: 10,
    soundAlerts: true,
  },
  system: {
    practiceMode: false,
    kdsAmberMinutes: 10,
    kdsRedMinutes: 15,
    businessDayCloseReminder: '13:45',
  },
}

export type SettingsSection = keyof SettingsDTO

function merge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object') return base
  return { ...base, ...(patch as object) } as T
}

export async function getSettings(): Promise<SettingsDTO> {
  const rows = await db.setting.findMany()
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const result = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS) as SettingsSection[]) {
    result[key] = merge(DEFAULTS[key], map.get(key)) as never
  }
  return result
}

export async function patchSettings(section: SettingsSection, patch: unknown): Promise<SettingsDTO> {
  const current = await getSettings()
  const next = merge(current[section], patch)
  await db.setting.upsert({
    where: { key: section },
    update: { value: next as object },
    create: { key: section, value: next as object },
  })
  return getSettings()
}

export function toPublicSettings(s: SettingsDTO): PublicSettingsDTO {
  return {
    profile: s.profile,
    hours: s.hours,
    ordering: s.ordering,
    payments: { qrisImageUrl: s.payments.qrisImageUrl, qrisMerchantName: s.payments.qrisMerchantName },
    system: { practiceMode: s.system.practiceMode },
  }
}

/** Is the cafe open right now (Asia/Jakarta)? */
export async function isCafeOpenNow(): Promise<{ open: boolean; enforcement: 'STRICT' | 'LOOSE'; reason: string }> {
  const s = await getSettings()
  const { jakartaDayIndex, nowJakartaMinutes, parseTimeHM } = await import('./format')
  const day = jakartaDayIndex()
  const today = s.hours.days[day]
  if (!today || today.closed) {
    return { open: false, enforcement: s.hours.enforcement, reason: 'Tutup — buka Senin–Jumat 07.00–14.00' }
  }
  const now = nowJakartaMinutes()
  const open = parseTimeHM(today.open)
  const close = parseTimeHM(today.close)
  if (now < open || now >= close) {
    return { open: false, enforcement: s.hours.enforcement, reason: `Tutup — buka ${today.open.replace(':', '.')}–${today.close.replace(':', '.')} hari ini` }
  }
  return { open: true, enforcement: s.hours.enforcement, reason: `Buka — tutup ${today.close.replace(':', '.')}` }
}
