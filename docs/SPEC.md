# ElectroPrice: brief

Kept verbatim so later work can be checked against it. Where the build deliberately differs, the reason is noted in [CLAUDE.md](../CLAUDE.md) under "Decisions".

## 1. Client requirement

**DEVELOPERS REQUIRED – CUSTOM SOFTWARE DEVELOPMENT PROJECT**
We are looking for an experienced software developer or development team for a custom software project for **Electronics Business**

**Project Overview**
The client requires a simple, smart and user-friendly software application to quickly identify the Dealer Price and MRP of electronic products and easily maintain updated pricing information.

**Key Features & Requirements:**

**1. Product Price Finder**
- Search products by name, brand, model number or product code.
- Instantly display Dealer Price and MRP.
- Barcode scanning support, if feasible.

**2. Easy Price Management**
- Quickly update product prices whenever dealer prices or MRP change.
- Bulk price updates through Excel uploads.
- Maintain previous price records and update history.
- Easy-to-use admin dashboard.

**3. Smart Invoice Scanning (Important Feature)**
- Upload or scan supplier invoices using a mobile camera or PDF.
- Automatically extract product names, model numbers, quantities, Dealer Prices and MRP wherever available.
- Identify existing products and update their prices.
- Automatically identify new products and provide an option to add them to the product database.
- Allow users to review and confirm extracted information before saving.

**4. Product Database**
- Maintain a centralized product database.
- Add, edit and delete products.
- Track product price changes over time.
- Avoid duplicate product entries.

**5. User Access**
- Simple interface accessible through mobile and desktop.
- Multiple user access with admin controls.
- Secure login and data management.

## 2. Master prompt (sections 1–4 as supplied)

### 1. Project Overview & Ideology
We are building an internal B2B web application (PWA-ready) for an electronics retail business.
**Core Problem:** Electronic product dealer prices fluctuate frequently across suppliers. Staff on the shop floor need an instant way to scan a product barcode or search by name/model to see the true **Dealer Price (Cost)** and **MRP (Selling Price)**, while admins need an effortless way to update prices directly from supplier tax invoices without manual data entry.

**Core Ideology:**
- **Zero-Friction Human-in-the-Loop AI:** Supplier invoices vary wildly in format and often omit MRP (listing only List Price, Discounts, Taxable Value, and GST). AI extracts the raw invoice table, and the admin reviews, calculates/inputs the MRP, matches existing products or creates new ones, and commits to the database.
- **Mobile-First for Staff, Desktop-Rich for Admins:** Shop floor staff use mobile browsers to scan barcodes and check prices in <2 seconds. Admins use desktop/tablet views to review multi-column invoice tables, upload Excel sheets, and print barcode labels.
- **Zero-Cost AI Execution:** Utilize Google's `gemini-2.5-flash` via the official `@google/genai` SDK (free tier) with Structured Outputs to guarantee strict JSON extraction from invoice images/PDFs.

### 2. Tech Stack & Architecture
- **Framework:** Next.js (App Router), TypeScript, React
- **Styling & UI:** Tailwind CSS + Shadcn UI + Lucide Icons
- **Database & ORM:** PostgreSQL (Neon DB) + Prisma ORM
- **Authentication:** Auth.js (NextAuth v5) or custom JWT session with Role-Based Access Control (`ADMIN`, `STAFF`)
- **AI / OCR Engine:** `@google/genai` SDK using `gemini-2.5-flash` with strict JSON schema response
- **Barcode Scanning & Generation:** `html5-qrcode` (camera scanning) + `react-barcode` or `bwip-js` (printable barcode label generation)
- **Excel Processing:** `xlsx` (SheetJS) for bulk import/export
- **State & Forms:** React Hook Form + Zod + TanStack Table (for the editable invoice review grid)

### 3. UI/UX Design System
- **Aesthetic:** Clean, high-contrast utilitarian SaaS (inspired by Linear and modern POS dashboards). Fast, scannable, zero visual clutter.
- **Color Palette:**
  - Background: `slate-50` (light mode default for bright retail lighting) / `zinc-950` (dark mode support)
  - Primary Accent: `indigo-600` (actions, primary buttons)
  - Semantic Badges: `emerald-600` (MRP / In Stock / Matched Product), `amber-500` (Price Changed / Needs Review), `blue-600` (New Product Detected)
- **Typography:** `Inter` or `Geist Sans` for UI; `JetBrains Mono` or `Geist Mono` for SKU codes, barcodes, GSTIN, and currency figures (`₹`).
- **Key UX Patterns:**
  - **Sticky Global Search & Scan Bar:** On mobile, a prominent bottom or top floating action button to trigger the camera barcode scanner immediately.
  - **Split-Screen Invoice Review (Desktop):** Left pane shows the zoomable uploaded invoice image/PDF; Right pane shows the editable extracted line-items table so the admin can cross-check numbers effortlessly.

### 4. Database Schema
Models `User`, `Product`, `ProductAlias`, `PriceHistory` and `InvoiceScanLog`, with the fields and relations now in [prisma/schema.prisma](../prisma/schema.prisma). Fields added beyond the brief are marked `// +` there.

The supplied text ended after `InvoiceScanLog`. Pages, routes, matching logic and phases were designed from the requirement above; see the phase checklist in [CLAUDE.md](../CLAUDE.md).
