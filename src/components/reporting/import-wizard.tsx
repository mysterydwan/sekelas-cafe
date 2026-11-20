'use client'

// Excel import wizard (Admin): upload → parse/preview → confirm → apply.
import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FileUp,
  Info,
  RotateCcw,
  Upload,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, ApiError } from '@/lib/client'
import { apiFetchForm, downloadCsv } from './download'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type ImportTypeUI = 'PRODUCTS' | 'STOCK' | 'RECIPES' | 'USERS'

interface ImportRowUI {
  row: number
  data: Record<string, string>
  status: 'NEW' | 'UPDATE' | 'ERROR'
  message?: string
  current?: Record<string, string>
}

interface PreviewUI {
  rows: ImportRowUI[]
  counts: { new: number; update: number; error: number }
}

interface CommitUI {
  inserted: number
  updated: number
  failed: { row: number; message: string }[]
  snapshotSaved: boolean
}

const TYPES: { value: ImportTypeUI; label: string; desc: string }[] = [
  { value: 'PRODUCTS', label: 'Produk', desc: 'Menu + varian — dicocokkan berdasarkan NAMA produk' },
  { value: 'STOCK', label: 'Bahan Stok', desc: 'Item stok — dicocokkan berdasarkan SKU' },
  { value: 'RECIPES', label: 'Resep', desc: 'Takaran bahan — dicocokkan berdasarkan produk + SKU bahan' },
  { value: 'USERS', label: 'Pengguna', desc: 'Akun staf — dicocokkan berdasarkan USERNAME' },
]

const DIFF_KEYS: Record<ImportTypeUI, string[]> = {
  PRODUCTS: ['Nama', 'Kategori', 'Harga Dasar', 'Harga Satuan', 'Aktif', 'Tersedia'],
  STOCK: ['SKU', 'Nama', 'Satuan', 'Jumlah', 'Ambang Rendah', 'Biaya Satuan', 'Aktif'],
  RECIPES: ['Produk', 'SKU Bahan', 'Takaran per Porsi'],
  USERS: ['Username', 'Nama', 'Peran', 'PIN', 'Aktif', 'Latihan'],
}

const PRIMARY_KEYS: Record<ImportTypeUI, string[]> = {
  PRODUCTS: ['Nama', 'Kategori', 'Harga Dasar'],
  STOCK: ['SKU', 'Nama', 'Jumlah'],
  RECIPES: ['Produk', 'SKU Bahan', 'Takaran per Porsi'],
  USERS: ['Username', 'Nama', 'Peran'],
}

function csvEscape(v: string): string {
  return `"${String(v).replace(/"/g, '""')}"`
}

