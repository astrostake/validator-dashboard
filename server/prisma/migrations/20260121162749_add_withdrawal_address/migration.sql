-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN "withdrawalAddress" TEXT;

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ValidatorTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hash" TEXT NOT NULL,
    "height" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" TEXT,
    "delegator" TEXT,
    "validator" TEXT,
    "dstValidator" TEXT,
    "category" TEXT NOT NULL DEFAULT 'own',
    "rawTx" TEXT,
    "priceAtTx" REAL NOT NULL DEFAULT 0,
    "walletId" INTEGER NOT NULL,
    CONSTRAINT "ValidatorTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ValidatorTransaction" ("amount", "category", "delegator", "dstValidator", "hash", "height", "id", "rawTx", "timestamp", "type", "validator", "walletId") SELECT "amount", "category", "delegator", "dstValidator", "hash", "height", "id", "rawTx", "timestamp", "type", "validator", "walletId" FROM "ValidatorTransaction";
DROP TABLE "ValidatorTransaction";
ALTER TABLE "new_ValidatorTransaction" RENAME TO "ValidatorTransaction";
CREATE INDEX "ValidatorTransaction_walletId_height_idx" ON "ValidatorTransaction"("walletId", "height");
CREATE INDEX "ValidatorTransaction_height_idx" ON "ValidatorTransaction"("height");
CREATE INDEX "ValidatorTransaction_validator_idx" ON "ValidatorTransaction"("validator");
CREATE INDEX "ValidatorTransaction_category_idx" ON "ValidatorTransaction"("category");
CREATE UNIQUE INDEX "ValidatorTransaction_hash_walletId_key" ON "ValidatorTransaction"("hash", "walletId");
CREATE TABLE "new_WalletTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hash" TEXT NOT NULL,
    "height" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" TEXT,
    "sender" TEXT,
    "recipient" TEXT,
    "direction" TEXT,
    "rawTx" TEXT,
    "priceAtTx" REAL NOT NULL DEFAULT 0,
    "walletId" INTEGER NOT NULL,
    CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WalletTransaction" ("amount", "direction", "hash", "height", "id", "rawTx", "recipient", "sender", "timestamp", "type", "walletId") SELECT "amount", "direction", "hash", "height", "id", "rawTx", "recipient", "sender", "timestamp", "type", "walletId" FROM "WalletTransaction";
DROP TABLE "WalletTransaction";
ALTER TABLE "new_WalletTransaction" RENAME TO "WalletTransaction";
CREATE INDEX "WalletTransaction_walletId_height_idx" ON "WalletTransaction"("walletId", "height");
CREATE INDEX "WalletTransaction_height_idx" ON "WalletTransaction"("height");
CREATE UNIQUE INDEX "WalletTransaction_hash_walletId_key" ON "WalletTransaction"("hash", "walletId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
