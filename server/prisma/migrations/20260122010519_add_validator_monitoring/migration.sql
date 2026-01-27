-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Wallet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "address" TEXT NOT NULL,
    "valAddress" TEXT,
    "withdrawalAddress" TEXT,
    "consensusAddress" TEXT,
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
    "notifyMissedBlocks" BOOLEAN NOT NULL DEFAULT false,
    "missedBlocksThreshold" INTEGER NOT NULL DEFAULT 10,
    "notifyGovernance" BOOLEAN NOT NULL DEFAULT false,
    "lastMissedBlocksCount" INTEGER,
    "lastJailedStatus" BOOLEAN NOT NULL DEFAULT false,
    "lastUptimeCheck" DATETIME,
    "lastCheckedProposalId" INTEGER NOT NULL DEFAULT 0,
    "lastGovernanceCheck" DATETIME,
    CONSTRAINT "Wallet_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Wallet" ("address", "available", "balanceThreshold", "chainId", "commission", "createdAt", "id", "isSyncing", "label", "notifyBalanceChange", "notifyOwnDelegations", "notifyValidatorTx", "notifyWalletTx", "rewards", "staked", "updatedAt", "valAddress", "webhookUrl", "withdrawalAddress") SELECT "address", "available", "balanceThreshold", "chainId", "commission", "createdAt", "id", "isSyncing", "label", "notifyBalanceChange", "notifyOwnDelegations", "notifyValidatorTx", "notifyWalletTx", "rewards", "staked", "updatedAt", "valAddress", "webhookUrl", "withdrawalAddress" FROM "Wallet";
DROP TABLE "Wallet";
ALTER TABLE "new_Wallet" RENAME TO "Wallet";
CREATE INDEX "Wallet_chainId_idx" ON "Wallet"("chainId");
CREATE INDEX "Wallet_valAddress_idx" ON "Wallet"("valAddress");
CREATE UNIQUE INDEX "Wallet_address_chainId_key" ON "Wallet"("address", "chainId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