export function ImportWizard() {
  const qc = useQueryClient()
  const [type, setType] = useState<ImportTypeUI>('PRODUCTS')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewUI | null>(null)
  const [result, setResult] = useState<CommitUI | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const previewM = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('type', type)
      return apiFetchForm<PreviewUI>('/api/data/import/preview', fd)
    },
    onSuccess: (data) => {
      setPreview(data)
      setResult(null)
      toast.success(`Berkas terbaca: ${data.rows.length} baris`)
    },
    onError: (e) => {
      setPreview(null)
      toast.error(e instanceof Error ? e.message : 'Gagal membaca berkas')
    },
  })

  const commitM = useMutation({
    mutationFn: (rows: ImportRowUI[]) =>
      apiFetch<CommitUI>('/api/data/import/commit', {
        method: 'POST',
        body: JSON.stringify({ type, rows, fileName: file?.name }),
      }),
    onSuccess: (data) => {
      setResult(data)
      setConfirmOpen(false)
      void qc.invalidateQueries()
      if (data.failed.length === 0) {
        toast.success(`Impor selesai: ${data.inserted} ditambah, ${data.updated} diperbarui`)
      } else {
        toast.warning(`Impor selesai: ${data.inserted} ditambah, ${data.updated} diperbarui, ${data.failed.length} gagal`)
      }
    },
    onError: (e) => {
      setConfirmOpen(false)
      toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Gagal menerapkan impor')
    },
  })

  function onPick(f: File | null) {
    setFileError(null)
    setPreview(null)
    setResult(null)
    if (!f) return
    const name = f.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      setFileError('Format berkas harus .xlsx atau .csv')
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setFileError('Ukuran berkas melebihi 5 MB')
      return
    }
    if (f.size === 0) {
      setFileError('Berkas kosong')
      return
    }
    setFile(f)
  }

  function reset() {
    setType('PRODUCTS')
    setFile(null)
    setFileError(null)
    setPreview(null)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const validRows = preview ? preview.rows.filter((r) => r.status !== 'ERROR') : []
  const typeMeta = TYPES.find((t) => t.value === type)!

  function downloadErrors() {
    if (!result || !preview) return
    const byRow = new Map(preview.rows.map((r) => [r.row, r]))
    const lines = ['Baris,Pesan,Data']
    for (const f of result.failed) {
      const r = byRow.get(f.row)
      lines.push([String(f.row), csvEscape(f.message), csvEscape(JSON.stringify(r?.data ?? {}))].join(','))
    }
    downloadCsv(`impor-${type.toLowerCase()}-gagal.csv`, lines)
  }

  return (
    <div className="space-y-4">
      {/* Step 1: pick type + file */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="import-type">Jenis data</Label>
          <Select value={type} onValueChange={(v) => { setType(v as ImportTypeUI); setPreview(null); setResult(null) }}>
            <SelectTrigger id="import-type" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{typeMeta.desc}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="import-file">Berkas Excel (.xlsx / .csv)</Label>
          <Input
            ref={fileInputRef}
            id="import-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="h-11 cursor-pointer file:mr-3 file:cursor-pointer"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">Maksimal 5 MB dan 2.000 baris data.</p>
          {fileError && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-destructive" role="alert">
              <XCircle className="h-3.5 w-3.5" /> {fileError}
            </p>
          )}
        </div>
      </div>

      {file && !preview && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-cream p-3">
          <p className="flex items-center gap-2 text-sm">
            <FileSpreadsheet className="h-4 w-4 text-caramel" />
            <span className="font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
          </p>
          <Button onClick={() => previewM.mutate(file)} disabled={previewM.isPending}>
            {previewM.isPending ? 'Membaca…' : 'Pratinjau'}
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 2: preview */}
      {preview && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-success/15 text-success hover:bg-success/15">BARU: {preview.counts.new}</Badge>
            <Badge className="bg-warning/15 text-warning hover:bg-warning/15">PERBARUI: {preview.counts.update}</Badge>
            <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">GAGAL: {preview.counts.error}</Badge>
            <span className="ml-auto font-mono text-xs text-muted-foreground">{file?.name}</span>
          </div>

          {preview.counts.new + preview.counts.update + preview.counts.error === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Tidak ada baris data</AlertTitle>
              <AlertDescription>Berkas hanya berisi baris judul. Isi datanya dulu atau unduh template.</AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="max-h-96 overflow-y-auto scrollbar-warm">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-cream-deep/80 backdrop-blur">
                    <tr className="text-left text-xs">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => {
                      const isVariant = r.data['__sheet'] === 'varian'
                      const primary = (isVariant ? ['Produk', 'Grup', 'Opsi', 'Harga Delta'] : PRIMARY_KEYS[type])
                        .map((k) => `${k}: ${r.data[k] ?? '—'}`)
                        .join(' · ')
                      return (
                        <tr key={r.row} className="border-t align-top">
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.row}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {r.status === 'NEW' && (
                              <Badge className="bg-success/15 text-success hover:bg-success/15">BARU</Badge>
                            )}
                            {r.status === 'UPDATE' && (
                              <Badge className="bg-warning/15 text-warning hover:bg-warning/15">PERBARUI</Badge>
                            )}
                            {r.status === 'ERROR' && (
                              <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">GAGAL</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <p className={cn('font-mono text-xs', isVariant && 'text-muted-foreground')}>{primary}</p>
                            {r.status === 'ERROR' && r.message && (
                              <p className="mt-0.5 text-xs font-medium text-destructive">{r.message}</p>
                            )}
                            {r.status === 'UPDATE' && r.current && (
                              <div className="mt-1 space-y-0.5">
                                {DIFF_KEYS[type]
                                  .filter((k) => (r.data[k] ?? '') !== (r.current?.[k] ?? ''))
                                  .map((k) => (
                                    <p key={k} className="text-xs">
                                      <span className="text-muted-foreground">{k}:</span>{' '}
                                      <span className="text-muted-foreground line-through">{r.current?.[k] || '(kosong)'}</span>
                                      <span className="mx-1">→</span>
                                      <span className="font-semibold text-warning">{r.data[k] || '(kosong)'}</span>
                                    </p>
                                  ))}
                                {DIFF_KEYS[type].every((k) => (r.data[k] ?? '') === (r.current?.[k] ?? '')) && (
                                  <p className="text-xs text-muted-foreground">Tidak ada perubahan nilai.</p>
                                )}
                              </div>
                            )}
                            {r.status === 'UPDATE' && !r.current && r.message && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{r.message}</p>
                            )}
                            {r.status === 'NEW' && r.message && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{r.message}</p>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <Button disabled={validRows.length === 0 || commitM.isPending} onClick={() => setConfirmOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Terapkan {validRows.length} baris
              </Button>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Terapkan {validRows.length} baris?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2">
                      <p>
                        {preview.counts.new} baris baru akan ditambahkan dan {preview.counts.update} baris akan{' '}
                        <span className="font-semibold text-warning">memperbarui data yang ada</span> (nilai lama
                        ditimpa). {preview.counts.error} baris gagal tidak akan diterapkan.
                      </p>
                      <p className="flex items-start gap-1.5 text-xs">
                        <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Snapshot data lama otomatis dibuat sebelum impor (folder db/snapshots) — hasil tetap permanen
                        setelah diterapkan.
                      </p>
                      {preview.counts.update > 0 && (
                        <p className="flex items-start gap-1.5 text-xs text-destructive">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Ada perubahan pada data lama — periksa ulang diff PERBARUI di pratinjau.
                        </p>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault()
                      commitM.mutate(validRows)
                    }}
                    disabled={commitM.isPending}
                  >
                    {commitM.isPending ? 'Menerapkan…' : 'Ya, terapkan sekarang'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="ghost" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" /> Impor lain
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: result */}
      {result && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Impor selesai</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              <p>
                <span className="font-semibold text-success">{result.inserted} ditambah</span>,{' '}
                <span className="font-semibold text-warning">{result.updated} diperbarui</span>
                {result.failed.length > 0 && (
                  <>
                    , <span className="font-semibold text-destructive">{result.failed.length} gagal</span>
                  </>
                )}
                .
              </p>
              {result.failed.length > 0 && (
                <div className="space-y-1">
                  <ul className="max-h-32 space-y-0.5 overflow-y-auto scrollbar-warm text-xs">
                    {result.failed.map((f, i) => (
                      <li key={i} className="font-mono">
                        Baris {f.row}: <span className="font-sans text-destructive">{f.message}</span>
                      </li>
                    ))}
                  </ul>
                  <Button variant="outline" size="sm" onClick={downloadErrors}>
                    <FileUp className="mr-1.5 h-3.5 w-3.5" /> Unduh laporan galat (.csv)
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {result.snapshotSaved
                  ? 'Snapshot otomatis tersimpan di db/snapshots sebelum impor diterapkan.'
                  : 'Snapshot otomatis gagal dibuat (folder db/snapshots tidak dapat ditulis).'}
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
