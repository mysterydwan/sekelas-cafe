'use client'

// Settings tab sections (SPEC §3.15). Each section is a controlled form over a
// slice of SettingsDTO; the page owns dirty-tracking + save.
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ImageOff, Info, Loader2, Phone, Plus, Printer, Upload, X } from 'lucide-react'
import type { SettingsDTO } from '@/lib/types'
import { dayName, jakartaDayIndex, nowJakartaMinutes, parseTimeHM } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { MoneyInput, printHtml, waLink } from './shared'

export interface SectionProps<T> {
  value: T
  onChange: (patch: Partial<T>) => void
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string
  hint: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
      <span className="text-sm font-medium">
        {label}
        <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </label>
  )
}

// ---------- Profil ----------

// Logo upload pipeline (SPEC §3.15): ≤1024px, target ≤300 KB. Transparent PNGs
// are kept as PNG when they fit; anything else is flattened onto the espresso
// header color (#241610) and re-encoded as JPEG (quality ladder 0.82 → 0.5).
const LOGO_MAX_DIM = 1024
const LOGO_TARGET_BYTES = 300 * 1024

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  return Math.floor(((comma < 0 ? dataUrl.length : dataUrl.length - comma - 1) * 3) / 4)
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Gagal membaca berkas — coba lagi'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Berkas bukan gambar yang valid'))
    img.src = src
  })
}

