-- CreateTable
CREATE TABLE "CorporateActionEvent" (
    "amountPerShare" DOUBLE PRECISION,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataSource" "DataSource" NOT NULL,
    "denominator" INTEGER,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "newSymbol" TEXT,
    "numerator" INTEGER,
    "processedAt" TIMESTAMP(3),
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "symbol" TEXT NOT NULL,
    "symbolProfileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorporateActionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CorporateActionEvent_idempotencyKey_key" ON "CorporateActionEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CorporateActionEvent_effectiveDate_idx" ON "CorporateActionEvent"("effectiveDate");

-- CreateIndex
CREATE INDEX "CorporateActionEvent_status_idx" ON "CorporateActionEvent"("status");

-- CreateIndex
CREATE INDEX "CorporateActionEvent_symbolProfileId_effectiveDate_idx" ON "CorporateActionEvent"("symbolProfileId", "effectiveDate");

-- AddForeignKey
ALTER TABLE "CorporateActionEvent" ADD CONSTRAINT "CorporateActionEvent_symbolProfileId_fkey" FOREIGN KEY ("symbolProfileId") REFERENCES "SymbolProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
