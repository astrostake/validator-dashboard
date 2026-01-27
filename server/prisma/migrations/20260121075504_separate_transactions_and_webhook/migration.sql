/*
  Warnings:

  - You are about to drop the `Transaction` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `Chain` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Transaction_hash_walletId_key";

-- DropIndex
DROP INDEX "Transaction_height_idx";

-- DropIndex
DROP INDEX "Transaction_walletId_height_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Transaction";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hash" TEXT NOT NULL,
    "height" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" TEXT,
    "sender" TEXT,
    "recipient" TEXT,
    "direction" TEXT,
    "walletId" INTEGER NOT NULL,
    CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ValidatorTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hash" TEXT NOT NULL,
    "height" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" TEXT,
    "delegator" TEXT,
    "validator" TEXT,
    "dstValidator" TEXT,
    "walletId" INTEGER NOT NULL,
    CONSTRAINT "ValidatorTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "notifyBalanceChange" BOOLEAN NOT NULL DEFAULT false,
    "balanceThreshold" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "Wallet_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Wallet" ("address", "available", "chainId", "commission", "createdAt", "id", "isSyncing", "label", "rewards", "staked", "updatedAt", "valAddress") SELECT "address", "available", "chainId", "commission", "createdAt", "id", "isSyncing", "label", "rewards", "staked", "updatedAt", "valAddress" FROM "Wallet";
DROP TABLE "Wallet";
ALTER TABLE "new_Wallet" RENAME TO "Wallet";
CREATE INDEX "Wallet_chainId_idx" ON "Wallet"("chainId");
CREATE UNIQUE INDEX "Wallet_address_chainId_key" ON "Wallet"("address", "chainId");
CREATE TABLE "new_Chain" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "rpc" TEXT NOT NULL,
    "rest" TEXT NOT NULL,
    "denom" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "coingeckoId" TEXT DEFAULT '',
    "priceUsd" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Chain" ("decimals", "denom", "id", "name", "rest", "rpc") SELECT "decimals", "denom", "id", "name", "rest", "rpc" FROM "Chain";
DROP TABLE "Chain";
ALTER TABLE "new_Chain" RENAME TO "Chain";
CREATE UNIQUE INDEX "Chain_name_key" ON "Chain"("name");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_height_idx" ON "WalletTransaction"("walletId", "height");

-- CreateIndex
CREATE INDEX "WalletTransaction_height_idx" ON "WalletTransaction"("height");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_hash_walletId_key" ON "WalletTransaction"("hash", "walletId");

-- CreateIndex
CREATE INDEX "ValidatorTransaction_walletId_height_idx" ON "ValidatorTransaction"("walletId", "height");

-- CreateIndex
CREATE INDEX "ValidatorTransaction_height_idx" ON "ValidatorTransaction"("height");

-- CreateIndex
CREATE INDEX "ValidatorTransaction_validator_idx" ON "ValidatorTransaction"("validator");

-- CreateIndex
CREATE UNIQUE INDEX "ValidatorTransaction_hash_walletId_key" ON "ValidatorTransaction"("hash", "walletId");
