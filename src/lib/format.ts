// Formatting helpers — locale id-ID, timezone Asia/Jakarta. Client-safe.

export const TZ = 'Asia/Jakarta'

export function formatIDR(n: number): string {
  return 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(n))
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)
}

export function formatTime(d: string | Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(new Date(d))
}

export function formatDate(d: string | Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: TZ,
  }).format(new Date(d))
}

export function formatDateTime(d: string | Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(new Date(d))
}

export function formatDateLong(d: string | Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  }).format(new Date(d))
}

/** Duration in minutes -> "12 mnt" / "1 jam 5 mnt" */
export function formatDurationMinutes(mins: number): string {
  const m = Math.max(0, Math.round(mins))
  if (m < 60) return `${m} mnt`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h} jam` : `${h} jam ${rest} mnt`
}

/** Elapsed since date, live-updating friendly */
export function elapsedSince(d: string | Date): number {
  return (Date.now() - new Date(d).getTime()) / 60000
}

/** Current business date in Asia/Jakarta as YYYY-MM-DD */
export function todayJakarta(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TZ,
  }).format(new Date())
}

export function addDaysJakarta(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z') // noon anchor avoids TZ edge
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function parseTimeHM(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function formatHM(hm: string): string {
  return hm.replace(':', '.')
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
export function dayName(idx: number): string {
  return DAY_NAMES[idx] ?? ''
}

/** Sunday=0 index for Asia/Jakarta now */
export function jakartaDayIndex(): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date())
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
}

export function nowJakartaMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  }).format(new Date())
  const [h, m] = parts.split(':').map(Number)
  return h * 60 + m
}
