@AGENTS.md

# ElectroPrice: project notes

Internal web app for an electronics shop. Staff scan or search a product to see **Dealer Price** and **MRP**. Admins keep prices current by hand, from Excel, or from supplier GST invoices read by AI. The full brief is in [docs/SPEC.md](docs/SPEC.md).

## Decisions (agreed 2026-11-11)
- **Dealer Price is stored excluding GST**: the net per-unit rate after discounts. "Landing" (incl. GST) = dealer × (1 + GST%) is calculated and shown beside it everywhere (`src/lib/pricing.ts`).
- **The build is phased.** Stop after each phase for the user's review, and don't start the next phase unasked.
- **Gemini key comes later.** Invoice extraction falls back to a mock extractor while `GEMINI_API_KEY` is empty.
- **Model `gemini-3.8-flash`** via `GEMINI_MODEL`. The brief's `gemini-2.5-flash` shuts down on 2026-12-01. Check `ai.models.list()` before relying on the ID.
- **Custom auth** (jose JWT cookie + bcryptjs), not Auth.js, because v5 is still beta. `src/proxy.ts` is an optimistic redirect only. **Every** page, server action and route handler calls `src/lib/auth/dal.ts` (`requireUser`, `requireAdmin`, `authorizeApi`).
- **Hiding dealer price from staff** (`staffCanSeeDealerPrice` setting) happens on the server: `toHit()` in `src/lib/products/queries.ts` sets dealer fields to null.

## Stack and version pins
- Next 16.4.6 with **Cache Components on** (it becomes mandatory in the next major version).
  - Request data (cookies, DB) must sit inside `<Suspense>`.
  - Read the user *before* any DB call, otherwise prerender hits the DB. `getSettings()` calls `connection()` for this reason.
  - Format dates with the fixed `en-IN` locale and `Asia/Kolkata` time zone (`src/lib/format.ts`).
- Prisma **7.10.1 pinned**, because npm `latest` is an 8.0 RC.
  - Config file is `prisma7.config.ts`; the client is generated to `src/generated/prisma`.
  - Runtime uses `@prisma/adapter-pg` with the pooled `DATABASE_URL`; migrations use `DIRECT_URL`.
  - `prisma init` drops agent-skill folders into the repo; delete them.
- shadcn 4.23 `base-nova` style (Base UI).
  - Use the `render` prop, not `asChild`; style a `<Link>` with `buttonVariants`.
  - Badge has extra variants: `success`, `warning`, `info`, `muted`.
- SheetJS is installed from `cdn.sheetjs.com`, because npm `xlsx@0.18.5` is vulnerable. TanStack Table is pinned to v8, because v9 has a new API.
- `turbopack.root` is set because the home folder has a stray `package.json` and lockfile. This folder has **its own git repo**; the home directory is also a repo.

## Conventions
- Money travels as **integer paise** (`src/lib/money.ts`) and is written to Prisma as `toDecimalString()`.
- Duplicates are detected with `modelKey` (`toModelKey`), aliases with `aliasKey` (`toAliasKey`), and search uses `searchText` (`buildSearchText`), all from `src/lib/normalize.ts`. Rebuild `searchText` whenever a product's name, brand, model, SKU, barcode or category changes.
- Every price change writes a `PriceHistory` row (`MANUAL` / `EXCEL_BULK` / `INVOICE_OCR`) with `changedById`.
- Demo catalogue: `prisma/seed-data.ts`. Its barcodes use the GS1 `20` in-store prefix; all supplier names are made up.
- Look: claymorphism with a liquid touch (agreed 2026-11-12). Use the utilities in `globals.css`, not flat `border bg-card shadow-xs`:
  - `clay-card` for raised panels, `clay-raised` for clickable chips and outline buttons, `clay-well` for recessed/nested trays and empty states, `clay-input` for fields, `clay-primary` for the orange action.
  - `glass` (with `[--glass-alpha:NN%]`) for floating chrome; `orb` + `tone-orange|teal|blue|gold` for icon spheres; shadow tokens `shadow-clay-sm|clay|clay-lg|well|press|glow|jelly`.
  - Clay fills are gradients, so `hover:bg-*` on a clay surface does nothing. Show state with shadow or ring instead (e.g. `hover:shadow-clay-lg`, `active:shadow-well`, `ring-2`).
  - Write only the unprefixed `backdrop-filter`: Lightning CSS keeps just the last of a `-webkit-` pair, which leaves Chrome with no blur.
