-- AlterTable
ALTER TABLE "ValidatorTransaction" ADD COLUMN "rawTx" TEXT;

-- AlterTable
ALTER TABLE "WalletTransaction" ADD COLUMN "rawTx" TEXT;
