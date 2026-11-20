'use client'

// Product editor drawer (SPEC §3.10): full form + variant group builder with a
// live customer-facing preview, debounced localStorage drafts, dirty guard.
// Product images can be pasted as URLs or uploaded from disk — uploads are
// compressed client-side (≤1024px, JPEG ladder, ≤300 KB) into data URLs.
import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronUp,
  Eye,
  ImageOff,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { formatIDR } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import {
  CategoryRow,
  MoneyInput,
  ProductRow,
  clearDraft,
  loadDraft,
  saveDraft,
  useDebouncedCallback,
} from './shared'

// ---------- Editor model ----------

export interface EditorOption {
  key: string
  label: string
  priceDelta: number | null
  isDefault: boolean
}

export interface EditorGroup {
  key: string
  name: string
  selectionType: 'SINGLE' | 'MULTI'
  isRequired: boolean
  minSelect: number
  maxSelect: number
  options: EditorOption[]
}

export interface EditorForm {
  name: string
  categoryId: string
  description: string
  imageUrl: string
  basePrice: number | null
  unitCost: number | null
  isActive: boolean
  isAvailable: boolean
  sortOrder: number
  groups: EditorGroup[]
}

export type EditorTarget =
  | { mode: 'edit'; product: ProductRow }
  | { mode: 'create'; prefill?: ProductRow }

let keySeq = 0
const nextKey = () => `k${Date.now().toString(36)}-${keySeq++}`

function formFromProduct(p: ProductRow): EditorForm {
  return {
    name: p.name,
    categoryId: p.category.id,
    description: p.description ?? '',
    imageUrl: p.imageUrl ?? '',
    basePrice: p.basePrice,
    unitCost: p.unitCost,
    isActive: p.isActive,
    isAvailable: p.isAvailable,
    sortOrder: p.sortOrder,
    groups: p.variantGroups.map((g) => ({
      key: nextKey(),
      name: g.name,
      selectionType: g.selectionType,
      isRequired: g.isRequired,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: g.options.map((o) => ({
        key: nextKey(),
        label: o.label,
        priceDelta: o.priceDelta,
        isDefault: o.isDefault,
      })),
    })),
  }
}

function draftKey(target: EditorTarget): string {
  return target.mode === 'edit' ? `sekelas:draft:product:${target.product.id}` : 'sekelas:draft:product:new'
}

function initForm(target: EditorTarget, categories: CategoryRow[]): EditorForm {
  if (target.mode === 'edit') return formFromProduct(target.product)
  if (target.prefill) {
    // Duplicate: clones everything except image and identity (SPEC §3.10).
    const f = formFromProduct(target.prefill)
    return { ...f, name: f.name + ' (Salinan)', imageUrl: '' }
  }
  return {
    name: '',
    categoryId: categories.find((c) => c.isActive)?.id ?? categories[0]?.id ?? '',
    description: '',
    imageUrl: '',
    basePrice: null,
    unitCost: null,
    isActive: true,
    isAvailable: true,
    sortOrder: 0,
    groups: [],
  }
}

function buildPayload(form: EditorForm) {
  return {
    name: form.name.trim(),
    categoryId: form.categoryId,
    description: form.description.trim() || null,
    imageUrl: form.imageUrl.trim() || null,
    basePrice: form.basePrice ?? 0,
    unitCost: form.unitCost,
    isActive: form.isActive,
    isAvailable: form.isAvailable,
    sortOrder: Number.isFinite(form.sortOrder) ? form.sortOrder : 0,
    variantGroups: form.groups.map((g, gi) => ({
      name: g.name.trim(),
      selectionType: g.selectionType,
      isRequired: g.isRequired,
      minSelect: g.selectionType === 'SINGLE' ? 0 : Math.max(0, g.minSelect || 0),
      maxSelect: g.selectionType === 'SINGLE' ? 1 : Math.max(1, g.maxSelect || 1),
      sortOrder: gi,
      options: g.options.map((o, oi) => ({
        label: o.label.trim(),
        priceDelta: o.priceDelta ?? 0,
        isDefault: o.isDefault,
        sortOrder: oi,
      })),
    })),
  }
}

