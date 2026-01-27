// src/services/priceBackfill.ts

import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Config API Key
const CG_API_KEY = process.env.COINGECKO_API_KEY || ""; 
const CG_API_URL = "https://api.coingecko.com/api/v3";

function getHeaders() {
  const headers: any = { 'Accept': 'application/json' };
  if (CG_API_KEY && CG_API_KEY !== "CG-DEMO-KEY-ANDA") {
    if (CG_API_KEY.startsWith('CG-')) {
      headers['x-cg-demo-api-key'] = CG_API_KEY;
    } else {
      headers['x-cg-pro-api-key'] = CG_API_KEY;
    }
  }
  return headers;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getGranularPrice(coinId: string, timestamp: Date): Promise<number | null> {
  const targetTimeSec = Math.floor(timestamp.getTime() / 1000);
  const from = targetTimeSec - 43200; 
  const to = targetTimeSec + 43200;

  const url = `${CG_API_URL}/coins/${coinId}/market_chart/range`;
  
  try {
    const res = await axios.get(url, {
      params: { vs_currency: 'usd', from, to },
      headers: getHeaders(),
      timeout: 10000
    });

    const prices: [number, number][] = res.data.prices;
    if (!prices || prices.length === 0) return null;

    const txMs = timestamp.getTime();
    let closestPrice = 0;
    let minDiff = Infinity;

    for (const [timeMs, price] of prices) {
      const diff = Math.abs(timeMs - txMs);
      if (diff < minDiff) {
        minDiff = diff;
        closestPrice = price;
      }
    }
    return closestPrice;

  } catch (error: any) {
    if (error.response?.status === 429) throw error;
    return null;
  }
}

export async function backfillHistoricalPrices() {
  console.log("🔥 Starting FORCE Price Backfill (Overwriting existing prices)...");
  
  const chains = await prisma.chain.findMany();

  for (const chain of chains) {
    if (!chain.coingeckoId) {
      console.log(`⚠️ Skipping ${chain.name} (No CoinGecko ID)`);
      continue;
    }

    // --- PERUBAHAN UTAMA DI SINI ---
    // Hapus filter { priceAtTx: 0 } agar SEMUA transaksi diambil.
    // Kita akan update ulang semuanya dengan harga history yang akurat.
    
    console.log(`🔗 Checking Chain: ${chain.name}...`);
    
    const walletTxs = await prisma.walletTransaction.findMany({
      where: { wallet: { chainId: chain.id } }, // Ambil SEMUA
      select: { id: true, timestamp: true }
    });
    
    const valTxs = await prisma.validatorTransaction.findMany({
      where: { wallet: { chainId: chain.id } }, // Ambil SEMUA
      select: { id: true, timestamp: true }
    });

    const allTxs = [
        ...walletTxs.map(t => ({ ...t, type: 'wallet' })), 
        ...valTxs.map(t => ({ ...t, type: 'validator' }))
    ];

    if (allTxs.length === 0) {
        console.log(`   ℹ️ No transactions found for ${chain.name}`);
        continue;
    }

    console.log(`   🚀 Force Updating ${allTxs.length} transactions for ${chain.name}...`);
    let updated = 0;

    for (const tx of allTxs) {
      try {
        const price = await getGranularPrice(chain.coingeckoId, tx.timestamp);
        
        if (price !== null && price > 0) {
          if (tx.type === 'wallet') {
            await prisma.walletTransaction.update({ where: { id: tx.id }, data: { priceAtTx: price } });
          } else {
            await prisma.validatorTransaction.update({ where: { id: tx.id }, data: { priceAtTx: price } });
          }
          updated++;
          process.stdout.write("."); 
        } else {
          process.stdout.write("x"); 
        }
        
        await sleep(2500); 

      } catch (error: any) {
        if (error.response?.status === 429) {
          console.log("\n   ⚠️ Rate Limit! Pausing 60s...");
          await sleep(60000);
        } else {
          process.stdout.write("E");
        }
      }
    }
    console.log(`\n   ✨ Finished ${chain.name}: Overwritten ${updated}/${allTxs.length}`);
  }

  console.log("\n✅ Force Backfill Completed!");
}

/**
 * Backfill prices for a specific wallet.
 * @param walletId ID of the wallet
 * @param onlyMissing If true, only fetch prices for transactions with priceAtTx = 0 (Optimized for Fill Gaps)
 */
export async function backfillWalletPrices(walletId: number, onlyMissing: boolean = false) {
  const modeLabel = onlyMissing ? "MISSING ONLY" : "FORCE ALL";
  console.log(`💲 Starting Price Backfill for Wallet ID: ${walletId} [Mode: ${modeLabel}]...`);

  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { chain: true }
  });

  if (!wallet) return;

  const chain = wallet.chain;
  if (!chain.coingeckoId) return;

  // --- [LOGIKA FILTER BARU] ---
  const whereCondition: any = { walletId: wallet.id };
  
  // Jika onlyMissing = true, hanya ambil yang harganya 0 (belum di-fetch)
  if (onlyMissing) {
    whereCondition.priceAtTx = 0; 
  }

  // Gunakan whereCondition
  const walletTxs = await prisma.walletTransaction.findMany({
    where: whereCondition,
    select: { id: true, timestamp: true }
  });

  const valTxs = await prisma.validatorTransaction.findMany({
    where: whereCondition,
    select: { id: true, timestamp: true }
  });
  // ----------------------------------------

  const allTxs = [
    ...walletTxs.map(t => ({ ...t, type: 'wallet' })),
    ...valTxs.map(t => ({ ...t, type: 'validator' }))
  ];

  if (allTxs.length === 0) {
    console.log(`ℹ️ No transactions to update for this wallet (Mode: ${modeLabel}).`);
    return;
  }

  console.log(`🚀 Found ${allTxs.length} transactions needing price update...`);

  let updated = 0;
  for (const tx of allTxs) {
    try {
      const price = await getGranularPrice(chain.coingeckoId, tx.timestamp);

      if (price !== null && price > 0) {
        if (tx.type === 'wallet') {
          await prisma.walletTransaction.update({ where: { id: tx.id }, data: { priceAtTx: price } });
        } else {
          await prisma.validatorTransaction.update({ where: { id: tx.id }, data: { priceAtTx: price } });
        }
        updated++;
        process.stdout.write(".");
      } else {
        process.stdout.write("x");
      }
      await sleep(2500); // Rate limit protection
    } catch (error) {
      process.stdout.write("E");
    }
  }
  console.log(`\n✅ Finished Price Backfill: Updated ${updated}/${allTxs.length}`);
}