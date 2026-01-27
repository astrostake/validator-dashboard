-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Wallet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "address" TEXT NOT NULL,
    "valAddress" TEXT,
    "label" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "available" REAL NOT NULL DEFAULT 0,
    "staked" REAL NOT NULL DEFAULT 0,
    "rewards" REAL NOT NULL DEFAULT 0,
    "commission" REAL NOT NULL DEFAULT 0,
    "isSyncing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "webhookUrl" TEXT,
    "notifyWalletTx" BOOLEAN NOT NULL DEFAULT false,
    "notifyValidatorTx" BOOLEAN NOT NULL DEFAULT false,
    "notifyOwnDelegations" BOOLEAN NOT NULL DEFAULT false,
    "notifyBalanceChange" BOOLEAN NOT NULL DEFAULT false,
    "balanceThreshold" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "Wallet_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Wallet" ("address", "available", "balanceThreshold", "chainId", "commission", "createdAt", "id", "isSyncing", "label", "notifyBalanceChange", "notifyValidatorTx", "notifyWalletTx", "rewards", "staked", "updatedAt", "valAddress", "webhookUrl") SELECT "address", "available", "balanceThreshold", "chainId", "commission", "createdAt", "id", "isSyncing", "label", "notifyBalanceChange", "notifyValidatorTx", "notifyWalletTx", "rewards", "staked", "updatedAt", "valAddress", "webhookUrl" FROM "Wallet";
DROP TABLE "Wallet";
ALTER TABLE "new_Wallet" RENAME TO "Wallet";
CREATE INDEX "Wallet_chainId_idx" ON "Wallet"("chainId");
CREATE UNIQUE INDEX "Wallet_address_chainId_key" ON "Wallet"("address", "chainId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