- UI bar: no bare or placeholder screens. The nav only lists pages that exist (`src/components/layout/nav.ts`). Screenshot desktop (1440) and phone (390) before handing over.

## Commands
`npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run db:deploy` (apply migrations) · `npm run db:seed` · `npm run db:studio`

## Phase checklist
- [x] **1. Foundation & auth**: scaffold, schema + init migration (pg_trgm), seed, login/logout + lockout, proxy + DAL, responsive shell (sidebar / phone bottom bar, light and dark), **Price Finder (search)**, Users admin, Settings.
  - Verified on Neon 2026-11-11: migration (no drift), seed, all screens on desktop and phone in light and dark, add user, staff price hiding (API returns null dealer fields), staff blocked from /admin, deactivation signs the user out, lockout after 5 tries.
  - Search is one SQL round trip; auth, settings and search run in parallel (~350 ms from India to the Neon `us-east-2` database, in dev).
  - Gotchas:
    - Revoked-but-unexpired cookies go through `/auth/session-ended`, which clears the cookie; otherwise proxy and DAL loop.
    - shadcn `Sidebar` / `SidebarMenuButton` read `useIsMobile()` directly, not from context, to avoid a phone-only hydration mismatch (the sidebar streams in after the provider).
    - Killing the background `npx next dev` can leave the Node process holding the port.
- [x] **2–5 built in one pass (user's request, 2026-11-11)**; awaiting the user's review.
  - **2. Scanner & products**:
    - Scanner overlay `src/components/scanner/scanner-provider.tsx` handles camera, scan-from-photo, typed codes, USB/Bluetooth "wedge" bursts and the `/?scan=1` PWA shortcut.
    - Product page `/products/[id]` has a step chart and history. Admin `/admin/products` has filters, sort, quick price, archive/delete. Add/edit form has live duplicate checks. Dashboard is at `/admin`.
  - **3. Excel**:
    - Column detection lives in `src/lib/excel/columns.ts` (tested; recognises supplier headers like D.P. / M.R.P. / Model No.).
    - Server plan and commit live in `src/lib/excel/import.ts`: one bulk `UPDATE … FROM (VALUES …)`, reserved SKU block (unused part handed back) and `createManyAndReturn`.
    - Exports use the template columns, so files round-trip. History page is at `/admin/history`.
  - **4. Invoices**:
    - Flow: upload (`/invoices/new`, browser compression) → `POST /api/invoices` → `/files` → `/extract` (Gemini or `mock.ts`) → `match.ts` → `review.ts` rows → `/invoices/[id]` review → `confirmInvoice`. The commit claims `PENDING_REVIEW → COMMITTED` first, so double confirms are rejected.
    - Staff can upload; only admins review or confirm. Staff see only their own scans.
  - **5. Hardening**:
    - `manifest.ts` + icons (`scripts/generate-icons.mjs`).
    - Daily purge `/api/cron/purge-invoice-files` (Vercel Cron, `CRON_SECRET`).
    - Security headers; `error.tsx`; `not-found.tsx`.
  - Verified in the browser on Neon:
    - quick price; add product with duplicate override; Excel export → edit 3 prices + 1 new → import preview showed exactly those → applied;
    - demo invoice → 3 price changes / 2 new / 1 same / 1 to confirm → resolved → confirmed; stale-tab second confirm rejected;
    - wedge scan, photo scan;
    - staff 403/404 on admin APIs and other users' invoices.
  - Gotchas:
    - Fuzzy invoice suggestions need sim ≥ 0.33 or word_sim ≥ 0.65, and a differing model number excludes a candidate (tuned on demo wording).
    - The review renders a table and cards (CSS container query `@[58rem]`); IDs are `line-*` / `card-*`.
    - `bwip-js` must be imported from `bwip-js/browser` for types.
    - dev-browser can't `setInputFiles` from disk; inject a File via `DataTransfer` in `page.evaluate`.
  - The Gemini path is untested until `GEMINI_API_KEY` is set. Check that `GEMINI_MODEL` exists (`ai.models.list()`).
