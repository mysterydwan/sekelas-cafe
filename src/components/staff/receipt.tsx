'use client'

// Receipt printing (SPEC §1.5 + §3.6): print-optimized HTML rendered into a
// hidden .print-area node, printed via window.print() (58/80mm CSS profiles
// live in globals.css). Framework-free on purpose — callable from any event
// handler without React state juggling.

import type { OrderDTO, SettingsDTO } from '@/lib/types'
import { formatDateTime, formatIDR } from '@/lib/format'

type ReceiptsSettings = SettingsDTO['receipts']

const MONO = "'Courier New', ui-monospace, monospace"

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function typeLine(order: OrderDTO): string {
  if (order.type === 'DINE_IN') return order.tableLabel ? `MEJA ${order.tableLabel}` : 'MAKAN DI TEMPAT'
  if (order.type === 'TAKE_AWAY') return 'BUNGKUS'
  const loc = order.deliveryLocation ? ` — ${order.deliveryLocation.toUpperCase()}` : ''
  return `ANTAR${loc}`
}

function customerLine(order: OrderDTO): string | null {
  if (order.type === 'DELIVERY') {
    return order.customerName ? `UNTUK: ${order.customerName.toUpperCase()}` : null
  }
  if (order.customerName) return order.customerName
  return null
}

/** Kitchen ticket: code big, variant CHOICES only, ALL-CAPS notes, NO prices. */
function kotHtml(order: OrderDTO): string {
  const rows = order.items
    .map((item) => {
      const variants = item.variantLabels.length
        ? `<div style="font-size:12px;padding:0 0 2px 14px;">${esc(item.variantLabels.join(', '))}</div>`
        : ''
      const note = item.note ? `<div style="font-size:12px;font-weight:700;padding:0 0 2px 14px;">CATATAN: ${esc(item.note.toUpperCase())}</div>` : ''
      const strike = item.isVoided ? 'text-decoration:line-through;opacity:0.5;' : ''
      const voidTag = item.isVoided ? ' [DIBATALKAN]' : ''
      return `<div style="padding:4px 0;border-bottom:1px dashed #000;">
        <div style="font-size:15px;font-weight:700;${strike}">${item.qty}&times; ${esc(item.name)}${voidTag}</div>
        ${variants}${note}
      </div>`
    })
    .join('')
  const cust = customerLine(order)
  return `
    <div style="text-align:center;font-weight:700;letter-spacing:2px;font-size:14px;">STRUK DAPUR</div>
    <div style="text-align:center;font-size:26px;font-weight:700;letter-spacing:1px;margin:6px 0 2px;">${esc(order.code)}</div>
    <div style="text-align:center;font-size:13px;font-weight:700;">${esc(typeLine(order))}</div>
    ${cust ? `<div style="text-align:center;font-size:12px;">${esc(cust)}</div>` : ''}
    <div style="text-align:center;font-size:12px;margin:2px 0 6px;">${esc(formatDateTime(order.paidAt ?? order.createdAt))}</div>
    <div style="border-top:1px dashed #000;"></div>
    ${rows}
    ${order.note ? `<div style="margin-top:6px;font-size:12px;font-weight:700;">CATATAN PESANAN: ${esc(order.note.toUpperCase())}</div>` : ''}
  `
}