async function compressLogoImage(
  file: File
): Promise<{ dataUrl: string; originalSize: number; compressedSize: number }> {
  const source = await readAsDataUrl(file)
  const img = await loadImage(source)

  // Transparent PNG that fits the budget → keep PNG (alpha survives).
  if (file.type === 'image/png') {
    const scale = Math.min(1, LOGO_MAX_DIM / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Peramban tidak mendukung pemrosesan gambar')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const png = canvas.toDataURL('image/png')
    if (dataUrlBytes(png) <= LOGO_TARGET_BYTES) {
      return { dataUrl: png, originalSize: file.size, compressedSize: dataUrlBytes(png) }
    }
  }

  // Everything else: flatten onto espresso-brown, encode JPEG with a quality
  // ladder (0.82 → 0.5), last resort shrink to 800px.
  const drawFlattened = (maxDim: number): HTMLCanvasElement => {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Peramban tidak mendukung pemrosesan gambar')
    ctx.fillStyle = '#241610'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  }
  let canvas = drawFlattened(LOGO_MAX_DIM)
  let out = canvas.toDataURL('image/jpeg', 0.82)
  for (const quality of [0.72, 0.6, 0.5]) {
    if (dataUrlBytes(out) <= LOGO_TARGET_BYTES) break
    out = canvas.toDataURL('image/jpeg', quality)
  }
  if (dataUrlBytes(out) > LOGO_TARGET_BYTES) {
    canvas = drawFlattened(800)
    out = canvas.toDataURL('image/jpeg', 0.7)
  }
  return { dataUrl: out, originalSize: file.size, compressedSize: dataUrlBytes(out) }
}

export function ProfileSection({ value, onChange }: SectionProps<SettingsDTO['profile']>) {
  const prefixOk = /^[A-Za-z0-9]{0,5}$/.test(value.orderCodePrefix)
  const logoFileRef = useRef<HTMLInputElement>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoSizes, setLogoSizes] = useState<{ original: number; compressed: number } | null>(null)

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Berkas harus berupa gambar (PNG disarankan)')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Ukuran berkas maksimal 15 MB')
      return
    }
    setLogoBusy(true)
    try {
      const { dataUrl, originalSize, compressedSize } = await compressLogoImage(file)
      onChange({ logoUrl: dataUrl })
      setLogoSizes({ original: originalSize, compressed: compressedSize })
      toast.success(`Logo terkompresi — ${formatBytes(originalSize)} → ${formatBytes(compressedSize)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memproses logo')
    } finally {
      setLogoBusy(false)
    }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama kafe" htmlFor="set-name">
            <Input id="set-name" className="h-11" value={value.name} onChange={(e) => onChange({ name: e.target.value })} />
          </Field>
          <Field label="Telepon (WhatsApp)" htmlFor="set-phone" hint="Ditampilkan sebagai tautan WhatsApp di semua halaman.">
            <Input id="set-phone" className="h-11" value={value.phone} onChange={(e) => onChange({ phone: e.target.value })} placeholder="08xx xxxx xxxx" />
          </Field>
        </div>
        <Field label="Slogan" htmlFor="set-tagline" hint="Satu baris di bawah nama kafe.">
          <Input id="set-tagline" className="h-11" value={value.tagline} onChange={(e) => onChange({ tagline: e.target.value })} />
        </Field>
        <Field
          label="Logo kafe"
          hint="Tampil apa adanya di kepala halaman depan — tanpa dipotong atau dibingkai. PNG transparan dipertahankan selama ukurannya memuat (≤ 300 KB)."
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={logoFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleLogoFile(e)}
              aria-label="Unggah logo kafe"
            />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => logoFileRef.current?.click()}
              disabled={logoBusy}
            >
              {logoBusy ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="mr-1 h-4 w-4" aria-hidden />
              )}
              Unggah Logo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 text-destructive hover:bg-destructive/10"
              onClick={() => {
                onChange({ logoUrl: '' })
                setLogoSizes(null)
                toast.info('Logo dikembalikan ke bawaan — Simpan untuk menerapkan')
              }}
              disabled={!value.logoUrl || value.logoUrl === '/logo.png'}
            >
              Kembalikan Bawaan
            </Button>
            {logoSizes && value.logoUrl.startsWith('data:') && (
              <span className="font-mono text-xs text-success">
                {formatBytes(logoSizes.original)} → {formatBytes(logoSizes.compressed)}
              </span>
            )}
          </div>
        </Field>
        <Field label="Alamat" htmlFor="set-address">
          <Textarea id="set-address" rows={2} value={value.address} onChange={(e) => onChange({ address: e.target.value })} />
        </Field>
        <Field label="URL gambar hero" htmlFor="set-hero" hint="Gambar besar di halaman depan — tempel tautan gambar.">
          <Input id="set-hero" className="h-11" value={value.heroImageUrl} onChange={(e) => onChange({ heroImageUrl: e.target.value })} placeholder="https://…" />
        </Field>
        <Field
          label="Prefiks kode pesanan"
          htmlFor="set-prefix"
          hint="Maks. 5 huruf/angka — kode harian seperti SKC-012."
        >
          <Input
            id="set-prefix"
            className="h-11 w-32 font-mono uppercase"
            value={value.orderCodePrefix}
            onChange={(e) => {
              const v = e.target.value.toUpperCase()
              if (/^[A-Za-z0-9]{0,5}$/.test(v)) onChange({ orderCodePrefix: v })
            }}
            aria-invalid={!prefixOk}
          />
        </Field>
      </div>

      {/* live storefront header preview */}
      <aside className="lg:sticky lg:top-6 lg:self-start" aria-label="Pratinjau kepala halaman depan">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pratinjau tampilan halaman depan
        </p>
        <div className="overflow-hidden rounded-2xl border shadow-sm">
          <div className="bg-espresso px-5 py-6 text-cream">
            <div className="flex items-center gap-4">
              {/* Logo as-is: no crop, no frame, no shadow (SPEC §1.2) */}
              <img
                src={value.logoUrl || '/logo.png'}
                alt=""
                className="h-14 w-auto object-contain"
              />
              <div className="min-w-0">
                <p className="truncate font-display text-xl font-semibold">{value.name || 'Nama kafe'}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-cream/80">{value.tagline || 'slogan kafe'}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-cream p-3 text-xs text-espresso">
            <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {value.phone ? (
              <a href={waLink(value.phone)} target="_blank" rel="noopener noreferrer" className="underline">
                wa.me/{waLink(value.phone).replace('https://wa.me/', '')}
              </a>
            ) : (
              <span className="text-muted-foreground">nomor belum diisi</span>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

// ---------- Jam ----------

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] // Monday-first display

export function HoursSection({ value, onChange }: SectionProps<SettingsDTO['hours']>) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const preview = (() => {
    const day = value.days[jakartaDayIndex()]
    const now = nowJakartaMinutes()
    if (!day || day.closed) {
      for (let i = 1; i <= 7; i++) {
        const idx = (jakartaDayIndex() + i) % 7
        const d = value.days[idx]
        if (d && !d.closed) return `Saat ini: TUTUP (buka ${dayName(idx)} ${d.open.replace(':', '.')})`
      }
      return 'Saat ini: TUTUP (tidak ada jam buka)'
    }
    const open = parseTimeHM(day.open)
    const close = parseTimeHM(day.close)
    if (now < open) return `Saat ini: TUTUP (buka hari ini ${day.open.replace(':', '.')})`
    if (now >= close) {
      for (let i = 1; i <= 7; i++) {
        const idx = (jakartaDayIndex() + i) % 7
        const d = value.days[idx]
        if (d && !d.closed) return `Saat ini: TUTUP (buka ${dayName(idx)} ${d.open.replace(':', '.')})`
      }
      return 'Saat ini: TUTUP'
    }
    return `Saat ini: BUKA (tutup ${day.close.replace(':', '.')})`
  })()

  const patchDay = (idx: number, p: Partial<SettingsDTO['hours']['days'][number]>) => {
    onChange({ days: value.days.map((d, i) => (i === idx ? { ...d, ...p } : d)) })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {WEEK_ORDER.map((idx) => {
          const d = value.days[idx]
          return (
            <div
              key={idx}
              className={cn(
                'grid items-center gap-2 rounded-xl border p-2 sm:grid-cols-[90px_1fr_1fr_auto]',
                d.closed && 'bg-cream/40 opacity-75'
              )}
            >
              <p className="px-2 text-sm font-semibold">{dayName(idx)}</p>
              <label className="flex items-center gap-2">
                <span className="sr-only">Jam buka {dayName(idx)}</span>
                <Input
                  type="time"
                  className="h-11"
                  value={d.open}
                  disabled={d.closed}
                  onChange={(e) => patchDay(idx, { open: e.target.value || '00:00' })}
                />
                <span className="text-muted-foreground">–</span>
                <span className="sr-only">Jam tutup {dayName(idx)}</span>
                <Input
                  type="time"
                  className="h-11"
                  value={d.close}
                  disabled={d.closed}
                  onChange={(e) => patchDay(idx, { close: e.target.value || '00:00' })}
                />
              </label>
              <p className={cn('text-right text-xs', d.closed ? 'text-muted-foreground' : 'text-success')}>
                {d.closed ? 'tutup seharian' : `buka ${d.open.replace(':', '.')}–${d.close.replace(':', '.')}`}
              </p>
              <label className="flex items-center justify-end gap-2 pr-2">
                <span className="text-xs text-muted-foreground">libur</span>
                <Switch checked={d.closed} onCheckedChange={(v) => patchDay(idx, { closed: v })} aria-label={`Tandai ${dayName(idx)} libur`} />
              </label>
            </div>
          )
        })}
      </div>

      <div className="space-y-2 rounded-xl border p-3">
        <p className="text-sm font-semibold">Penegakan jam buka</p>
        <RadioGroup
          value={value.enforcement}
          onValueChange={(v) => onChange({ enforcement: v as 'STRICT' | 'LOOSE' })}
          className="gap-2"
        >
          <label className="flex items-start gap-3 rounded-lg p-2 hover:bg-cream/60">
            <RadioGroupItem value="STRICT" className="mt-1" />
            <span className="text-sm">
              Ketat
              <span className="block text-xs font-normal text-muted-foreground">
                Pesanan mandiri ditolak di luar jam buka — pesanan tetap bisa dibuat kasir.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg p-2 hover:bg-cream/60">
            <RadioGroupItem value="LOOSE" className="mt-1" />
            <span className="text-sm">
              Longgar
              <span className="block text-xs font-normal text-muted-foreground">
                Pesanan mandiri tetap diterima di luar jam, dengan himbauan.
              </span>
            </span>
          </label>
        </RadioGroup>
      </div>

      <p className="rounded-xl border border-caramel/40 bg-caramel/10 p-3 text-sm font-medium text-espresso" role="status" aria-live="polite">
        {preview}
      </p>
    </div>
  )
}

// ---------- Pesanan ----------

export function OrderingSection({ value, onChange }: SectionProps<SettingsDTO['ordering']>) {
  const [locText, setLocText] = useState('')
  const addLoc = () => {
    const v = locText.trim()
    if (!v) return
    if (value.deliveryLocations.includes(v)) {
      toast.error('Lokasi sudah ada')
      return
    }
    onChange({ deliveryLocations: [...value.deliveryLocations, v] })
    setLocText('')
  }
  return (
    <div className="space-y-4">
      <ToggleRow
        label="Pesanan mandiri pelanggan"
        hint="Halaman depan bisa memesan langsung. Nonaktif = halaman depan jadi menu saja dengan pemberitahuan “pesan di kasir”."
        checked={value.selfOrderEnabled}
        onCheckedChange={(v) => onChange({ selfOrderEnabled: v })}
      />
      <ToggleRow
        label="Antar (delivery)"
        hint="Opsi antar ke lokasi preset dengan biaya tetap."
        checked={value.deliveryEnabled}
        onCheckedChange={(v) => onChange({ deliveryEnabled: v })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Biaya antar per pesanan" htmlFor="set-fee" hint="Berlaku untuk pesanan baru saja.">
          <MoneyInput id="set-fee" ariaLabel="Biaya antar" value={value.deliveryFee} onChange={(v) => onChange({ deliveryFee: v ?? 0 })} />
        </Field>
        <ToggleRow
          label="Wajib nomor HP untuk antar"
          hint="Kurir butuh menghubungi penerima."
          checked={value.requirePhoneForDelivery}
          onCheckedChange={(v) => onChange({ requirePhoneForDelivery: v })}
        />
      </div>
      <Field label="Lokasi antar preset" hint="Pilihan cepat saat checkout — mis. titik di sekolah.">
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Lokasi antar">
          {value.deliveryLocations.map((loc) => (
            <span
              key={loc}
              role="listitem"
              className="inline-flex min-h-11 items-center gap-1 rounded-full border border-caramel/40 bg-cream px-3 text-sm text-espresso"
            >
              {loc}
              <button
                type="button"
                className="ml-1 rounded-full p-1 text-muted-foreground hover:bg-caramel/20 hover:text-espresso"
                onClick={() => onChange({ deliveryLocations: value.deliveryLocations.filter((l) => l !== loc) })}
                aria-label={`Hapus lokasi ${loc}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          ))}
          {value.deliveryLocations.length === 0 && (
            <span className="text-sm text-muted-foreground">belum ada lokasi preset</span>
          )}
        </div>
        <div className="mt-1.5 flex gap-2">
          <Input
            className="h-11"
            value={locText}
            onChange={(e) => setLocText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLoc())}
            placeholder="cth. Perpustakaan"
            aria-label="Lokasi antar baru"
          />
          <Button variant="outline" className="h-11 shrink-0" onClick={addLoc} disabled={!locText.trim()}>
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Tambah
          </Button>
        </div>
      </Field>
      <Field label={`Pajak: ${value.taxRatePercent}%`} hint="0–10% dihitung dari subtotal pesanan baru.">
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={value.taxRatePercent}
          onChange={(e) => onChange({ taxRatePercent: parseInt(e.target.value, 10) })}
          className="h-11 w-full accent-[#c68b33]"
          aria-label="Tarif pajak persen"
        />
      </Field>
    </div>
  )
}

