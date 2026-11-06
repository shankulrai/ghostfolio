-- CreateTable
CREATE TABLE "Portfolio" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Portfolio_userId_idx" ON "Portfolio"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_userId_name_key" ON "Portfolio"("userId", "name");

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==========================================
-- ROLLBACK PROCEDURE (manual execution):
-- ==========================================
-- 1. Verify no dependent data exists:
--    SELECT COUNT(*) FROM "Portfolio";
--    (Portfolios are created lazily after consent, so count reflects user-created rows only)
--
-- 2. If count matches expected, proceed with rollback:
--    BEGIN;
--    DROP TABLE "Portfolio";
--    COMMIT;
--
-- 3. Update schema.prisma:
--    - Remove "model Portfolio" block
--    - Remove "portfolios Portfolio[]" field from User model
--
-- 4. Mark migration as rolled back in Prisma:
--    npx prisma migrate resolve --rolled-back 20261106163340_add_portfolio_model
--
-- 5. Regenerate Prisma client:
--    npx prisma generate
--
-- CRITICAL: Do NOT run this rollback if any application code depends on
-- Portfolio entity or if portfolios have been manually created/modified.
