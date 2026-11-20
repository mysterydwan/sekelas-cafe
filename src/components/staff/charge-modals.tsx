'use client'

// Charge modals (SPEC §3.6): CASH keypad w/ quick tenders + HUGE change,
// QRIS static code + reminder protocol, SPLIT invariant sum=total.
// Reused by POS (new order + open orders) and order detail (SPEC §3.9).
// Also exports QrisVerifyDialog for the pending-verification rail.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Banknote, QrCode, Split, AlertTriangle, Check, Printer, RotateCcw, Delete, ShieldAlert } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatIDR } from '@/lib/format'
import type { OrderDTO, PaymentInput, SettingsDTO } from '@/lib/types'
import { printKot, printReceipt, printReceiptPair } from './receipt'

export interface ChargeResult {
  order: OrderDTO
  printKot: boolean
  printReceipt: boolean
}

const QUICK_TENDERS = [5000, 10000, 20000, 50000, 100000]

function parseDigits(d: string): number {
  if (!d) return 0
  const n = parseInt(d, 10)
  return Number.isFinite(n) ? n : 0
}

function AmountKeypad({ digits, onChange }: { digits: string; onChange: (next: string) => void }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del']
  const press = (k: string) => {
    if (k === 'del') return onChange(digits.slice(0, -1))
    if (digits.length >= 9) return
    if (digits === '' && k === '00') return
    onChange(digits + k)
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => press(k)}
          className="flex min-h-[48px] items-center justify-center rounded-lg border bg-background text-lg font-semibold tabular-nums transition-all hover:border-caramel active:scale-95 active:bg-cream"
          aria-label={k === 'del' ? 'Hapus angka' : k}
        >
          {k === 'del' ? <Delete className="h-5 w-5" aria-hidden /> : k}
        </button>
      ))}
    </div>
  )
}

function MethodPicker({
  value,
  onChange,
  splitEnabled,
}: {
  value: 'CASH' | 'QRIS' | 'SPLIT'
  onChange: (m: 'CASH' | 'QRIS' | 'SPLIT') => void
  splitEnabled: boolean
}) {
  const methods: { id: 'CASH' | 'QRIS' | 'SPLIT'; label: string; icon: typeof Banknote }[] = [
    { id: 'CASH', label: 'Tunai', icon: Banknote },
    { id: 'QRIS', label: 'QRIS', icon: QrCode },
    ...(splitEnabled ? [{ id: 'SPLIT' as const, label: 'Campuran', icon: Split }] : []),
  ]
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Metode pembayaran">
      {methods.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={value === m.id}
          onClick={() => onChange(m.id)}
          className={cn(
            'flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-sm font-medium transition-all',
            value === m.id
              ? 'border-caramel bg-caramel/15 text-espresso shadow-sm dark:text-caramel-light'
              : 'bg-background hover:border-caramel/60'
          )}
        >
          <m.icon className="h-5 w-5" aria-hidden />
          {m.label}
        </button>
      ))}
    </div>
  )
}