// ---------- Pembayaran ----------

export function PaymentsSection({ value, onChange }: SectionProps<SettingsDTO['payments']>) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [imgError, setImgError] = useState(false)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) {
      toast.error('Berkas harus berupa gambar (PNG)')
      return
    }
    if (f.size > 300 * 1024) {
      toast.error('Ukuran maksimum 300 KB — kompres gambarnya dulu')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setImgError(false)
      onChange({ qrisImageUrl: String(reader.result) })
      toast.success('Gambar QRIS dimuat — jangan lupa Simpan')
    }
    reader.onerror = () => toast.error('Gagal membaca berkas — coba lagi')
    reader.readAsDataURL(f)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="URL gambar QRIS" htmlFor="set-qris" hint="Tautan gambar, atau unggah PNG di samping (maks. 300 KB).">
          <Input
            id="set-qris"
            className="h-11"
            value={value.qrisImageUrl.startsWith('data:') ? '(gambar terunggah — tersimpan setelah Simpan)' : value.qrisImageUrl}
            onChange={(e) => {
              setImgError(false)
              onChange({ qrisImageUrl: e.target.value })
            }}
            readOnly={value.qrisImageUrl.startsWith('data:')}
          />
        </Field>
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} aria-label="Unggah gambar QRIS" />
          <Button variant="outline" className="h-11" onClick={() => fileRef.current?.click()}>
            Unggah PNG
          </Button>
          <Button
            variant="outline"
            className="h-11 text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmRemove(true)}
            disabled={!value.qrisImageUrl}
          >
            Hapus
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-4 rounded-xl border bg-cream/40 p-3">
        <div className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white">
          {value.qrisImageUrl && !imgError ? (
             
            <img src={value.qrisImageUrl} alt="Pratinjau QRIS" className="h-full w-full object-contain" onError={() => setImgError(true)} />
          ) : (
            <span className="flex flex-col items-center gap-1 p-3 text-center text-xs text-muted-foreground">
              <ImageOff className="h-6 w-6" aria-hidden />
              belum ada gambar — QRIS nonaktif
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
          <p className="flex items-start gap-1.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Pindai dengan aplikasi pembayaran untuk menguji sebelum dipakai. Tanpa gambar QRIS,
            pembayaran QRIS otomatis nonaktif di kasir dan pesanan mandiri.
          </p>
        </div>
      </div>

      <Field label="Nama merchant di layar pembayaran" htmlFor="set-merchant" hint="Harus sama dengan nama di aplikasi merchant — dipakai kasir mencocokkan mutasi.">
        <Input id="set-merchant" className="h-11" value={value.qrisMerchantName} onChange={(e) => onChange({ qrisMerchantName: e.target.value })} />
      </Field>
      <Field label="Teks pengingat verifikasi QRIS" htmlFor="set-reminder" hint="Ditampilkan ke kasir sebelum mengonfirmasi pembayaran QRIS.">
        <Textarea id="set-reminder" rows={2} value={value.qrisReminderText} onChange={(e) => onChange({ qrisReminderText: e.target.value })} />
      </Field>
      <ToggleRow
        label="Pembayaran campuran (tunai + QRIS)"
        hint="Kasir bisa membagi total antara tunai dan QRIS."
        checked={value.splitEnabled}
        onCheckedChange={(v) => onChange({ splitEnabled: v })}
      />

      {confirmRemove && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
          <p className="font-medium text-destructive">Hapus gambar QRIS?</p>
          <p className="mt-1 text-espresso">
            QRIS dinonaktifkan di kasir dan pesanan mandiri sampai gambar baru diunggah. Pesanan
            tunai tidak terpengaruh.
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" size="sm" className="h-11" onClick={() => setConfirmRemove(false)}>
              Batal
            </Button>
            <Button
              size="sm"
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setImgError(false)
                onChange({ qrisImageUrl: '' })
                setConfirmRemove(false)
                toast.info('Gambar QRIS dihapus dari draf — Simpan untuk menerapkan')
              }}
            >
              Hapus Gambar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Struk ----------

function LinesEditor({
  lines,
  onChange,
  placeholder,
  label,
}: {
  lines: string[]
  onChange: (lines: string[]) => void
  placeholder: string
  label: string
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2">
          <Input
            className="h-11"
            value={line}
            placeholder={placeholder}
            aria-label={`${label} baris ${i + 1}`}
            onChange={(e) => onChange(lines.map((l, j) => (j === i ? e.target.value : l)))}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 text-destructive hover:bg-destructive/10"
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
            aria-label={`Hapus ${label} baris ${i + 1}`}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" className="h-11 text-caramel hover:bg-caramel/10" onClick={() => onChange([...lines, ''])}>
        <Plus className="mr-1 h-4 w-4" aria-hidden /> Baris
      </Button>
    </div>
  )
}

export function ReceiptsSection({ value, onChange }: SectionProps<SettingsDTO['receipts']>) {
  const testPrint = () => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const body = `
      <div class="receipt">
        ${value.headerLines.filter(Boolean).map((l) => `<p class="center bold">${esc(l)}</p>`).join('')}
        <p class="center">Jl. Ki Mangunsarkoro VI/3, Boyolangu</p>
        <div class="line"></div>
        <p class="bold">SKC-012 &nbsp; 10 Feb 14.32 &nbsp; Kasir</p>
        <p>Kopi Susu Gula Aren</p>
        <p class="right">2 x 10.000 &nbsp;&nbsp;&nbsp; 20.000</p>
        <p>+ Extra shot (Es Kopi)</p>
        <p class="right">1 x 3.000 &nbsp;&nbsp;&nbsp; 3.000</p>
        <div class="line"></div>
        <p class="right bold">TOTAL &nbsp;&nbsp;&nbsp; 23.000</p>
        <p class="right">Tunai 50.000 &nbsp;&nbsp; Kembali 27.000</p>
        <div class="line"></div>
        ${value.footerLines.filter(Boolean).map((l) => `<p class="center">${esc(l)}</p>`).join('')}
        <p class="center muted">~ contoh uji cetak ~</p>
      </div>
    `
    if (!printHtml('Uji Cetak Struk', body, { widthMm: value.paperWidth })) toast.error('Izinkan pop-up untuk mencetak')
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border p-3">
        <p className="text-sm font-semibold">Lebar kertas</p>
        <RadioGroup
          value={String(value.paperWidth)}
          onValueChange={(v) => onChange({ paperWidth: parseInt(v, 10) as 58 | 80 })}
          className="flex gap-4"
        >
          <label className="flex items-center gap-2 rounded-lg p-2">
            <RadioGroupItem value="58" />
            <span className="text-sm">58 mm <span className="text-xs text-muted-foreground">— printer mini</span></span>
          </label>
          <label className="flex items-center gap-2 rounded-lg p-2">
            <RadioGroupItem value="80" />
            <span className="text-sm">80 mm <span className="text-xs text-muted-foreground">— standar kasir</span></span>
          </label>
        </RadioGroup>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <LinesEditor
          label="Baris kepala struk"
          lines={value.headerLines}
          onChange={(headerLines) => onChange({ headerLines })}
          placeholder="cth. SEKELAS CAFE"
        />
        <LinesEditor
          label="Baris kaki struk"
          lines={value.footerLines}
          onChange={(footerLines) => onChange({ footerLines })}
          placeholder="cth. Terima kasih!"
        />
      </div>
      <ToggleRow
        label="Cetak otomatis struk pelanggan"
        hint="Langsung terbuka dialog cetak setelah pembayaran."
        checked={value.autoPrintReceipt}
        onCheckedChange={(v) => onChange({ autoPrintReceipt: v })}
      />
      <ToggleRow
        label="Cetak otomatis KOT (struk dapur)"
        hint="Terbuka otomatis saat pesanan masuk."
        checked={value.autoPrintKot}
        onCheckedChange={(v) => onChange({ autoPrintKot: v })}
      />
      <ToggleRow
        label="Kirim struk via WhatsApp"
        hint="Tautan wa.me berisi ringkasan pesanan bila ada nomor pelanggan."
        checked={value.whatsappReceipt}
        onCheckedChange={(v) => onChange({ whatsappReceipt: v })}
      />
      <Button variant="outline" className="h-11" onClick={testPrint}>
        <Printer className="mr-2 h-4 w-4" aria-hidden /> Uji Cetak
      </Button>
    </div>
  )
}

