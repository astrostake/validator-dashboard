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
    "walletId" INTEGER NOT NULL,
    CONSTRAINT "ValidatorTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ValidatorTransaction" ("amount", "delegator", "dstValidator", "hash", "height", "id", "timestamp", "type", "validator", "walletId") SELECT "amount", "delegator", "dstValidator", "hash", "height", "id", "timestamp", "type", "validator", "walletId" FROM "ValidatorTransaction";
DROP TABLE "ValidatorTransaction";
ALTER TABLE "new_ValidatorTransaction" RENAME TO "ValidatorTransaction";
CREATE INDEX "ValidatorTransaction_walletId_height_idx" ON "ValidatorTransaction"("walletId", "height");
CREATE INDEX "ValidatorTransaction_height_idx" ON "ValidatorTransaction"("height");
CREATE INDEX "ValidatorTransaction_validator_idx" ON "ValidatorTransaction"("validator");
CREATE INDEX "ValidatorTransaction_category_idx" ON "ValidatorTransaction"("category");
CREATE UNIQUE INDEX "ValidatorTransaction_hash_walletId_key" ON "ValidatorTransaction"("hash", "walletId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