export function ChargeDialog({
  open,
  onOpenChange,
  total,
  settings,
  title = 'Terima Pembayaran',
  subtitle,
  onSubmit,
  onSettled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  total: number
  settings: SettingsDTO
  title?: string
  subtitle?: string
  onSubmit: (payment: PaymentInput) => Promise<ChargeResult>
  onSettled?: (order: OrderDTO) => void
}) {
  const [phase, setPhase] = useState<'form' | 'success' | 'error'>('form')
  const [method, setMethod] = useState<'CASH' | 'QRIS' | 'SPLIT'>('CASH')
  const [cashDigits, setCashDigits] = useState('')
  const [splitDigits, setSplitDigits] = useState('')
  const [qrRef, setQrRef] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [result, setResult] = useState<ChargeResult | null>(null)

  useEffect(() => {
    if (open) {
      setPhase('form')
      setMethod('CASH')
      setCashDigits('')
      setSplitDigits('')
      setQrRef('')
      setSubmitting(false)
      setErrorMsg('')
      setResult(null)
    }
  }, [open])

  const cashReceived = parseDigits(cashDigits)
  const change = cashReceived - total
  const splitCash = parseDigits(splitDigits)
  const splitQris = total - splitCash

  const valid = (() => {
    if (method === 'CASH') return cashReceived >= total && total > 0
    if (method === 'QRIS') return total > 0
    return splitCash > 0 && splitCash < total
  })()

  const invalidReason = (() => {
    if (method === 'CASH' && cashReceived < total) return `Uang diterima kurang ${formatIDR(total - cashReceived)}`
    if (method === 'SPLIT' && splitCash <= 0) return 'Porsi tunai minimal Rp 1'
    if (method === 'SPLIT' && splitCash >= total) return 'Porsi tunai harus kurang dari total'
    return null
  })()

  const buildPayment = (): PaymentInput => {
    if (method === 'CASH') return { method: 'CASH', cashReceived }
    if (method === 'QRIS') return { method: 'QRIS', qrReference: qrRef.trim() || undefined }
    return { method: 'SPLIT', cashPortion: splitCash, qrReference: qrRef.trim() || undefined }
  }

  const submit = async () => {
    if (!valid || submitting) return
    setSubmitting(true)
    setErrorMsg('')
    try {
      const res = await onSubmit(buildPayment())
      setResult(res)
      setPhase('success')
      onSettled?.(res.order)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Pembayaran gagal diproses')
      setPhase('error')
    } finally {
      setSubmitting(false)
    }
  }

  // Cmd/Ctrl+Enter confirms (SPEC §1.5 shortcuts)
  useEffect(() => {
    if (!open || phase !== 'form') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void submit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
     
  }, [open, phase, valid, cashDigits, splitDigits, qrRef, method, submitting])

  // auto-print per settings.receipts.autoPrint* (SPEC §3.6). When both flags
  // are set, printReceiptPair opens the two sequential dialogs (KOT first,
  // then receipt) — back-to-back single-template calls raced the browser's
  // print dialog and dropped the second one.
  useEffect(() => {
    if (phase !== 'success' || !result) return
    const t = setTimeout(() => {
      if (result.printReceipt && result.printKot) printReceiptPair(result.order, settings.receipts)
      else if (result.printReceipt) printReceipt(result.order, settings.receipts)
      else if (result.printKot) printKot(result.order, settings.receipts)
    }, 350)
    return () => clearTimeout(t)

  }, [phase, result])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        {phase !== 'success' && (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </DialogHeader>
        )}

        {phase === 'form' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-espresso p-4 text-center text-cream">
              <p className="text-xs uppercase tracking-widest text-caramel-light">Total Tagihan</p>
              <p className="font-mono text-3xl font-bold tabular-nums">{formatIDR(total)}</p>
            </div>

            <MethodPicker value={method} onChange={setMethod} splitEnabled={settings.payments.splitEnabled} />

            {method === 'CASH' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCashDigits(String(total))}
                    className="min-h-[44px] flex-1 rounded-lg border border-caramel bg-caramel/15 px-3 py-2 text-sm font-semibold text-espresso transition-all hover:bg-caramel/25 dark:text-caramel-light"
                  >
                    Pas
                  </button>
                  {QUICK_TENDERS.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setCashDigits(String(amount))}
                      className="min-h-[44px] flex-1 rounded-lg border bg-background px-2 py-2 text-sm font-medium tabular-nums transition-all hover:border-caramel"
                    >
                      {formatIDR(amount).replace('Rp ', '')}
                    </button>
                  ))}
                </div>
                <div
                  className={cn(
                    'rounded-xl p-4 text-center',
                    change >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                  )}
                  aria-live="polite"
                >
                  <p className="text-xs font-medium uppercase tracking-wide">Kembalian</p>
                  <p className="font-mono text-4xl font-bold tabular-nums">
                    {change >= 0 ? formatIDR(change) : '—'}
                  </p>
                </div>
                <AmountKeypad digits={cashDigits} onChange={setCashDigits} />
              </div>
            )}

            {method === 'QRIS' && (
              <div className="space-y-3">
                <div className="rounded-xl border bg-cream p-4 text-center dark:bg-card">
                  {settings.payments.qrisImageUrl ? (
                    <img
                      src={settings.payments.qrisImageUrl}
                      alt={`QRIS ${settings.payments.qrisMerchantName}`}
                      className="mx-auto h-52 w-52 object-contain"
                    />
                  ) : (
                    <p className="py-10 text-sm text-muted-foreground">QR belum diatur di Pengaturan</p>
                  )}
                  <p className="mt-2 text-sm font-semibold">{settings.payments.qrisMerchantName}</p>
                </div>
                <div className="rounded-lg border border-caramel/50 bg-caramel/10 p-3 text-xs leading-relaxed text-warning">
                  <AlertTriangle className="mr-1 inline h-4 w-4 align-[-2px]" aria-hidden />
                  {settings.payments.qrisReminderText}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qr-ref">Ref pembeli (opsional)</Label>
                  <Input
                    id="qr-ref"
                    value={qrRef}
                    onChange={(e) => setQrRef(e.target.value)}
                    placeholder="mis. Budi — 8899"
                    maxLength={60}
                    autoComplete="off"
                  />
                </div>
              </div>
            )}

            {method === 'SPLIT' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Bagian tunai dibayar sekarang — sisanya otomatis jadi QRIS.
                </p>
                <AmountKeypad digits={splitDigits} onChange={setSplitDigits} />
                <div className="space-y-1 rounded-xl border p-4 font-mono tabular-nums">
                  <div className="flex justify-between text-sm">
                    <span>Tunai</span>
                    <span className="font-semibold">{formatIDR(splitCash)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>QRIS</span>
                    <span className="font-semibold">{formatIDR(splitQris)}</span>
                  </div>
                  <div className="mt-1 flex justify-between border-t pt-1 text-sm font-bold">
                    <span>Sisa harus dibayar</span>
                    <span>{formatIDR(Math.max(0, splitQris))}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qr-ref-split">Ref pembeli QRIS (opsional)</Label>
                  <Input
                    id="qr-ref-split"
                    value={qrRef}
                    onChange={(e) => setQrRef(e.target.value)}
                    placeholder="mis. Budi — 8899"
                    maxLength={60}
                    autoComplete="off"
                  />
                </div>
              </div>
            )}

            {invalidReason && (
              <p className="text-center text-sm font-medium text-destructive" role="alert">
                {invalidReason}
              </p>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px] flex-1">
                Batal
              </Button>
              <Button
                onClick={() => void submit()}
                disabled={!valid || submitting}
                className="min-h-[44px] flex-1 bg-espresso text-cream hover:bg-espresso-soft"
              >
                {submitting ? 'Memproses…' : `Konfirmasi ${formatIDR(total)}`}
                <kbd className="ml-2 hidden rounded border border-cream/30 px-1.5 py-0.5 font-mono text-[10px] sm:inline">
                  ⌘↵
                </kbd>
              </Button>
            </DialogFooter>
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden />
              <p className="mt-2 font-semibold">Pembayaran belum tercatat</p>
              <p className="mt-1 text-sm text-muted-foreground">{errorMsg}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Pesanan tidak hilang — coba lagi dengan data yang sama.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setPhase('form')} className="min-h-[44px]">
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Coba Lagi
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onOpenChange(false)
                  toast.error('Pembayaran dibatalkan — keranjang tetap tersimpan')
                }}
                className="min-h-[44px]"
              >
                Tutup
              </Button>
            </div>
          </div>
        )}

        {phase === 'success' && result && (
          <div className="space-y-4 text-center">
            <div className="rounded-xl bg-success/10 p-4">
              <Check className="mx-auto h-10 w-10 text-success" aria-hidden />
              <p className="mt-1 text-sm text-muted-foreground">Pembayaran diterima</p>
              <p className="font-mono text-3xl font-bold tracking-wide">{result.order.code}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="min-h-[44px]"
                onClick={() => {
                  void logReprintAudit(result.order.id, 'RECEIPT')
                  printReceipt(result.order, settings.receipts)
                }}
              >
                <Printer className="mr-2 h-4 w-4" aria-hidden /> Struk Pelanggan
              </Button>
              <Button
                variant="outline"
                className="min-h-[44px]"
                onClick={() => {
                  void logReprintAudit(result.order.id, 'KOT')
                  printKot(result.order, settings.receipts)
                }}
              >
                <Printer className="mr-2 h-4 w-4" aria-hidden /> Struk Dapur
              </Button>
            </div>
            <Button
              variant="ghost"
              className="min-h-[44px] w-full text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              Cetak ulang nanti dari detail pesanan
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Fire-and-forget reprint audit log — failure must never block printing. */
async function logReprintAudit(orderId: string, template: 'KOT' | 'RECEIPT'): Promise<void> {
  try {
    const res = await fetch(`/api/orders/${orderId}/reprint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template }),
    })
    if (!res.ok) throw new Error('gagal mencatat log cetak')
  } catch {
    // audit-log failure must never block a print (SPEC: printing never blocks the sale)
  }
}

// ---------- QRIS pending-verification protocol (anti-fake-screenshot) ----------
export function QrisVerifyDialog({
  open,
  onOpenChange,
  orderCode,
  amount,
  buyerRef,
  reminderText,
  settings,
  onConfirm,
  onReject,
  busy,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderCode: string
  amount: number
  buyerRef: string | null
  reminderText: string
  /** Receipts settings — enables the "Cetak Struk" offer in the success state. */
  settings?: SettingsDTO
  /**
   * Confirm handler. Resolve with the verified OrderDTO (the payment-verify
   * endpoint returns it) to light up the print offer; a void result keeps the
   * legacy contract where the caller closes the dialog itself.
   */
  onConfirm: () => Promise<OrderDTO | void>
  onReject: (note: string) => Promise<void>
  busy?: boolean
}) {
  const [note, setNote] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState<OrderDTO | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (open) {
      setNote('')
      setRejecting(false)
      setConfirming(false)
      setConfirmed(null)
      setErrorMsg('')
    }
  }, [open])

  // Verified success → offer the receipt (never auto-print: verification is a
  // trust decision, the operator decides what reaches the printer).
  const success = confirmed !== null

  const confirm = async () => {
    if (busy || confirming) return
    setConfirming(true)
    setErrorMsg('')
    try {
      const result = await onConfirm()
      if (result) {
        setConfirmed(result)
      } else {
        // Legacy caller closes the dialog itself on success.
        onOpenChange(false)
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Gagal memverifikasi pembayaran')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {success && confirmed ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-success" aria-hidden />
                QRIS {confirmed.code} terverifikasi
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-center">
              <div className="rounded-xl bg-success/10 p-4">
                <p className="text-sm text-muted-foreground">Pembayaran diterima</p>
                <p className="font-mono text-2xl font-bold tracking-wide">{confirmed.code}</p>
                <p className="mt-1 font-mono text-sm tabular-nums">{formatIDR(amount)}</p>
              </div>
              {settings && (
                <Button
                  variant="outline"
                  className={cn(
                    'min-h-[44px] w-full',
                    settings.receipts.autoPrintReceipt &&
                      'border-caramel bg-caramel/15 text-espresso hover:bg-caramel/25 dark:text-caramel-light'
                  )}
                  onClick={() => {
                    void logReprintAudit(confirmed.id, 'RECEIPT')
                    printReceipt(confirmed, settings.receipts)
                  }}
                >
                  <Printer className="mr-2 h-4 w-4" aria-hidden /> Cetak Struk
                </Button>
              )}
              <Button
                variant="ghost"
                className="min-h-[44px] w-full text-muted-foreground"
                onClick={() => onOpenChange(false)}
              >
                Tutup
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-warning" aria-hidden />
                Verifikasi QRIS {orderCode}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-xl border border-caramel/50 bg-caramel/10 p-3 text-sm leading-relaxed text-warning">
                {reminderText}
              </div>
              <div className="space-y-1 rounded-xl border p-3 font-mono text-sm tabular-nums">
                <div className="flex justify-between">
                  <span>Nominal</span>
                  <span className="font-bold">{formatIDR(amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ref pembeli</span>
                  <span>{buyerRef || '—'}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reject-note">Catatan (wajib bila menolak)</Label>
                <Input
                  id="reject-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="mis. mutasi tidak ditemukan"
                  maxLength={200}
                />
              </div>
              {errorMsg && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">
                  {errorMsg}
                </p>
              )}
            </div>
            <DialogFooter className="grid grid-cols-2 gap-2">
              <Button
                variant="destructive"
                disabled={busy || confirming || !note.trim()}
                onClick={async () => {
                  setRejecting(true)
                  try {
                    await onReject(note.trim())
                  } finally {
                    setRejecting(false)
                  }
                }}
                className="min-h-[44px]"
              >
                {rejecting ? 'Menolak…' : 'Tolak'}
              </Button>
              <Button
                disabled={busy || confirming}
                onClick={() => void confirm()}
                className="min-h-[44px] bg-success text-white hover:bg-success/90"
              >
                {confirming ? 'Memverifikasi…' : 'Konfirmasi Terima'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
