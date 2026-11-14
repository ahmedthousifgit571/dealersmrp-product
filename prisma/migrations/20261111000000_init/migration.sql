-- Trigram search (fuzzy product lookup). Neon supports pg_trgm.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('INVOICE_OCR', 'EXCEL_BULK', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'PENDING_REVIEW', 'COMMITTED', 'FAILED', 'DISCARDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "skuCode" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "modelNumber" TEXT,
    "modelKey" TEXT,
    "category" TEXT,
    "hsnCode" TEXT,
    "dealerPrice" DECIMAL(10,2) NOT NULL,
    "mrp" DECIMAL(10,2) NOT NULL,
    "gstPercentage" DECIMAL(5,2) NOT NULL DEFAULT 18.0,
    "stockQty" INTEGER NOT NULL DEFAULT 0,
    "searchText" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAlias" (
    "id" TEXT NOT NULL,
    "aliasName" TEXT NOT NULL,
    "aliasKey" TEXT NOT NULL,
    "supplierName" TEXT,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "oldDealerPrice" DECIMAL(10,2),
    "newDealerPrice" DECIMAL(10,2) NOT NULL,
    "oldMrp" DECIMAL(10,2),
    "newMrp" DECIMAL(10,2) NOT NULL,
    "supplierName" TEXT,
    "invoiceNumber" TEXT,
    "source" "PriceSource" NOT NULL,
    "note" TEXT,
    "changedById" TEXT,
    "invoiceScanId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceScanLog" (
    "id" TEXT NOT NULL,
    "supplierName" TEXT,
    "supplierGstin" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "totalAmount" DECIMAL(12,2),
    "rawJson" JSONB,
    "reviewJson" JSONB,
    "status" "ScanStatus" NOT NULL DEFAULT 'UPLOADED',
    "aiModel" TEXT,
    "isMock" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "lineCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT,
    "committedById" TEXT,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceFile" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA,
    "pageOrder" INTEGER NOT NULL DEFAULT 0,
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL DEFAULT 'app',
    "businessName" TEXT NOT NULL DEFAULT 'ElectroPrice',
    "staffCanSeeDealerPrice" BOOLEAN NOT NULL DEFAULT true,
    "skuPrefix" TEXT NOT NULL DEFAULT 'ELEC',
    "nextSkuNumber" INTEGER NOT NULL DEFAULT 1001,
    "defaultGst" DECIMAL(5,2) NOT NULL DEFAULT 18.0,
    "mrpMarkupPct" DECIMAL(5,2),
    "addInvoiceQtyToStock" BOOLEAN NOT NULL DEFAULT false,
    "purgeInvoiceFilesAfterDays" INTEGER NOT NULL DEFAULT 90,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Product_skuCode_key" ON "Product"("skuCode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_searchText_trgm_idx" ON "Product" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_brand_modelKey_idx" ON "Product"("brand", "modelKey");

-- CreateIndex
CREATE INDEX "Product_archivedAt_updatedAt_idx" ON "Product"("archivedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAlias_aliasKey_key" ON "ProductAlias"("aliasKey");

-- CreateIndex
CREATE INDEX "ProductAlias_productId_idx" ON "ProductAlias"("productId");

-- CreateIndex
CREATE INDEX "PriceHistory_productId_changedAt_idx" ON "PriceHistory"("productId", "changedAt");

-- CreateIndex
CREATE INDEX "PriceHistory_changedAt_idx" ON "PriceHistory"("changedAt");

-- CreateIndex
CREATE INDEX "InvoiceScanLog_status_createdAt_idx" ON "InvoiceScanLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceFile_scanId_pageOrder_idx" ON "InvoiceFile"("scanId", "pageOrder");

-- AddForeignKey
ALTER TABLE "ProductAlias" ADD CONSTRAINT "ProductAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_invoiceScanId_fkey" FOREIGN KEY ("invoiceScanId") REFERENCES "InvoiceScanLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceScanLog" ADD CONSTRAINT "InvoiceScanLog_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceScanLog" ADD CONSTRAINT "InvoiceScanLog_committedById_fkey" FOREIGN KEY ("committedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceFile" ADD CONSTRAINT "InvoiceFile_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "InvoiceScanLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
