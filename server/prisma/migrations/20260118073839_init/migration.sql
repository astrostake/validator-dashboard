-- CreateTable
CREATE TABLE "Chain" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "rpc" TEXT NOT NULL,
    "rest" TEXT NOT NULL,
    "denom" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "Wallet" (
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
    CONSTRAINT "Wallet_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hash" TEXT NOT NULL,
    "height" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "walletId" INTEGER NOT NULL,
    CONSTRAINT "Transaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Chain_name_key" ON "Chain"("name");

-- CreateIndex
CREATE INDEX "Wallet_chainId_idx" ON "Wallet"("chainId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_address_chainId_key" ON "Wallet"("address", "chainId");

-- CreateIndex
CREATE INDEX "Transaction_walletId_height_idx" ON "Transaction"("walletId", "height");

-- CreateIndex
CREATE INDEX "Transaction_height_idx" ON "Transaction"("height");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_hash_walletId_key" ON "Transaction"("hash", "walletId");