/** Customer receipt: full money breakdown + payment info + footer. */
function receiptHtml(order: OrderDTO, s: ReceiptsSettings): string {
  const header = s.headerLines
    .map((l, i) => `<div style="text-align:center;font-weight:700;${i === 0 ? 'font-size:15px;' : 'font-size:12px;'}">${esc(l)}</div>`)
    .join('')

  const items = order.items
    .map((item) => {
      const variants = item.variantLabels.length
        ? `<div style="font-size:11px;padding-left:12px;color:#222;">${esc(item.variantLabels.join(', '))}</div>`
        : ''
      const note = item.note ? `<div style="font-size:11px;padding-left:12px;color:#222;">${esc(item.note)}</div>` : ''
      const strike = item.isVoided ? 'text-decoration:line-through;opacity:0.55;' : ''
      const voidTag = item.isVoided ? `<div style="font-size:10px;padding-left:12px;">Dibatalkan: ${esc(item.voidReason ?? '')}</div>` : ''
      return `<div style="padding:3px 0;">
        <div style="display:flex;justify-content:space-between;gap:8px;${strike}">
          <span>${item.qty}&times; ${esc(item.name)}</span>
          <span>${formatIDR(item.lineTotal)}</span>
        </div>
        ${variants}${note}${voidTag}
      </div>`
    })
    .join('')

  const line = (label: string, value: string, bold = false) =>
    `<div style="display:flex;justify-content:space-between;gap:8px;padding:1px 0;${bold ? 'font-weight:700;font-size:14px;' : ''}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`

  const paymentLines = order.payments
    .filter((p) => p.status !== 'REJECTED')
    .map((p) => {
      const label = p.method === 'CASH' ? 'Tunai' : p.method === 'QRIS' ? 'QRIS' : '?'
      const parts = [line(label, formatIDR(p.amount))]
      if (p.method === 'CASH' && p.cashReceived != null) parts.push(line('  Diterima', formatIDR(p.cashReceived)))
      if (p.method === 'CASH' && p.changeDue != null) parts.push(line('  Kembali', formatIDR(p.changeDue)))
      if (p.method === 'QRIS' && p.qrReference) parts.push(line('  Ref', p.qrReference))
      if (p.status === 'PENDING_VERIFICATION') parts.push(`<div style="font-size:11px;font-weight:700;">MENUNGGU VERIFIKASI KASIR</div>`)
      return parts.join('')
    })
    .join('')

  const meta = order.type === 'DINE_IN' && order.tableLabel ? `Meja ${order.tableLabel}` : null
  const cust = customerLine(order)

  return `
    ${header}
    <div style="text-align:center;font-size:18px;font-weight:700;margin:4px 0;">${esc(order.code)}</div>
    <div style="font-size:11px;text-align:center;">${esc(formatDateTime(order.createdAt))}${order.cashier ? ` · Kasir: ${esc(order.cashier)}` : ''}</div>
    ${meta ? `<div style="font-size:11px;text-align:center;">${esc(meta)}</div>` : ''}
    ${cust && order.type !== 'DELIVERY' ? `<div style="font-size:11px;text-align:center;">${esc(cust)}</div>` : ''}
    <div style="border-top:1px dashed #000;margin:6px 0;"></div>
    ${items}
    <div style="border-top:1px dashed #000;margin:6px 0;"></div>
    ${line('Subtotal', formatIDR(order.subtotal))}
    ${order.discountTotal > 0 ? line(`Diskon${order.discountReason ? ` (${order.discountReason})` : ''}`, '-' + formatIDR(order.discountTotal)) : ''}
    ${order.deliveryFee > 0 ? line('Ongkir', formatIDR(order.deliveryFee)) : ''}
    ${order.taxTotal > 0 ? line('Pajak', formatIDR(order.taxTotal)) : ''}
    ${line('TOTAL', formatIDR(order.total), true)}
    ${paymentLines ? `<div style="border-top:1px dashed #000;margin:6px 0;"></div>${paymentLines}` : ''}
    ${order.payments.length === 0 ? `<div style="font-size:12px;font-weight:700;margin-top:4px;">BELUM BAYAR — BAYAR DI KASIR</div>` : ''}
    ${order.note ? `<div style="font-size:11px;margin-top:4px;">Catatan: ${esc(order.note)}</div>` : ''}
    ${order.type === 'DELIVERY' && order.deliveryLocation ? `<div style="font-size:11px;">Antar ke: ${esc(order.deliveryLocation)}${order.courierName ? ` (kurir: ${esc(order.courierName)})` : ''}</div>` : ''}
    <div style="border-top:1px dashed #000;margin:6px 0;"></div>
    ${s.footerLines.map((l) => `<div style="text-align:center;font-size:11px;">${esc(l)}</div>`).join('')}
  `
}

