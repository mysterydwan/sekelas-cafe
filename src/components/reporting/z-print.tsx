'use client'

// Z-report 80mm print view (mono, dashed separators). Hidden on screen.
import { formatDateTime, formatIDR, formatDateLong } from '@/lib/format'
import type { DayReportSnapshot } from '@/lib/types'

const SEP = '-'.repeat(30)

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

export function ZPrintView({
  snap,
  closedAt,
  generatedBy,
  isAutoClosed = false,
}: {
  snap: DayReportSnapshot
  closedAt?: string | null
  generatedBy?: string | null
  isAutoClosed?: boolean
}) {
  return (
    <div className="print-area paper-80 hidden print:block font-mono text-[11px] leading-snug text-black" aria-hidden>
      <div className="mx-auto w-full px-3 py-2">
        <p className="text-center font-bold">SEKELAS CAFE</p>
        <p className="text-center">SMKN 1 Boyolangu</p>
        <p className="mt-1 text-center font-bold">LAPORAN PENUTUPAN (Z)</p>
        <p className="text-center">{formatDateLong(snap.businessDate + 'T12:00:00+07:00')}</p>
        <p className="my-1 text-center">{SEP}</p>

        <Line label="Penjualan kotor" value={formatIDR(snap.gross)} />
        <Line label="Diskon" value={`-${formatIDR(snap.discounts)}`} />
        <Line label="Pembatalan" value={`-${formatIDR(snap.voids)}`} />
        <Line label="Ongkir antar" value={`+${formatIDR(snap.deliveryFees)}`} />
        <Line label="Pajak" value={`+${formatIDR(snap.taxTotal)}`} />
        <Line label="PENDAPATAN BERSIH" value={formatIDR(snap.net)} />

        <p className="my-1 text-center">{SEP}</p>
        <Line label="TUNAI" value={formatIDR(snap.cashTotal)} />
        <Line label="QRIS" value={formatIDR(snap.qrisTotal)} />

        <p className="my-1 text-center">{SEP}</p>
        <p className="font-bold">KAS</p>
        <Line label="Modal awal" value={formatIDR(snap.openingFloat)} />
        <Line label="Uang masuk" value={`+${formatIDR(snap.cashIn)}`} />
        <Line label="Uang keluar" value={`-${formatIDR(snap.cashOut)}`} />
        <Line label="Kas diharapkan" value={formatIDR(snap.expectedCash)} />
        {snap.countedCash !== null && (
          <>
            <Line label="Kas dihitung" value={formatIDR(snap.countedCash)} />
            <Line label="SELISIH KAS" value={(snap.variance ?? 0) >= 0 ? `+${formatIDR(snap.variance ?? 0)}` : `-${formatIDR(Math.abs(snap.variance ?? 0))}`} />
          </>
        )}

        {snap.merchantQrisTotal !== null && (
          <>
            <p className="my-1 text-center">{SEP}</p>
            <p className="font-bold">REKONSILIASI QRIS</p>
            <Line label="Mutasi merchant" value={formatIDR(snap.merchantQrisTotal)} />
            <Line label="Selisih QRIS" value={formatIDR(snap.merchantQrisVariance ?? 0)} />
          </>
        )}

        <p className="my-1 text-center">{SEP}</p>
        <Line label="Pesanan" value={String(snap.orderCount)} />
        <Line label="Item terjual" value={String(snap.itemCount)} />

        <p className="my-1 text-center">{SEP}</p>
        <p>Ditutup: {closedAt ? formatDateTime(closedAt) : '-'}</p>
        <p>Oleh: {generatedBy ?? (isAutoClosed ? 'SISTEM (OTOMATIS)' : '-')}</p>
        {isAutoClosed && <p className="font-bold">*** DITUTUP OTOMATIS ***</p>}

        <p className="mt-3 text-center">{SEP}</p>
        <p className="text-center">Terima kasih</p>
        <p className="text-center">Sekelas Cafe</p>
      </div>
    </div>
  )
}