// ---------- Stok ----------

export function StockSection({ value, onChange }: SectionProps<SettingsDTO['stock']>) {
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border p-3">
        <p className="text-sm font-semibold">Pemicu pengurangan stok</p>
        <RadioGroup
          value={value.deductionTrigger}
          onValueChange={(v) => onChange({ deductionTrigger: v as 'READY' | 'PAID' })}
          className="gap-2"
        >
          <label className="flex items-start gap-3 rounded-lg p-2 hover:bg-cream/60">
            <RadioGroupItem value="READY" className="mt-1" />
            <span className="text-sm">
              Saat pesanan SIAP (bawaan)
              <span className="block text-xs font-normal text-muted-foreground">
                Bahan berkurang ketika minuman selesai dibuat.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg p-2 hover:bg-cream/60">
            <RadioGroupItem value="PAID" className="mt-1" />
            <span className="text-sm">
              Saat pesanan DIBAYAR
              <span className="block text-xs font-normal text-muted-foreground">
                Bahan berkurang lebih awal — cocok bila pembayaran selalu duluan.
              </span>
            </span>
          </label>
        </RadioGroup>
        <p className="text-xs text-warning">Perubahan berlaku untuk pesanan baru saja.</p>
      </div>
      <Field label="Batas rendah bawaan" htmlFor="set-low" hint="Dipakai saat menambah bahan baru tanpa batas khusus.">
        <Input
          id="set-low"
          type="number"
          min={0}
          step="any"
          className="h-11 w-32 font-mono tabular-nums"
          value={value.defaultLowThreshold}
          onChange={(e) => onChange({ defaultLowThreshold: parseFloat(e.target.value || '0') || 0 })}
        />
      </Field>
      <ToggleRow
        label="Suara peringatan"
        hint="Bunyi saat pesanan baru, siap, dan stok rendah — selalu dibarengi tanda visual."
        checked={value.soundAlerts}
        onCheckedChange={(v) => onChange({ soundAlerts: v })}
      />
    </div>
  )
}

