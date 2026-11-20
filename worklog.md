# Sekelas Cafe — Build Worklog

Living log for the full Next.js execution phase. Pre-execution check ran BEFORE any code, under strict anti-bloat control, against real-world apps of this exact domain (student-run school cafe POS, single outlet, ≤300 orders/day) and operational scale.

---

## 0. Pre-Execution Check (SPEC.md verification — completed before code)

**Method:** SPEC.md (drafted from a saturation research session covering Moka, Majoo, Qasir, ESB, BEEPOS, Olsera, iREAP, Kasir Pintar, Square, Toast, Lightspeed, Clover, Loyverse, OrderRestro, FloCafe, POSR, Kasirku, OSPOS, Odoo POS, Floreant, Chromis/uniCenta — see SPEC §1.4) was re-verified feature-by-feature against the standard feature set of leading POS products at this scale.

**Verified present (no action needed):** discounts w/ reason + grant, voids vs cancels vs refunds taxonomy, X/Z report pair with variance math, held/parked orders, order-level delivery fee, per-unit kitchen gating, ready board, sold-out availability toggle, receipt reprint + once-only KOT, QRIS manual-verification protocol (static QR + nominal typed by customer + mutation check reminder), split payments, print profiles 58/80mm, import upsert with parse→preview→confirm, templates with instructions sheet, stock movements ledger with attribution, recipes with non-blocking deduction, stock counts/opname, audit log with diffs, grants-not-roles RBAC, practice mode, login rate limit + PIN quick login, business-day sequence, auto-close of forgotten days, WhatsApp receipt fallback, offline-tolerant states, autosave/dirty guards, Cmd+K palette, role-aware dashboard.

**ADDED to SPEC (2 items, each an established standard AND core-workflow-serving):**