function validate(form: EditorForm): string | null {
  if (!form.name.trim()) return 'Nama produk wajib diisi'
  if (!form.categoryId) return 'Kategori wajib dipilih'
  if (form.basePrice === null || form.basePrice < 0) return 'Harga dasar wajib diisi (≥ 0)'
  if (form.unitCost !== null && form.unitCost < 0) return 'HPP tidak boleh negatif'
  for (const [gi, g] of form.groups.entries()) {
    if (!g.name.trim()) return `Grup variasi ke-${gi + 1} belum punya nama`
    if (g.selectionType === 'MULTI' && g.maxSelect < 1) return `Grup "${g.name}": maksimal pilih minimal 1`
    if (g.selectionType === 'MULTI' && g.minSelect > g.maxSelect)
      return `Grup "${g.name}": minimal melebihi maksimal pilih`
    if (g.options.length === 0) return `Grup "${g.name}" belum punya opsi`
    for (const [oi, o] of g.options.entries()) {
      if (!o.label.trim()) return `Opsi ke-${oi + 1} pada grup "${g.name}" belum punya label`
      if (o.priceDelta === null) return `Opsi "${o.label || oi + 1}" pada grup "${g.name}" belum punya selisih harga (isi 0 bila tidak ada)`
    }
  }
  return null
}

// ---------- Client-side image compression (SPEC §3.10) ----------

const IMG_MAX_DIM = 1024
const IMG_TARGET_BYTES = 300 * 1024

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

/** Approximate byte size of a data URL (base64 ≈ 4/3 overhead). */
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