// ---------- Sistem ----------

export function SystemSection({ value, onChange }: SectionProps<SettingsDTO['system']>) {
  const amberInvalid = value.kdsAmberMinutes >= value.kdsRedMinutes
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <ToggleRow
          label="Mode latihan (sandbox)"
          hint="Sesi berlatih siswa — pesanan latihan ditandai dan dikecualikan dari laporan, stok, dan Z."
          checked={value.practiceMode}
          onCheckedChange={(v) => onChange({ practiceMode: v })}
        />
        {value.practiceMode && (
          <p className="rounded-xl border border-warning/50 bg-caramel/15 p-3 text-sm font-medium text-warning" role="alert">
            MODE LATIHAN AKTIF — pesanan yang dibuat sekarang dikecualikan dari laporan &amp; stok.
            Matikan sebelum jam operasional sungguhan.
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Ambang timer KDS — kuning"
          htmlFor="set-amber"
          hint="Pesanan menyala kuning setelah menunggu sekian menit."
        >
          <Input
            id="set-amber"
            type="number"
            min={1}
            className="h-11 w-32 font-mono tabular-nums"
            value={value.kdsAmberMinutes}
            aria-invalid={amberInvalid}
            onChange={(e) => onChange({ kdsAmberMinutes: parseInt(e.target.value || '0', 10) || 0 })}
          />
        </Field>
        <Field
          label="Ambang timer KDS — merah"
          htmlFor="set-red"
          hint="Menyala merah (lebih serius) setelah menunggu lebih lama."
        >
          <Input
            id="set-red"
            type="number"
            min={1}
            className="h-11 w-32 font-mono tabular-nums"
            value={value.kdsRedMinutes}
            aria-invalid={amberInvalid}
            onChange={(e) => onChange({ kdsRedMinutes: parseInt(e.target.value || '0', 10) || 0 })}
          />
        </Field>
      </div>
      {amberInvalid && (
        <p className="text-sm font-medium text-destructive" role="alert">
          Ambang kuning harus lebih kecil dari ambang merah.
        </p>
      )}
      <Field label="Pengingat tutup hari bisnis" htmlFor="set-reminder-close" hint="Notifikasi untuk menutup hari (Z-report) pada jam ini.">
        <Input
          id="set-reminder-close"
          type="time"
          className="h-11 w-32"
          value={value.businessDayCloseReminder}
          onChange={(e) => onChange({ businessDayCloseReminder: e.target.value || '13:45' })}
        />
      </Field>
    </div>
  )
}
