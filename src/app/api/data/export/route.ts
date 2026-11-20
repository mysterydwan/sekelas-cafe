// GET /api/data/export?type=ORDERS|PRODUCTS|STOCK|MOVEMENTS|USERS|AUDIT|DAILY_PACK|REPORT_TAB
// — xlsx download. Gates per type; cashier (no report.viewAll) ORDERS clamped to today.
import { fail, withAuth } from '@/lib/api'
import { hasGrant } from '@/lib/grants'
import { todayJakarta } from '@/lib/format'
import {
  exportAudit,
  exportDailyPack,
  exportMovements,
  exportOrders,
  exportProducts,
  exportReportTab,
  exportStock,
  exportUsers,
  REPORT_TABS,
  xlsxResponse,
} from '@/lib/excel'
import type { ReportTab } from '@/lib/excel'
import type { NextRequest } from 'next/server'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const REPORT_GENERATION_TYPES = ['ORDERS', 'DAILY_PACK', 'REPORT_TAB']
const MASTER_DATA_TYPES = ['PRODUCTS', 'STOCK', 'MOVEMENTS', 'USERS']

export const GET = withAuth(async (req: NextRequest, { session }) => {
  const sp = req.nextUrl.searchParams
  const type = sp.get('type') ?? 'ORDERS'

  if (REPORT_GENERATION_TYPES.includes(type)) {
    if (!hasGrant(session, 'data.report') && !hasGrant(session, 'report.viewAll')) {
      return fail('Kamu tidak punya izin untuk ekspor ini', 403)
    }
  } else if (MASTER_DATA_TYPES.includes(type)) {
    if (!hasGrant(session, 'data.import')) {
      return fail('Ekspor data induk hanya untuk Admin', 403)
    }
  } else if (type === 'AUDIT') {
    if (!hasGrant(session, 'activity.view')) {
      return fail('Kamu tidak punya izin untuk mengekspor log aktivitas', 403)
    }
  } else {
    return fail('Jenis ekspor tidak dikenal', 422)
  }

  const today = todayJakarta()
  let from = sp.get('from') ?? today
  let to = sp.get('to') ?? from
  if (type === 'ORDERS' && !hasGrant(session, 'report.viewAll')) {
    from = today
    to = today
  }
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return fail('Format tanggal tidak valid (YYYY-MM-DD)', 422)
  if (from > to) {
    const t = from
    from = to
    to = t
  }
  const days = (new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86_400_000
  if (days > 366) return fail('Rentang ekspor maksimal 366 hari', 422)

  switch (type) {
    case 'ORDERS':
      return xlsxResponse(await exportOrders(from, to), `sekelas-pesanan-${from}-${to}.xlsx`)
    case 'PRODUCTS':
      return xlsxResponse(await exportProducts(), `sekelas-produk-${today}.xlsx`)
    case 'STOCK':
      return xlsxResponse(await exportStock(), `sekelas-bahan-stok-${today}.xlsx`)
    case 'MOVEMENTS':
      return xlsxResponse(await exportMovements(from, to), `sekelas-pergerakan-stok-${from}-${to}.xlsx`)
    case 'USERS':
      return xlsxResponse(await exportUsers(), `sekelas-pengguna-${today}.xlsx`)
    case 'AUDIT': {
      // Carry the /activity filter bar into the export (SPEC §3.16):
      // userId = equality, action/entity = contains — mirrors /api/activity.
      const userId = sp.get('userId')?.trim() || undefined
      const action = sp.get('action')?.trim() || undefined
      const entity = sp.get('entity')?.trim() || undefined
      return xlsxResponse(
        await exportAudit(from, to, { userId, action, entity }),
        `sekelas-log-aktivitas-${from}-${to}.xlsx`
      )
    }
    case 'DAILY_PACK': {
      const businessDate = sp.get('businessDate') ?? today
      if (!DATE_RE.test(businessDate)) return fail('Format tanggal tidak valid (YYYY-MM-DD)', 422)
      return xlsxResponse(await exportDailyPack(businessDate), `sekelas-laporan-harian-${businessDate}.xlsx`)
    }
    case 'REPORT_TAB': {
      const tab = (sp.get('tab') ?? 'ringkasan') as ReportTab
      if (!REPORT_TABS.includes(tab)) return fail('Tab laporan tidak dikenal', 422)
      return xlsxResponse(await exportReportTab(tab, from, to), `sekelas-laporan-${tab}-${from}-${to}.xlsx`)
    }
    default:
      return fail('Jenis ekspor tidak dikenal', 422)
  }
})