function printHtml(html: string, paperWidth: 58 | 80): void {
  printDocuments([{ html, paperWidth }])
}

interface PrintDoc {
  html: string
  paperWidth: 58 | 80
}

let printQueue: PrintDoc[] = []
let printing = false

/**
 * Sequential print queue (SPEC §3.6 dual receipts): browsers drop a second
 * window.print() fired while the first dialog is still open, and a naive
 * back-to-back call prints BOTH documents in one dialog. We print one document
 * at a time — show only the active node, print, wait for `afterprint`, swap.
 */
function printDocuments(docs: PrintDoc[]): void {
  if (typeof document === 'undefined') return
  printQueue.push(...docs)
  if (!printing) void flushPrintQueue()
}

async function flushPrintQueue(): Promise<void> {
  printing = true
  try {
    while (printQueue.length > 0) {
      const doc = printQueue.shift()!
      const el = document.createElement('div')
      el.className = `print-area paper-${doc.paperWidth}`
      el.style.fontFamily = MONO
      el.style.color = '#000'
      el.style.padding = '6px 4px'
      el.innerHTML = doc.html
      document.body.appendChild(el)
      await printNode(el)
      // only ONE print-area node may be live at a time — otherwise the next
      // dialog would print both documents together
      el.remove()
    }
  } finally {
    printing = false
  }
}

function printNode(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.removeEventListener('afterprint', finish)
      clearTimeout(fallback)
      resolve()
    }
    // afterprint is the reliable signal the dialog closed; the fallback timer
    // covers browsers/quiet cancellations where it never fires.
    const fallback = setTimeout(finish, 120_000)
    window.addEventListener('afterprint', finish)
    try {
      window.print()
    } catch {
      finish()
    }
  })
}

/** Print the kitchen ticket (KOT). */
export function printKot(order: OrderDTO, s: ReceiptsSettings): void {
  printHtml(kotHtml(order), s.paperWidth)
}

/** Print the customer receipt. */
export function printReceipt(order: OrderDTO, s: ReceiptsSettings): void {
  printHtml(receiptHtml(order, s), s.paperWidth)
}

/**
 * Fire both templates on payment confirm (SPEC §3.6): kitchen ticket first —
 * the barista starts earlier — then the customer receipt. Each gets its own
 * print dialog so the operator can pick the right printer per station.
 */
export function printReceiptPair(order: OrderDTO, s: ReceiptsSettings): void {
  printDocuments([
    { html: kotHtml(order), paperWidth: s.paperWidth },
    { html: receiptHtml(order, s), paperWidth: s.paperWidth },
  ])
}

/** WhatsApp receipt text (wa.me deep-link fallback, SPEC §3.9). */
export function buildWhatsAppText(order: OrderDTO): string {
  const lines: string[] = []
  lines.push(`*${order.code}* — Sekelas Cafe`)
  lines.push(formatDateTime(order.createdAt))
  lines.push('')
  for (const item of order.items) {
    const variants = item.variantLabels.length ? ` (${item.variantLabels.join(', ')})` : ''
    lines.push(`${item.qty}x ${item.name}${variants} — ${formatIDR(item.lineTotal)}`)
  }
  lines.push('')
  lines.push(`Total: *${formatIDR(order.total)}*`)
  if (order.payments.length > 0) {
    const methods = [...new Set(order.payments.filter((p) => p.status !== 'REJECTED').map((p) => (p.method === 'CASH' ? 'Tunai' : 'QRIS')))]
    if (methods.length) lines.push(`Pembayaran: ${methods.join(' + ')}`)
  }
  lines.push('')
  lines.push('Terima kasih sudah mampir!')
  return lines.join('\n')
}