1. **CashMovement entity + cash drawer actions (uang masuk/keluar, "modal awal" opening float)** — *Justification:* SPEC §1.4 itself lists "money in/out, opening float, counted cash, variance" as X/Z-report standard line items (mobiletransaction.org standard), yet the draft had no entity or UI to record in-day cash movements, and the Z math referenced `openingFloat` with no entry point. Square (Cash Drawer), Loyverse (cash management), Qasir (per-shift "selisih kas"), and BEEPOS (deposit slips as fraud control — cited in SPEC §1.4) all ship this. Without it, expected-cash at close is wrong the first time a student buys ice with drawer money. Implemented as: `CashMovement` model, "Atur modal awal" POS quick action, Uang Masuk/Keluar entries, X/Z lines. *(SPEC §1.6 + §3.6 + §3.13 amended.)*
2. *(Folded into #1 — opening-float capture is the entry mechanism.)*

**REJECTED as bloat (deliberately NOT added):** attendance/timeclock (Loyverse has it; payroll excluded by SPEC scale discipline), loyalty/points, tips, table floor plans (counter service, table *label* suffices), offline-first sync engine, e-receipt email (no SMTP), customer accounts, multi-outlet, payment gateway, fiscalization, push notifications, AI features, multi-currency, partial-refund UI (full cancel + manual refund note per SPEC), reservations, bill-print-before-payment (pay-first counter flow), customer feedback module.

**Conclusion:** SPEC is complete for the archetype. Build proceeds exactly against SPEC.md + the 2 amendments above.

---

## 1. Architecture & Conventions (AGENT BRIEFING — read before writing any code)

### 1.1 Stack (fixed)
- Next.js 16 App Router + TypeScript strict, Tailwind CSS 4 (CSS-first tokens in `src/app/globals.css`), shadcn/ui (New York, all components exist in `src/components/ui`), Prisma + SQLite via `src/lib/db` (`import { db } from '@/lib/db'`).
- State: TanStack Query (`@tanstack/react-query`, provider mounted in root layout — USE IT for all server data: `useQuery`/`useMutation` + `refetchInterval` for polling fallbacks), Zustand for the storefront cart.
- Realtime: socket.io mini-service on port **3030**; client connects ONLY via `io('/?XTransformPort=3030')` (path `/`, never a port in the URL). Server-side emits go through `emitRealtime(event, payload)` in `src/lib/realtime.ts`.
- Excel: `xlsx` (SheetJS). Money = IDR integers everywhere. Locale `id-ID`, timezone `Asia/Jakarta` (all display via `src/lib/format.ts` helpers — never raw `toLocaleString`).
- Icons: `lucide-react`. Toasts: `sonner` (`import { toast } from 'sonner'`).

### 1.2 Design system (fixed)
- Tokens in `globals.css`: espresso `#241610/#3F2A1D/#553724` (primary), caramel gold `#C68B33/#D9A441/#E7C078` (accent/active/ready), cream surfaces `#FBF7F0/#F5EDE1` inside wrapper elements, success `#2F7D4F`, warning `#B26A00`, danger `#B03A2E`. Dark mode via next-themes (class `.dark`). **NO indigo/blue.** KDS + Board pages are ALWAYS dark (`bg-[#171210]` wrappers) regardless of theme.
- Fonts: Fraunces (display; class `font-display`), Plus Jakarta Sans (body/UI). Mono for codes/timers/amount columns (`font-mono tabular-nums`).
- Cards `rounded-xl` `p-4`/`p-6`, `gap-4`/`gap-6`, one elevation level. Touch targets ≥ 44px. Long lists: `max-h-96 overflow-y-auto` (or larger for full-bleed KDS) with custom scrollbar.
- Logo: `public/logo.png` (428×593, transparent, single-color caramel-gold "S"+cup mark). Use AS-IS: `<img src="/logo.png" className="h-10 w-auto object-contain" alt="Sekelas Cafe" />` — never add borders/frames/shadows/badges, never crop (no `object-cover`), keep natural aspect ratio. It is gold-on-transparent → place on espresso or cream surfaces only.
- Sticky footer rule on public pages: wrapper `min-h-screen flex flex-col`, footer `mt-auto`, respect `pb-[env(safe-area-inset-bottom)]`.

### 1.3 File ownership (STRICT — parallel build)
- **Shared (only the lead touches):** `src/app/layout.tsx`, `src/app/providers.tsx`, `src/app/globals.css`, `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/icon.png`, `src/middleware.ts`, everything in `src/lib/` EXCEPT `src/lib/excel.ts` (Agent D owns), `src/hooks/use-session.tsx`, `src/hooks/use-realtime.ts`, `src/hooks/use-sound.ts`, `src/components/staff/app-shell.tsx`, `src/components/staff/command-palette.tsx`, `src/components/staff/page-guard.tsx`, `src/components/staff/status-badges.tsx`, `src/components/staff/money.tsx`, `src/components/staff/primitives.tsx` (PageHeader/StatCard/EmptyState/skeletons), `src/app/(staff)/layout.tsx`, `src/app/api/auth/**`, `src/app/api/settings/**`, `src/app/api/pos/cash/**`, `mini-services/**`, `prisma/**`, `public/**`, `package.json`, `tsconfig.json`.
- **Agent A (Task 2-a — Public experience)** owns: `src/app/page.tsx`, `src/app/track/[code]/page.tsx`, `src/app/board/page.tsx`, `src/app/api/public/**`, `src/components/public/**`, `src/stores/**`.
- **Agent B (Task 2-b — Staff operations)** owns: `src/app/login/page.tsx`, `src/app/(staff)/dashboard/page.tsx`, `src/app/(staff)/pos/page.tsx`, `src/app/(staff)/kitchen/page.tsx`, `src/app/(staff)/orders/page.tsx`, `src/app/(staff)/orders/[id]/page.tsx`, `src/app/api/dashboard/**`, `src/app/api/orders/**`, `src/app/api/pos/held/**`, and `src/components/staff/{receipt,charge-modals,variant-sheet}*.tsx` plus `src/components/staff/{login,dashboard,pos,kitchen,orders}/**`.
- **Agent C (Task 2-c — Master data)** owns: `src/app/(staff)/products/**`, `src/app/(staff)/stock/**`, `src/app/(staff)/users/**`, `src/app/(staff)/settings/**`, `src/app/api/products/**`, `src/app/api/categories/**`, `src/app/api/stock/**`, `src/app/api/users/**`, `src/components/management/**`.
- **Agent D (Task 2-d — Reports & data)** owns: `src/app/(staff)/reports/**`, `src/app/(staff)/data/**`, `src/app/(staff)/activity/**`, `src/app/api/reports/**`, `src/app/api/data/**`, `src/app/api/activity/**`, `src/lib/excel.ts`, `src/components/reporting/**`.
- Never modify files you don't own. If a shared component is missing something, build it INSIDE your own namespace folder.
- **Forbidden:** any `bun`/`npm`/`bunx`/`npx` commands, running dev server, `db:push`, installs, `next build`, editing `worklog.md`/`SPEC.md`. Use Read/Write/Edit/Glob/Grep/LS only. Verify nothing with bash — the lead integrates + verifies after.

### 1.4 Canonical server libs (READ THESE FILES before coding — they are the contract)
- `src/lib/types.ts` — ALL DTOs: `SessionUser`, `MenuDTO`, `OrderDTO`, `OrderItemDTO`, `PaymentDTO`, `SettingsDTO` (public subset too), `DashboardDTO`, `ReportSummaryDTO`, etc. Import from here; do not redeclare.
- `src/lib/format.ts` — `formatIDR`, `formatDateTime`, `formatTime`, `formatDuration`, `todayJakarta`, etc. (client-safe).
- `src/lib/grants.ts` — grant ids, role bundles, `hasGrant(user, g)` (client-safe).
- `src/lib/auth.ts` — `getSession()`, `login()`, `logout()`, `hashPassword`, `verifyPassword` (server).
- `src/lib/api.ts` — `ok(data)`, `fail(msg, status)`, `withAuth(handler, {grants?, roles?})`, `parseBody(req, zodSchema)`. EVERY staff API route wraps its handler in `withAuth`. Errors return `{ error: 'message' }` with proper status.
- `src/lib/settings.ts` — `getSettings()`, `patchSettings(section, patch)`, `getPublicSettings()`.
- `src/lib/business-day.ts` — `businessDateOf(date)`, `nextOrderCode(prefix)`, `isCafeOpenNow(settings)`.
- `src/lib/orders.ts` — `createOrder(input, actor)`, `getOrderDTO(id|code)`, `listOrders(filters)`, `checkItem`, `transitionOrder` (status machine + gates + recipe deduction + realtime), `voidItem`, `cancelOrder`, `ackOrder`, `assignCourier`, `holdOrder/recallHeld/listHeld`.
- `src/lib/payments.ts` — `takePayment(orderId, input, actor)`, `verifyQrisPayment`, `rejectQrisPayment`, `getCashStatus(businessDate)`, `recordCashMovement`.
- `src/lib/stock.ts` — `listItems`, `upsertItem`, `recordMovement`, `recordWaste`, `recordRestock`, `saveRecipes`, `listMovements`, `saveCount`, `approveCount`, `deductRecipesForOrder`.
- `src/lib/reports.ts` — `computeDayReport(businessDate)` (X/Z snapshot shape), `closeDay` (Z), `getReportSummary(from, to)`, `ensureClosedDates()` (auto-close).
- `src/lib/audit.ts` — `audit(actor, action, entity, entityId, label, before?, after?)`.
- `src/lib/realtime.ts` — `emitRealtime(event, payload)`; events: `order:created` `{code,status,type}`, `order:status` `{id,code,status}`, `order:itemChecked` `{id,code,itemId,checkedCount}`, `order:needsAck` `{id,code}`, `payment:updated` `{id,code,paymentStatus,status}`, `stock:low` `{sku,name,qty,lowThreshold}`, `stock:movement` `{sku,name}`, `menu:availability` `{productId,isAvailable}`, `day:closed` `{businessDate}`.
- `src/hooks/use-realtime.ts` — `useRealtime(events: string[], handler)` + connection state via `useRealtimeStatus()`.
- `src/components/staff/*` — `PageGuard` (wrap every staff page: `<PageGuard page="pos">…</PageGuard>` handles session, role gate, 403 view), `OrderStatusBadge`, `PaymentBadge`, `StockStatusBadge`, `Money`, `PageHeader`, `EmptyState`, `StatCard`.

### 1.5 API map (contracts — shapes in `src/lib/types.ts`)
Auth+Settings+Cash (lead): `POST /api/auth/login` `{username,password,mode?}`, `POST /api/auth/logout`, `GET /api/auth/me`; `GET /api/settings` (public GET), `PATCH /api/settings {section,patch}` (grant settings.manage); `GET /api/pos/cash` → CashStatusDTO, `POST /api/pos/cash {type:'OPENING_FLOAT'|'CASH_IN'|'CASH_OUT',amount,reason?}` (grant order.create).
Public (A): `GET /api/public/menu` → MenuDTO (active only, sold-out included w/ isAvailable=false); `GET /api/public/settings` → PublicSettingsDTO; `POST /api/public/orders` → CreateOrderInput w/ source='PUBLIC' (gated by open-hours strict + selfOrderEnabled; QRIS → PENDING_VERIFICATION, null payment → PENDING_PAYMENT); `GET /api/public/orders/[code]` → OrderDTO; `GET /api/public/board` → `{preparing:[{code,type,createdAt}],ready:[{code,type,readyAt}],recentCompleted:[{code,completedAt}]}` (today only, non-training).
Staff orders/POS/kitchen/dashboard (B): `GET /api/orders?from&to&status&type&paymentMethod&cashierId&search&page&pageSize&full=1` (full=1 → rows are full OrderDTO w/ items+payments — kitchen uses it); `POST /api/orders` → CreateOrderInput w/ source='POS' + payment (grant order.create; discount requires order.discount); `GET /api/orders/[id]`; `POST /api/orders/[id]/payment` `{method,cashReceived?,cashPortion?,qrReference?}` (grant payment.confirm); `POST /api/orders/[id]/payment-verify` `{action:'CONFIRM'|'REJECT',note?}` (grant payment.confirm); `POST /api/orders/[id]/check` `{itemId,delta:1|-1}` (role ADMIN/BARISTA); `POST /api/orders/[id]/status` `{status,reason?,courierName?}` (gates server-side); `POST /api/orders/[id]/ack`; `POST /api/orders/[id]/courier` `{name}`; `POST /api/orders/[id]/void-item` `{itemId,reason}` (grant order.voidItem); `POST /api/orders/[id]/cancel` `{reason}` (grant order.cancel); `POST /api/orders/[id]/reprint` `{template:'KOT'|'RECEIPT'}` (audit log only); `GET|POST /api/pos/held` `{label?,items,meta?}` / `DELETE /api/pos/held/[id]`; `GET /api/dashboard` → DashboardDTO (role-aware).
Master data (C): `GET /api/products?search&categoryId&includeInactive` (w/ variantGroups+options+category), `POST /api/products` (grant product.manage), `PATCH /api/products/[id]` (product.manage; availability-only changes need only availability.toggle), `DELETE /api/products/[id]` (soft), `POST /api/products/bulk {ids,action,value}`; `GET|POST /api/categories`, `PATCH|DELETE /api/categories/[id]` (delete guarded); `GET /api/stock/items?search&lowOnly&unit` → `{items,totalValue}`, `POST /api/stock/items` (stock.manage), `PATCH /api/stock/items/[id]`, `DELETE /api/stock/items/[id]` (stock.delete), `GET /api/stock/movements?itemId&type&userId&from&to&page` → `{rows,total,page,pageSize}`, `POST /api/stock/movements {itemId,type,qty,reason?,note?}` (stock.manage), `POST /api/stock/restock {supplier,lines:[{itemId,qty,unitCost}]}` (stock.manage), `GET /api/stock/recipes?productId` + `PUT /api/stock/recipes {productId,lines}` (recipe.manage), `GET /api/stock/recipes/coverage`, `GET /api/stock/counts` (today's draft), `POST /api/stock/counts {lines}` (stock.manage), `POST /api/stock/counts/approve` (count.approve); `GET /api/users` (user.manage), `POST /api/users`, `PATCH /api/users/[id] {name?,role?,password?,pin?,isActive?,isTraining?,grants?}`.
Reports & data (D): `GET /api/reports/summary?from&to` → ReportSummaryDTO (non-report.viewAll locked to today), `GET /api/reports/history` → DailyReportRow[], `GET /api/reports/x?businessDate` → DayReportSnapshot, `POST /api/reports/z {businessDate?,countedCash,merchantQrisTotal?,override?}` (grant data.report), `POST /api/reports/autoclose` (data.report) → closed dates; `GET /api/data/templates?type=PRODUCTS|STOCK|RECIPES|USERS` → xlsx file; `POST /api/data/import/preview` (FormData: file, type) → `{rows:[{row,status:'NEW'|'UPDATE'|'ERROR',message?,current?}],counts}` (grant data.import); `POST /api/data/import/commit {type,rows}` → `{inserted,updated,failed}` (data.import, transactional); `GET /api/data/export?type=ORDERS|PRODUCTS|STOCK|MOVEMENTS|USERS|AUDIT|DAILY_PACK&from&to&businessDate?` → xlsx download; `GET /api/activity?userId&action&entity&from&to&page` (activity.view).
All responses: `{ data }` on success (via `ok()`), `{ error }` on failure. Mutations re-fetch via TanStack invalidation.

### 1.6 Next.js 16 rules
- `params`/`searchParams` are Promises in pages/routes: `const { id } = await params`.
- `cookies()` is async. API routes: `export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> })`.
- Use API routes for ALL mutations (no server actions). Client components + `'use client'` for interactive pages.
- Import alias `@/*` → `src/*`.

### 1.7 UX non-negotiables (every page)
Loading skeletons; empty states with CTA; error alerts with retry; Indonesian copy (formal-informal "kamu" tone, warm not stiff); optimistic updates where SPEC says so (KDS checks, availability toggles) with rollback + toast; `Esc` closes sheets; `/` focuses search where SPEC says; 44px targets; responsive mobile-first; semantic HTML + aria labels; no console errors; no dead buttons.

### 1.8 Seeded demo accounts (for verification)
`admin` / `kasir1` / `barista1` — password `password123` for all. PINs: admin `1234`, kasir1 `1111`, barista1 `2222`.

---

## 2. Progress Log

### Phase 0 — Foundation (lead) — COMPLETE
- [x] Pre-execution check completed; SPEC amended (CashMovement + opening float + Z expected-cash formula).
- [x] Packages added: `bcryptjs`, `jose`, `qrcode`, `socket.io-client`, `xlsx`.
- [x] Brand assets: `public/logo.png` (as uploaded, 428×593 RGBA), `src/app/icon.png`, `public/qris-demo.png` (structurally-valid QRIS EMV payload, demo merchant).
- [x] Prisma schema (19 models) pushed; realistic seed: 5 users (password123; PINs admin 1234 / kasir1 1111 / barista1 2222), 3 categories, 18 products (16 w/ real web images via image-search OSS URLs; 1 sold-out demo), full variant groups (Ukuran/Sajikan/Gula/Topping), 18 stock items (1 low-stock demo), 14 recipes, yesterday 6 orders (1 paid-cancel void demo) + today 6 live orders (READY w/ full checks, PREPARING w/ partial checks — kitchen gate demo, PUBLIC unpaid delivery, PUBLIC pending-verification QRIS), 1 held order, cash float today Rp 50.000, 2-day-ago closed Z (variance −1.000 demo), yesterday left UNCLOSED on purpose (dashboard alert + auto-close demo), waste movement, audit feed.
- [x] Core libs: types/format/grants/client (client-safe) + auth/api/settings/business-day/audit/realtime/orders/payments/stock/reports (server) — server-authoritative money, kitchen gate, QRIS tri-state, non-blocking recipe deduction, X/Z computation, auto-close.
- [x] Middleware route/role guard; root layout (Fraunces + Plus Jakarta Sans); providers (theme/query/session/sonner); espresso-caramel token system w/ dark mode + KDS dark surface + print profiles; not-found + error boundaries.
- [x] Staff shell: espresso sidebar (gold logo as-is), topbar (open/closed chip, shift/cash chip, Cmd+K, theme, user menu), mobile bottom tabs, connection banner; command palette; PageGuard/403; status badges; Money; primitives.
- [x] APIs: auth login/logout/me (bcrypt + JWT cookie + rate limit 5→30s), settings GET/PATCH, pos/cash GET/POST.
- [x] Realtime mini-service: socket.io :3030 (path '/') + internal emit :3031 (secret); verified end-to-end.
- [x] `bun run lint` + `tsc --noEmit` clean.
- Note: Order codes are daily (`@@unique([businessDate, code])`); product import matches by NAME (products have no SKU by design per SPEC §1.6); stock import matches by sku; users by username.

### Phase 1 — Parallel page build (Tasks 2-a/b/c/d)
- [x] 2-a Agent A: storefront `/`, `/track/[code]`, `/board` + 5 public APIs + 16 public components + zustand cart store. (Agent hit tool deadline; output complete + integrated.)
- [x] 2-b Agent B: `/login`, `/dashboard`, `/pos`, kitchen+orders APIs, charge modals, receipt print, variant sheet, POS workspace + rails. (Deadline cut; **completed by lead**: kitchen page components verified, orders list, order detail body finished by lead — charge/verify/cancel/void/fulfillment/print/WhatsApp actions.)
- [x] 2-c Agent C: `/products`, `/stock`, `/users` + 16 APIs + 15 management components; settings sections built. (Deadline cut; **settings page completed by Agent D2 run**.)
- [x] 2-d Agent D: reports/data/activity APIs + lib/excel.ts + reporting components. (Deadline cut mid-write of excel.ts — brace fixed by lead.)
- [x] 2-b-2 Agent B2 (completion run): kitchen-board + kitchen-card + orders table + order detail (detail body stub finished by lead).
- [x] 2-d-2 Agent D2 (completion run): `/settings`, `/reports`, `/data`, `/activity` pages + report-tabs helper. Report: clean tsc + scoped lint.

### Phase 2 — Integration (lead)
- [x] Fixed agent hand-off type errors (24): DraftLine.productName optional, VariantGroupDTO.isActive added, board route selects, users grants JSON casts, summarizeHours callers (.hours → .hours.days), dashboard icon capitalization, AlertDescription asChild removals, apiFetch generics, imports.
- [x] Fixed 4 react-hooks/set-state-in-effect lint errors (deferred-reset pattern); fixed kitchen-board memo deps (preserve-manual-memoization); eslint --fix cleanup.
- [x] **Final state: `tsc --noEmit` 0 errors · `bun run lint` 0 problems.**
- [x] dev.log healthy: pages + APIs compile and respond.
- [x] E2E browser verification (agent-browser) — golden paths below.

### Phase 3 — E2E verification & hotfixes (lead, agent-browser via caddy :81)
- [x] Storefront: hero/status chip/menu/product sheet (variant chips + live price)/cart (undo, service types, delivery fee)/checkout "Bayar di Kasir" → SKC-007 confirmation with stepper; localStorage menu cache; sold-out badge; WhatsApp link.
- [x] Track `/track/SKC-007`: stepper, unpaid state, 30s poll + WS.
- [x] Board `/board`: live clock, SEDANG DISIAPKAN/SIAP DIAMBIL zones, realtime updates when kitchen completes.
- [x] Login: kasir1 → /pos redirect, role-filtered nav (Dapur "LIHAT" for cashier).
- [x] POS: product grid w/ sold-out; direct + variant-sheet adds; cart rail w/ table quick-picks; cash strip (expected Rp 103.000 ✓); held order badge; cash charge flow: keypad + quick tender 50k → change Rp 26.000 → SKC-008 PAID + print buttons; active orders tab: QRIS verification rail (SKC-006 confirmed w/ anti-fraud reminder → toast), unpaid list, serve buttons.
- [x] Kitchen (barista1): always-dark KDS, FIFO columns, elapsed timers, variant CHOICES only, **THE GATE verified live**: partial checks → "Terkunci — sisa N cup belum dicentang"; first check auto-advances to Dimasak; all checked → "Selesaikan Pesanan" unlocks → READY w/ 5s Undo + serve → COMPLETED; board updated live via WS.
- [x] Admin dashboard: KPIs live (Rp 249.000, 8 pesanan, AOV), cash-vs-QRIS split, busiest-hour chip, alerts (unpaid, unclosed day), live feed; **unclosed-day alert resolved after Z close** ✓.
- [x] Orders list + detail: filters URL-synced, badges, action bar (charge/verify/reprint/WhatsApp/cancel w/ impact/void item), timeline stepper.
- [x] Z-report wizard end-to-end: date=yesterday → review (0 warnings) → cash count (expected Rp 119.000, counted 117.000, live variance −2.000 + permanence warning) → figures (net Rp 159.000, QRIS merchant reconciliation field) → close → toast + Z history row (Kam, 19 Nov, variance recorded).
- [x] Excel: PRODUCTS template (Petunjuk/Produk/Varian Grup sheets), DAILY_PACK (6 sheets), ORDERS export — all valid xlsx; import preview round-trip: 4 rows, all UPDATE-matched by name.
- [x] Dark mode toggle; mobile 390px: storefront + all staff pages no horizontal overflow.
- [x] Realtime verified through gateway (io('/?XTransformPort=3030')); connection banner on direct-port access.

### Hotfixes during verification
1. **Prisma `_sum: {}` invalid** (reports.ts wasteAgg) → `_sum: { qtyDelta: true }` + real wasteTotal. X-report 500 → fixed.
2. **OOM crash**: dev.log/.zscripts log growth inside watched project triggered a Turbopack Fast-Refresh rebuild storm under polling → next-server OOM-killed (2.7GB). Fix: dev script now tees to `/tmp/sekelas-dev.log` (outside watch); server restarted; no rebuild storms since; memory stable.
3. **Dashboard mobile overflow** (grid children missing min-w-0) → fixed, all pages overflow-free at 390px.

### Final state
- `tsc --noEmit`: **0 errors** · `bun run lint`: **0 problems** · server log clean · all services (next :3000, caddy :81, realtime :3030/:3031) healthy.
- Demo accounts: admin / kasir1 / kasir2 / barista1 / barista2 — `password123` (PINs 1234/1111/2222/3333/4444).
- Logs: dev server output → `/tmp/sekelas-dev.log`; realtime → `/tmp/realtime.log` (kept out of the project dir to prevent the rebuild loop).

---

## 4. Revision Round 2 (client feedback — 6 items)

### 4.1 Operating hours corrected to 07:00–14:00
The intended hours are **7 AM – 2 PM**, not 2 AM. Fixed everywhere the default lives:
- `src/lib/settings.ts` DEFAULTS hours (Mon–Fri `07:00–14:00`, weekends closed) + `isCafeOpenNow` reason string. No DB row existed for `hours`, so defaults govern everywhere (storefront chip, closed banners, staff topbar via live settings, public-order gating, hours summary in API errors).
- Hardcoded fallbacks: `src/components/staff/app-shell.tsx` (sidebar footer + chip title), `src/app/login/page.tsx`, SPEC.md (4 references), comment in `api/public/orders/route.ts`.
- Verified live: chip "Tutup · buka Senin 07.00", banner "…Senin–Jumat · 07.00–14.00…", staff topbar "Sen–Jum · 07.00–14.00 WIB".

### 4.2 Order board (`/board`) — full redesign (Agent E1 + lead refinements)
"Still very poor" → rebuilt as an **airport-departure-board-for-coffee** kiosk:
- Always-dark espresso surface with subtle caramel radial glow; Fraunces wordmark; giant glowing mono clock (role=timer) + localized long date.
- Two zones: left = SAWEG DIPUNDAMEL/PREPARING queue rail (cards with age-warming left accent: white → amber → red at 5/10 min), right (dominant) = gold-tinted SIAP DIAMBIL/READY FOR PICKUP panel, huge container-query-scaled codes (`clamp(3.25rem,18cqw,7.5rem)`), gold type badges with icons (UtensilsCrossed/ShoppingBag/Bike), counts in headers.
- **Elapsed & waiting timers** (new, genuinely useful at a counter): preparing = minutes since `createdAt`, ready = minutes since `readyAt`; format flips to hours at 60+ ("4j 34m" / "4h 34m" / "4 jam 34 mnt").
- Cards GROW to fill the kiosk height (flex grow + `auto-rows-fr`) — no dead voids; `lg:h-dvh` kiosk mode with internal `scrollbar-warm` scrolling + `scrollbar-gutter: stable` (no layout shift).
- All preserved behavior: WS + 15s polling, chime+flash on new-ready (never sound-only, no first-load chime), 5-min completed fade, per-device sound toggle, fullscreen sync, idle screen, offline indicator (now bottom-center, larger), skeletons, `placeholderData`.
- Badge normalization: data tableLabel "Meja 2" renders as "MEJA 2" (never "MEJA Meja 2") — applied in board `badgeLabel` + shared `orderTypeLabel`.
- Dev-tools chrome hidden on the kiosk (`body:has(.board-kiosk) nextjs-portal { display:none }` — production builds don't ship it anyway).
- Two VLM design-review iterations landed (contrast/typography/terminology/balance fixes documented above).

### 4.3 Google Maps embed replaces the address text
`src/components/public/site-footer.tsx`: the long address paragraph in "Kunjungi" is replaced by the client-supplied Google Maps **iframe embed** (responsive `aspect-[4/3]` rounded card, `border white/15`, lazy, strict-origin-when-cross-origin) + a "Buka di Google Maps" link + hours line beneath. Hero address chip shortened to "SMKN 1 Boyolangu, Tulungagung" and now links to Maps. Verified rendering (roads/labels/attribution visible in browser).

### 4.4 Cart: multiple variants per item + inline editing (the "2 Large + 1 Small" ask)
- **Store** (`src/stores/cart.ts`): new `updateLine(lineId, patch)` — patches options/qty/note in place; if the edited selection now matches a different line (same product+options+note), it **merges** into that line (quantities summed) instead of leaving duplicates.
- **Product sheet** (`product-sheet.tsx`) two modes:
  - *ADD*: after "Tambah", the sheet **stays open** with a success panel ("Masuk keranjang" + qty) and two actions — "Tambah varian lain" (reset config, keep sheet) and "Lihat Keranjang" — the GoFood/Grab pattern that makes mixed sizes discoverable. A hint line under the variant groups explains it ("mis. 2 Large + 1 Small"). `onViewCart` wiring closes product sheet → opens cart.
  - *EDIT* (`editLine` prop): prefilled selections/qty/note (dropping options that no longer exist on the product), "Simpan Perubahan" button, validation unchanged.
- **Cart sheet**: lines **grouped by product** (image+name header, group qty & subtotal) with each variant line individually editable — chip row tap, pencil icon, or "Ubah" button opens the nested ProductSheet in edit mode (still on the menu = editable; removed-from-menu lines show edit disabled). Qty stepper + note + remove-with-undo per line as before.
- E2E verified: add 2× Large → add 1× Reguler (two lines under one product) → edit Reguler→Large → merges into a single 3× Large line (Rp 39.000).

### 4.5 PWA (Agent E2 + lead integration)
- **Icons** (sharp, from the logo — no borders/frames): `/icons/icon-{96,192,512}.png` (transparent, any), `maskable-{192,512}.png` (espresso bg, 62% safe-zone), `apple-touch-icon.png` (180).
- **`public/manifest.webmanifest`**: standalone, `start_url "/"`, theme `#241610` / bg `#FBF7F0`, shortcuts to `/board` + `/track`, maskable+any icons. Wired via root `metadata.manifest` + `appleWebApp` + apple-touch-icon.
- **`public/sw.js`** (vanilla, ~150 lines): resilient precache (`/offline`, brand assets), old-cache sweep, SKIP_WAITING + clients.claim. Fetch router: **navigations network-first** (15s timeout — generous for dev first-compiles) → cache → `/offline` shell → inline 503; **`/api/` always network** (POS data never cached); **brand assets cache-first**; everything else same-origin network-first.
  - *Dev-safety lesson (verified live)*: Turbopack dev chunk URLs are stable, NOT content-hashed — cache-first for `/_next/static/` served stale code after edits. Fixed by routing chunks network-first: in production they're content-hashed + `immutable` so the HTTP cache answers instantly anyway.
- **`register-sw.tsx`**: registers after window load; on SW update (waiting worker) posts SKIP_WAITING and reloads once on controllerchange — users never strand on half-old code.
- **`/offline` page**: static, trilingual, cream + logo + reload.
- **`use-install-prompt.ts`**: `beforeinstallprompt` capture (typed, no `any`) → `canInstall` + `promptInstall`; `appinstalled` resets. Header shows a caramel install button when available.
- Verified: SW controlling, manifest linked, `/offline` 200 + precached, offline navigation serves cached pages, cache updates + old cache swept.

### 4.6 Trilingual UI — Indonesian / English / **Krama Alus (formal Javanese)**
- **Architecture** (`src/lib/i18n/`): `id.ts` (source of truth, `as const` → `Dict` widened type), `en.ts`, `jv.ts` structurally validated (missing keys = compile error). `index.tsx` = client provider (`useI18n()` → `{ lang, setLang, t }`, typed dot-path keys, `{var}` interpolation, fallback to id). `shared.ts` = server-safe `normalizeLang`/`LANG_COOKIE` (no 'use client') for the root layout.
- **Persistence**: cookie `sekelas-lang` read by the **server** root layout → `<html lang>` + `initialLang` → zero hydration flash; `setLang` writes cookie + state (instant switch, next SSR matches). Verified: reload keeps `lang="jv"`.
- **Localized helpers**: day names (jv: Ahad/Senen/Selasa/Rebo/Kemis/Jemuwah/Setu), long dates ("Jemuwah, 20 November 2026"), datetimes (en gets comma), hours summaries ("Senen–Jemuwah · 07.00–14.00"), order-status/payment/order-type label maps.
- **Scope** (deliberate, real-world practice — GoFood/Grab/localized POS products): the complete **customer surface** (storefront, menu, product sheet, cart, checkout, QRIS step, confirmation, track, board, offline page, install prompt, connection banner, language switcher) is trilingual. Staff console stays Indonesian (students operate it daily in Indonesian; product/category/tagline/settings text is data). IDR formatting stays id-ID convention across locales ("Rp 12.000") — standard for IDR even in English contexts.
- **Language switcher**: globe button + listbox in the public header (native + english names, checkmark), Esc/outside-click close.
- **Krama Alus authenticity** (documented register decisions in `jv.ts` header): panjenengan/kula address pair; krama grammar (mboten, taksih, wonten, saweg, sampun, dereng, saged, kedah, mangga, lajeng, rumiyin, saking, ngantos, supados, déning); established krama verbs (tumbas, nyuwun, mendhet, ngaturaken, damel, nampi, kintun, nedahaken, mirsani, madosi, nyobi, ngraosaken, mbudalaken, ngurusi); Javanese orthography (cathetan, dhaftar, pajeg, ongkos, owah-owahan, kaperangan); attested idioms ("Matur nuwun sampun rawuh", "Sampun Kula Aturaken", "Mboten Nembe", "Dhahar ing Papan", "Wus Siap", "Ngentosi", "kepengker", "Kebuka/Ditutup", "binuka"). IDR/QRIS/kasir/struk kept as established loans.
- ~200 strings × 3 locales; all E2E-verified in each language (jv storefront/cart/track/board, en full flow, id default).

### 4.7 Verification (browser, agent-browser)
- Storefront id/jv/en: hero, banners, menu, product sheet, multi-variant add flow, grouped cart, inline edit + merge, service types, checkout gating (closed strict), footer map, language switch + cookie persistence + `<html lang>` SSR round-trip.
- Board jv + en: zones, timers (hours format), badges ("MEJA 2"), counts, offline pill, no overflow at 390px; VLM design review iterations (final: balanced edges, readable chips).
- Track en: stepper labels, "Placed 20 November 2026, 13.25", summary, payment chips.
- Staff: login → POS unaffected (Indonesian), topbar hours 07.00, no console errors (Radix sheet aria-describedby warnings silenced via `aria-describedby={undefined}`).
- PWA: manifest 200, SW controlling + updating (cache sekelas-v2), offline page + precache verified, install button appears when installable.
- `tsc --noEmit` 0 errors · `bun run lint` 0 problems · all routes 200 · no horizontal overflow at 390px on any public page.

---

## 5. Revision Round 3 — 1:1 SPEC Audit & Gap Fixes (pre-deployment)

Full audit vs SPEC.md via 4 parallel domain audits (public, staff ops, master data, reports/cross-cutting). Verdict ~90% spec-complete; all found gaps fixed; `tsc --noEmit` 0 errors · `bun run lint` 0 problems · E2E spot-verified.

### Critical gaps fixed
1. **PWA shortcut `/track` 404** → new trilingual `/track` index page (code input → `/track/[code]`).
2. **Cashier serve/deliver RBAC mismatch** (SPEC §1.7 "mark served") → `/api/orders/[id]/status` + `/courier` now allow CASHIER for serve transitions (OUT_FOR_DELIVERY/COMPLETED/courier); kitchen transitions stay Admin+Barista; UI gating updated.
3. **Unauthenticated financial/settings endpoints** → `GET /api/settings` + `GET /api/pos/cash` now `withAuth`; login page moved to `/api/public/settings` (public subset extended with `system.practiceMode`).
4. **Expected-cash visibility** follows `report.viewAll` (SPEC §1.7): `/api/pos/cash` masks expectedCash; POS cash-strip + topbar chip render a permission note instead; Z-wizard keeps expected via `/api/reports/x|z` (data.report).
5. **Dual-receipt auto-print unreliable** (second window.print() dropped) → sequential print queue in `receipt.tsx` (`printReceiptPair`: KOT dialog → afterprint → receipt dialog; one print-area node live at a time).
6. **Command palette SPEC §1.5 gaps** → added Cetak ulang struk terakhir (fetch+print+log), Cari pesanan lewat kode, Laporan X (hari ini) → `/data?x=1`, Ubah status habis/tersedia, Suara on/off; fixed dead "Cari pesanan" item.
7. **KDS keyboard navigation** → roving arrow-key focus across cards + Enter opens card menu + Esc returns; footer hint.
8. **`payment.refund` dead grant / no refund note** → post-payment cancel now records "Refund tunai manual … dari laci / Refund QRIS … di luar sistem" into cancelReason + audit (SPEC §3.9).
9. **Low-stock alert chain** (SPEC §3.11) → staff-shell dismissible banner on `stock:low` (+chime), KDS header chip (poll+WS), dashboard alert links; seeded low-stock item verified live.
10. **Shortfall visibility** → `deductRecipesForOrder` returns per-ingredient shortfalls → `stock.shortfall` audit entries → dashboard STOCK_SHORTFALL alerts with qty detail; `stock:low` WS on shortfall.
11. **Product image upload + client-side compression** (≤300KB ladder) + settings **logo upload** (PNG-alpha-aware) + duplicate no longer clones image.
12. **Per-tab report export dead UI** → "Ekspor Excel" exports the ACTIVE tab via `REPORT_TAB` backend.
13. **Voids tab actor filter** added.
14. **Practice-mode banner** — persistent amber "MODE LATIHAN" strip across staff shell + one-tap "Keluar Latihan" (login already marks isTraining).

### Minor gaps fixed
- Session expiry: 401 interceptor in `lib/client.ts` → toast + redirect preserving attempted URL (`?next=`); login page shows "Sesi berakhir" notice; PageGuard CTA preserves URL.
- 403 view lists the user's permitted pages as quick links; 404 CTA "Ke Dasbor" when authenticated.
- Dashboard: honest aggregation-error state (Alert+retry; no false "Semua aman"); auto-closed days surface as informational alerts; `ensureClosedDates()` now runs on dashboard access (SPEC §1.8 auto-close on next access).
- Orders list: sortable Waktu/Total (URL-synced, server-side); inline take-payment via the SAME ChargeDialog (no navigation).
- KDS: timer base green with amber/red escalation + red-threshold chime; volume slider (persisted).
- Shell: sidebar collapse-to-icon-rail (persisted), topbar WS connection dot, global sound toggle; OpenClosedChip WS-aware.
- Menu: 200ms skeleton anti-flash; empty-menu WhatsApp CTA; cart create-failure inline Alert + retry; storefront hero chip/settings-derived identity; browser offline detection (navigator.onLine) in connection banner.
- Stock: movements user filter + order-code links; editable restock date (≤30d backdate); "10 item tercepat" count preset (7-day SALE_DEDUCT ranking); searchable recipe pickers.
- Reports: TypesTab delivery-fee line; VoidsTab actor filter.
- Data: auto-open X dialog on `?x=1`; activity export carries user/action/entity filters; drawer links cuid Order entities.
- Excel: "Catatan" convention column on all template sheets (header-name mapping verified tolerant); daily pack "Limbah" waste-totals sheet.
- Receipts default footer now includes phone 0851 5182 3036 (SPEC §3.15).
- use-realtime: `NEXT_PUBLIC_REALTIME_URL` env (empty → pure polling, no banner); silent-refetch-on-reconnect global event; `payment.refund` note (see #8).
- Dead code removed: `summarizeHours` shim.
- Login page: pre-auth settings via public subset.

### Known accepted deviations (documented)
- POS cart autosave is per-device localStorage (not server HeldOrder-lite draft) — deliberate at this scale; held orders remain the cross-session park mechanism.
- Payment-mix split itemization needs a DTO addition (deferred — itemized per-payment rows exist in DAILY_PACK export).
- Staff console remains Indonesian-only by design (worklog §4.6).