function scaleToCanvas(img: HTMLImageElement, maxDim: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Peramban tidak mendukung pemrosesan gambar')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Max side ≤1024px → JPEG 0.82 → ladder down to 0.5 → last resort 800px. */
async function compressProductImage(file: File): Promise<{ dataUrl: string; originalSize: number; compressedSize: number }> {
  const source = await readAsDataUrl(file)
  const img = await loadImage(source)
  let canvas = scaleToCanvas(img, IMG_MAX_DIM)
  let out = canvas.toDataURL('image/jpeg', 0.82)
  for (const quality of [0.72, 0.6, 0.5]) {
    if (dataUrlBytes(out) <= IMG_TARGET_BYTES) break
    out = canvas.toDataURL('image/jpeg', quality)
  }
  if (dataUrlBytes(out) > IMG_TARGET_BYTES) {
    canvas = scaleToCanvas(img, 800)
    out = canvas.toDataURL('image/jpeg', 0.7)
  }
  return { dataUrl: out, originalSize: file.size, compressedSize: dataUrlBytes(out) }
}

// ---------- Component ----------

export function ProductEditor({
  target,
  categories,
  onClosed,
  onSaved,
}: {
  target: EditorTarget
  categories: CategoryRow[]
  onClosed: () => void
  onSaved: () => void
}) {
  const [open, setOpen] = useState(true)
  const [baseline] = useState<EditorForm>(() => initForm(target, categories))
  const [form, setForm] = useState<EditorForm>(() => {
    const base = initForm(target, categories)
    // Draft restore (skip for duplicate — a duplicate starts clean from its source).
    if (target.mode === 'edit') {
      const draft = loadDraft<EditorForm>(draftKey(target))
      if (draft && typeof draft === 'object' && Array.isArray(draft.groups) && 'name' in draft) {
        return { ...base, ...draft, categoryId: draft.categoryId || base.categoryId }
      }
    }
    return base
  })
  const [draftRestored, setDraftRestored] = useState(() => {
    if (target.mode !== 'edit') return false
    return !!loadDraft<EditorForm>(draftKey(target))
  })
  const [showGuard, setShowGuard] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [imgBusy, setImgBusy] = useState(false)
  const [imgSizes, setImgSizes] = useState<{ original: number; compressed: number } | null>(null)
  const imgFileRef = useRef<HTMLInputElement>(null)

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline)
  const key = draftKey(target)

  // Debounced draft autosave (SPEC: product form drafts).
  const debouncedSave = useDebouncedCallback((value: EditorForm) => saveDraft(key, value), 800)
  useEffect(() => {
    if (dirty) debouncedSave(form)
  }, [form, dirty, debouncedSave])

  const closeNow = () => {
    setOpen(false)
    setTimeout(onClosed, 260)
  }
  const requestClose = () => {
    if (dirty) setShowGuard(true)
    else closeNow()
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(form)
      if (target.mode === 'edit') {
        return apiFetch(`/api/products/${target.product.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      }
      return apiFetch('/api/products', { method: 'POST', body: JSON.stringify(payload) })
    },
    onSuccess: () => {
      clearDraft(key)
      toast.success(
        target.mode === 'edit'
          ? `Produk "${form.name.trim()}" diperbarui`
          : `Produk "${form.name.trim()}" ditambahkan`
      )
      onSaved()
      closeNow()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleSave = () => {
    const problem = validate(form)
    if (problem) {
      toast.error(problem)
      return
    }
    saveMutation.mutate()
  }

  // ----- image upload (compressed client-side into a data URL) -----
  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Berkas harus berupa gambar (JPG/PNG/WebP)')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Ukuran berkas maksimal 15 MB')
      return
    }
    setImgBusy(true)
    try {
      const { dataUrl, originalSize, compressedSize } = await compressProductImage(file)
      setImgError(false)
      setImgSizes({ original: originalSize, compressed: compressedSize })
      patch({ imageUrl: dataUrl })
      toast.success(`Gambar terkompresi — ${formatBytes(originalSize)} → ${formatBytes(compressedSize)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memproses gambar')
    } finally {
      setImgBusy(false)
    }
  }

  // ----- helpers to patch nested state -----
  const patch = (p: Partial<EditorForm>) => setForm((f) => ({ ...f, ...p }))
  const patchGroup = (gk: string, p: Partial<EditorGroup>) =>
    setForm((f) => ({ ...f, groups: f.groups.map((g) => (g.key === gk ? { ...g, ...p } : g)) }))
  const patchOption = (gk: string, ok: string, p: Partial<EditorOption>) =>
    setForm((f) => ({
      ...f,
      groups: f.groups.map((g) =>
        g.key !== gk
          ? g
          : { ...g, options: g.options.map((o) => (o.key === ok ? { ...o, ...p } : o)) }
      ),
    }))
  const moveItem = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
    const j = i + dir
    if (j < 0 || j >= arr.length) return arr
    const copy = [...arr]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    return copy
  }
  const addGroup = () =>
    setForm((f) => ({
      ...f,
      groups: [
        ...f.groups,
        {
          key: nextKey(),
          name: '',
          selectionType: 'SINGLE',
          isRequired: true,
          minSelect: 0,
          maxSelect: 1,
          options: [{ key: nextKey(), label: '', priceDelta: 0, isDefault: true }],
        },
      ],
    }))
  const removeGroup = (gk: string) =>
    setForm((f) => ({ ...f, groups: f.groups.filter((g) => g.key !== gk) }))
  const addOption = (gk: string) =>
    setForm((f) => ({
      ...f,
      groups: f.groups.map((g) =>
        g.key !== gk ? g : { ...g, options: [...g.options, { key: nextKey(), label: '', priceDelta: 0, isDefault: false }] }
      ),
    }))
  const removeOption = (gk: string, ok: string) =>
    setForm((f) => ({
      ...f,
      groups: f.groups.map((g) =>
        g.key !== gk ? g : { ...g, options: g.options.filter((o) => o.key !== ok) }
      ),
    }))
  const setDefault = (gk: string, ok: string) =>
    setForm((f) => ({
      ...f,
      groups: f.groups.map((g) =>
        g.key !== gk
          ? g
          : { ...g, options: g.options.map((o) => ({ ...o, isDefault: o.key === ok })) }
      ),
    }))

  const activeCategories = categories.filter((c) => c.isActive || c.id === form.categoryId)

  return (
    <Sheet open={open} onOpenChange={(o) => !o && requestClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl lg:max-w-4xl scrollbar-warm"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur md:px-6">
          <SheetTitle className="font-display">
            {target.mode === 'edit' ? 'Edit Produk' : 'Produk Baru'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Formulir produk beserta grup variasi dan pratinjau tampilan pelanggan.
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {draftRestored && dirty && (
              <Badge variant="outline" className="border-caramel/50 bg-caramel/10 text-warning">
                Draf lokal dipulihkan
              </Badge>
            )}
            {dirty && (
              <span className="text-xs font-medium text-warning">perubahan belum disimpan</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={requestClose} className="h-11 px-4">
                Tutup
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="h-11 bg-espresso px-5 text-cream hover:bg-espresso-soft"
              >
                {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />}
                Simpan
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="grid gap-6 px-4 py-4 md:px-6 lg:grid-cols-[1fr_340px]">
          {/* ----- left: form ----- */}
          <div className="space-y-6">
            <section className="space-y-4" aria-label="Data produk">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="p-name">Nama produk</Label>
                  <Input
                    id="p-name"
                    value={form.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    placeholder="cth. Kopi Susu Gula Aren"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Kategori</Label>
                  <Select value={form.categoryId} onValueChange={(v) => patch({ categoryId: v })}>
                    <SelectTrigger className="h-11 w-full" aria-label="Kategori">
                      <SelectValue placeholder="Pilih kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {!c.isActive && ' (nonaktif)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-desc">Deskripsi</Label>
                <Textarea
                  id="p-desc"
                  rows={2}
                  value={form.description}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="Deskripsi singkat yang tampil di menu pelanggan"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="p-img">URL gambar</Label>
                  <Input
                    id="p-img"
                    value={form.imageUrl.startsWith('data:') ? '(gambar terunggah — tersimpan bersama produk)' : form.imageUrl}
                    onChange={(e) => {
                      setImgError(false)
                      setImgSizes(null)
                      patch({ imageUrl: e.target.value })
                    }}
                    readOnly={form.imageUrl.startsWith('data:')}
                    placeholder="https://… (atau unggah berkas)"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={imgFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handleImageFile(e)}
                      aria-label="Unggah gambar produk"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-11"
                      onClick={() => imgFileRef.current?.click()}
                      disabled={imgBusy}
                    >
                      {imgBusy ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Upload className="mr-1 h-4 w-4" aria-hidden />
                      )}
                      Unggah Gambar
                    </Button>
                    {imgSizes && form.imageUrl.startsWith('data:') && (
                      <span className="font-mono text-xs text-success">
                        {formatBytes(imgSizes.original)} → {formatBytes(imgSizes.compressed)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tempel tautan gambar atau unggah berkas — unggahan otomatis dikompresi (sisi maks. 1024 px, hasil ≤ 300 KB).
                  </p>
                </div>
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">Pratinjau gambar</span>
                  <div className="flex h-[52px] items-center gap-3">
                    {form.imageUrl && !imgError ? (
                       
                      <img
                        src={form.imageUrl}
                        alt="Pratinjau gambar produk"
                        className="h-[52px] w-[52px] rounded-lg border object-cover"
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-lg bg-gradient-to-br from-caramel-pale to-caramel text-espresso-deep" aria-hidden>
                        {form.imageUrl ? <ImageOff className="h-5 w-5" /> : <span className="font-display text-xl font-semibold">{form.name.trim().charAt(0).toUpperCase() || '?'}</span>}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {form.imageUrl
                        ? imgError
                          ? 'Gambar gagal dimuat — periksa tautannya'
                          : form.imageUrl.startsWith('data:')
                            ? 'Gambar terunggah & terkompresi'
                            : 'Gambar dimuat dari tautan'
                        : 'Tanpa gambar — dipakai tempelan karamel'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="p-price">Harga dasar</Label>
                  <MoneyInput
                    id="p-price"
                    ariaLabel="Harga dasar"
                    value={form.basePrice}
                    onChange={(v) => patch({ basePrice: v })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-cost">HPP / porsi (opsional)</Label>
                  <MoneyInput
                    id="p-cost"
                    ariaLabel="Harga pokok per porsi"
                    value={form.unitCost}
                    onChange={(v) => patch({ unitCost: v })}
                    placeholder="untuk laporan margin"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <span className="text-sm font-medium">Aktif <span className="block text-xs font-normal text-muted-foreground">tampil di menu</span></span>
                  <Switch checked={form.isActive} onCheckedChange={(v) => patch({ isActive: v })} aria-label="Produk aktif" />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <span className="text-sm font-medium">Tersedia <span className="block text-xs font-normal text-muted-foreground">bisa dipesan</span></span>
                  <Switch checked={form.isAvailable} onCheckedChange={(v) => patch({ isAvailable: v })} aria-label="Produk tersedia" />
                </label>
                <div className="space-y-1.5">
                  <Label htmlFor="p-sort">Urutan tampil</Label>
                  <Input
                    id="p-sort"
                    type="number"
                    className="h-11"
                    value={form.sortOrder}
                    onChange={(e) => patch({ sortOrder: parseInt(e.target.value || '0', 10) || 0 })}
                  />
                </div>
              </div>
            </section>

            <Separator />

            {/* ----- variant groups builder ----- */}
            <section className="space-y-4" aria-label="Grup variasi">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-semibold">Grup Variasi</h3>
                  <p className="text-xs text-muted-foreground">
                    Opsi pilihan pelanggan — cth. Ukuran, Gula, Topping.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={addGroup} className="h-11">
                  <Plus className="mr-1 h-4 w-4" aria-hidden /> Grup
                </Button>
              </div>

              {form.groups.length === 0 && (
                <p className="rounded-xl border border-dashed bg-cream/50 p-4 text-sm text-muted-foreground">
                  Belum ada grup variasi — produk ini dipesan apa adanya.
                </p>
              )}

              <div className="space-y-4">
                {form.groups.map((g, gi) => (
                  <div key={g.key} className="rounded-xl border p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                      <div className="space-y-1.5">
                        <Label htmlFor={`g-name-${g.key}`}>Nama grup</Label>
                        <Input
                          id={`g-name-${g.key}`}
                          value={g.name}
                          onChange={(e) => patchGroup(g.key, { name: e.target.value })}
                          placeholder="cth. Ukuran"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`g-type-${g.key}`}>Jenis</Label>
                        <Select
                          value={g.selectionType}
                          onValueChange={(v) => patchGroup(g.key, { selectionType: v as 'SINGLE' | 'MULTI' })}
                        >
                          <SelectTrigger id={`g-type-${g.key}`} className="h-11 w-[150px]" aria-label="Jenis pilihan">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SINGLE">Pilih satu</SelectItem>
                            <SelectItem value="MULTI">Pilih banyak</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="flex h-11 items-center gap-2 rounded-xl border px-3">
                        <Switch
                          checked={g.isRequired}
                          onCheckedChange={(v) => patchGroup(g.key, { isRequired: v })}
                          aria-label="Grup wajib dipilih"
                        />
                        <span className="text-sm">Wajib</span>
                      </label>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-11 w-11"
                          disabled={gi === 0}
                          onClick={() => setForm((f) => ({ ...f, groups: moveItem(f.groups, gi, -1) }))}
                          aria-label="Naikkan grup"
                        >
                          <ChevronUp className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-11 w-11"
                          disabled={gi === form.groups.length - 1}
                          onClick={() => setForm((f) => ({ ...f, groups: moveItem(f.groups, gi, 1) }))}
                          aria-label="Turunkan grup"
                        >
                          <ChevronDown className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-11 w-11 text-destructive hover:bg-destructive/10"
                          onClick={() => removeGroup(g.key)}
                          aria-label="Hapus grup"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </div>

                    {g.selectionType === 'MULTI' && (
                      <div className="mt-3 grid max-w-xs grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor={`g-min-${g.key}`}>Min. pilih</Label>
                          <Input
                            id={`g-min-${g.key}`}
                            type="number"
                            min={0}
                            className="h-11"
                            value={g.minSelect}
                            onChange={(e) => patchGroup(g.key, { minSelect: parseInt(e.target.value || '0', 10) || 0 })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`g-max-${g.key}`}>Maks. pilih</Label>
                          <Input
                            id={`g-max-${g.key}`}
                            type="number"
                            min={1}
                            className="h-11"
                            value={g.maxSelect}
                            onChange={(e) => patchGroup(g.key, { maxSelect: parseInt(e.target.value || '1', 10) || 1 })}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Opsi ({g.options.length}) — tandai satu sebagai bawaan
                      </p>
                      {g.options.map((o, oi) => (
                        <div key={o.key} className="grid items-center gap-2 rounded-lg bg-cream/60 p-2 sm:grid-cols-[auto_1fr_170px_auto_auto]">
                          <input
                            type="radio"
                            name={`default-${g.key}`}
                            checked={o.isDefault}
                            onChange={() => setDefault(g.key, o.key)}
                            className="h-4 w-4 accent-[#c68b33]"
                            aria-label={`Jadikan "${o.label || 'opsi'}" bawaan`}
                          />
                          <Input
                            value={o.label}
                            onChange={(e) => patchOption(g.key, o.key, { label: e.target.value })}
                            placeholder={`Opsi ${oi + 1}`}
                            aria-label="Label opsi"
                          />
                          <MoneyInput
                            value={o.priceDelta}
                            onChange={(v) => patchOption(g.key, o.key, { priceDelta: v })}
                            allowNegative
                            placeholder="selisih harga"
                            ariaLabel="Selisih harga opsi"
                          />
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-11 w-11"
                              disabled={oi === 0}
                              onClick={() =>
                                patchGroup(g.key, { options: moveItem(g.options, oi, -1) })
                              }
                              aria-label="Naikkan opsi"
                            >
                              <ChevronUp className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-11 w-11"
                              disabled={oi === g.options.length - 1}
                              onClick={() =>
                                patchGroup(g.key, { options: moveItem(g.options, oi, 1) })
                              }
                              aria-label="Turunkan opsi"
                            >
                              <ChevronDown className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-11 w-11 text-destructive hover:bg-destructive/10"
                              onClick={() => removeOption(g.key, o.key)}
                              aria-label="Hapus opsi"
                            >
                              <X className="h-4 w-4" aria-hidden />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <Button variant="ghost" size="sm" onClick={() => addOption(g.key)} className="h-11 text-caramel hover:bg-caramel/10">
                        <Plus className="mr-1 h-4 w-4" aria-hidden /> Opsi
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* ----- right: live customer preview ----- */}
          <aside aria-label="Pratinjau tampilan pelanggan" className="lg:sticky lg:top-32 lg:self-start">
            <div className="overflow-hidden rounded-2xl border shadow-sm">
              <div className="flex items-center gap-2 bg-espresso px-4 py-2 text-cream">
                <Eye className="h-4 w-4" aria-hidden />
                <p className="text-sm font-semibold">Pratinjau lembar pelanggan</p>
              </div>
              <ProductPreview form={form} imgError={imgError} onImgError={() => setImgError(true)} />
            </div>
          </aside>
        </div>
      </SheetContent>

      {/* dirty guard */}
      <AlertDialog open={showGuard} onOpenChange={setShowGuard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Perubahan belum disimpan</AlertDialogTitle>
            <AlertDialogDescription>
              Ada perubahan pada produk ini yang belum disimpan. Simpan dulu, atau buang dan kembali
              ke kondisi terakhir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali Mengedit</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                clearDraft(key)
                setShowGuard(false)
                closeNow()
              }}
            >
              Buang Perubahan
            </Button>
            <AlertDialogAction
              onClick={() => {
                const problem = validate(form)
                if (problem) {
                  toast.error(problem)
                  setShowGuard(false)
                  return
                }
                saveMutation.mutate()
                setShowGuard(false)
              }}
            >
              Simpan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}

// ---------- Live preview (customer-facing sheet, exactly as being built) ----------

function ProductPreview({
  form,
  imgError,
  onImgError,
}: {
  form: EditorForm
  imgError: boolean
  onImgError: () => void
}) {
  const [previewSel, setPreviewSel] = useState<Record<string, string[]>>({})
  const [qty, setQty] = useState(1)

  const selectedKeys = (g: EditorGroup): string[] => {
    const stored = previewSel[g.key]
    if (stored !== undefined) {
      return stored.filter((k) => g.options.some((o) => o.key === k))
    }
    const defs = g.options.filter((o) => o.isDefault).map((o) => o.key)
    if (g.selectionType === 'SINGLE') {
      if (defs.length > 0) return [defs[0]]
      return g.options[0] ? [g.options[0].key] : []
    }
    return defs
  }

  const toggle = (g: EditorGroup, key: string) => {
    const current = selectedKeys(g)
    if (g.selectionType === 'SINGLE') {
      setPreviewSel((s) => ({ ...s, [g.key]: [key] }))
      return
    }
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key].slice(-(g.maxSelect || 99))
    setPreviewSel((s) => ({ ...s, [g.key]: next }))
  }

  const deltas = form.groups.reduce((sum, g) => {
    const sel = selectedKeys(g)
    return sum + g.options.filter((o) => sel.includes(o.key)).reduce((s, o) => s + (o.priceDelta ?? 0), 0)
  }, 0)
  const unitPrice = (form.basePrice ?? 0) + deltas
  const showPrice = form.basePrice !== null

  return (
    <div className="bg-cream">
      <div className="relative h-36 bg-gradient-to-br from-caramel-pale to-caramel">
        {form.imageUrl && !imgError ? (
           
          <img src={form.imageUrl} alt={form.name || 'Produk'} className="h-full w-full object-cover" onError={onImgError} />
        ) : (
          <span className="flex h-full items-center justify-center font-display text-5xl font-semibold text-espresso-deep/70" aria-hidden>
            {form.name.trim().charAt(0).toUpperCase() || '?'}
          </span>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-lg font-semibold leading-tight">{form.name.trim() || 'Nama produk'}</p>
            {form.description.trim() && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{form.description.trim()}</p>
            )}
          </div>
          <p className="shrink-0 font-mono text-base font-semibold tabular-nums">
            {showPrice ? formatIDR(unitPrice) : 'Rp —'}
          </p>
        </div>

        {form.groups.length === 0 && (
          <p className="rounded-lg border border-dashed border-caramel/40 bg-background/60 p-3 text-xs text-muted-foreground">
            Produk tanpa variasi — pelanggan langsung menambah jumlah.
          </p>
        )}

        {form.groups.map((g) => {
          const sel = selectedKeys(g)
          return (
            <div key={g.key}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="text-sm font-semibold">
                  {g.name.trim() || 'Nama grup'}
                  {g.isRequired && <span className="ml-1 text-xs text-destructive">wajib</span>}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {g.selectionType === 'SINGLE'
                    ? 'pilih satu'
                    : `pilih ${g.minSelect > 0 ? `${g.minSelect}–` : 'hingga '}${g.maxSelect}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.options.map((o) => {
                  const active = sel.includes(o.key)
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => toggle(g, o.key)}
                      className={cn(
                        'min-h-11 rounded-full border px-3 py-1.5 text-sm transition-colors',
                        active
                          ? 'border-espresso bg-espresso text-cream'
                          : 'border-caramel/40 bg-background hover:border-caramel'
                      )}
                      aria-pressed={active}
                    >
                      {o.label.trim() || 'opsi'}
                      {(o.priceDelta ?? 0) !== 0 && (
                        <span className={cn('ml-1 font-mono text-xs tabular-nums', active ? 'text-caramel-pale' : 'text-muted-foreground')}>
                          {(o.priceDelta ?? 0) > 0 ? '+' : ''}
                          {formatIDR(o.priceDelta ?? 0).replace('Rp ', '')}
                        </span>
                      )}
                    </button>
                  )
                })}
                {g.options.length === 0 && (
                  <span className="text-xs italic text-muted-foreground">belum ada opsi</span>
                )}
              </div>
            </div>
          )
        })}

        <div className="flex items-center gap-3 border-t border-caramel/30 pt-3">
          <div className="flex items-center rounded-full border border-caramel/40">
            <button
              type="button"
              className="h-11 w-11 text-lg font-semibold"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="Kurangi jumlah"
            >
              −
            </button>
            <span className="w-8 text-center font-mono tabular-nums" aria-live="polite">{qty}</span>
            <button
              type="button"
              className="h-11 w-11 text-lg font-semibold"
              onClick={() => setQty((q) => Math.min(99, q + 1))}
              aria-label="Tambah jumlah"
            >
              +
            </button>
          </div>
          <div
            className={cn(
              'flex h-11 flex-1 items-center justify-center rounded-full font-semibold',
              form.isAvailable && form.isActive
                ? 'bg-caramel text-espresso-deep'
                : 'bg-muted text-muted-foreground'
            )}
            aria-label="Tombol tambah keranjang pratinjau"
          >
            {form.isAvailable && form.isActive
              ? `Tambah — ${showPrice ? formatIDR(unitPrice * qty) : 'Rp —'}`
              : 'Stok habis / tidak tampil'}
          </div>
        </div>
      </div>
    </div>
  )
}
