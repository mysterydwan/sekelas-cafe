# Sekelas Cafe — Cafe Operations & POS

The complete counter-to-kitchen system for **Sekelas Cafe**, the student-operated
teaching-factory cafe of **SMKN 1 Boyolangu** (Tulungagung, East Java):
no-login customer self-ordering, a cashier terminal, a gated kitchen queue,
recipe-level stock, Excel data management with X/Z reporting, and fully
audited role-based access.

Built for the school's reality — rotating student cohorts, one counter, class-break
rushes, shared tablets, 07:00–14:00 Mon–Fri service.

## Highlights

- **Storefront & self-ordering (no login)** — digital menu with product variants
  (size / sugar level / toppings with price deltas), persistent multi-variant cart
  with inline editing, QRIS static-QR checkout with the manual-verification
  protocol, live order tracking, and a big-type ready board for the pickup counter.
- **Cashier terminal** — variant-aware POS with held orders, split cash+QRIS
  payments, discounts with mandatory reasons, cash-drawer management (opening
  float, cash in/out, expected-cash math), and dual receipts (kitchen ticket +
  customer receipt) with reliable sequential printing.
- **Kitchen (KDS)** — dark, touch-first kanban with per-unit check-off gating:
  an order physically cannot be marked ready until every unit is checked.
  Blink-until-acknowledge on modifications, elapsed-timer escalation, undo.
- **Stock** — recipe-level deduction that never blocks a sale, attributed
  append-only movement ledger, waste logging, blind-count opname with approvals,
  restock with weighted unit costs, low-stock alerts everywhere.
- **Excel & data** — Z/X report wizards with cash-variance and QRIS
  merchant-app reconciliation, daily report packs, import with parse → preview →
  confirm upserting, versioned templates with an Indonesian instruction sheet.
- **Audited everything** — grants-not-roles RBAC (Admin / Cashier / Barista),
  per-action audit log with field-level diffs, business-day sequencing,
  auto-close of forgotten days.
- **PWA + trilingual** — installable, offline-tolerant, and fully trilingual on
  the customer surface: Bahasa Indonesia, English, and Krama Alus (formal
  Javanese).

## Stack

- **Next.js 16** (App Router) + TypeScript strict
- **Prisma** + **Supabase Postgres** (`ap-southeast-1`)
- **Tailwind CSS 4** + shadcn/ui (New York) — espresso brown & caramel gold
- **socket.io** mini-service for realtime (orders, kitchen, stock, payments)
- **SheetJS** for the Excel round-trip
- Zustand + TanStack Query, sonner, lucide-react

## Getting started

```bash
bun install
bun run db:push     # apply prisma/schema.prisma to your database
bun run db:seed     # realistic demo data (users, menu, orders, stock, reports)
bun run dev
```

Demo accounts (password `password123` for all):

| User     | Role    | PIN  |
| -------- | ------- | ---- |
| `admin`  | Admin   | 1234 |
| `kasir1` | Cashier | 1111 |
| `barista1` | Barista | 2222 |

### Environment

```
DATABASE_URL=postgresql://…        # Supabase pooler URL
AUTH_SECRET=<random string>        # JWT session signing
REALTIME_SECRET=<random string>    # internal emit auth for the socket service
# Optional: point clients at a socket.io endpoint. Leave EMPTY on hosts without
# one (e.g. serverless) — every surface falls back to polling automatically.
NEXT_PUBLIC_REALTIME_URL=
```

### Realtime service (self-hosting)

The socket.io mini-service lives in [`mini-services/realtime`](mini-services/realtime):

```bash
cd mini-services/realtime
bun install && bun run dev   # listens on :3030 (+ internal :3031)
```

Point `NEXT_PUBLIC_REALTIME_URL` at its public address (or a gateway that
forwards to it). Browsers subscribe; the Next.js server emits through the
internal endpoint with `REALTIME_SECRET`.

## Documentation

- [`SPEC.md`](SPEC.md) — the complete product specification (research-backed,
  ecosystem-verified feature set)
- [`worklog.md`](worklog.md) — the living build log: pre-execution checks,
  revisions, verification rounds, and the full audit trail of decisions

## License

Built for SMKN 1 Boyolangu. All rights reserved.
