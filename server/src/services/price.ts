import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function updateTokenPrices() {
  console.log("💰 Updating token prices...");
  
  try {
    const chains = await prisma.chain.findMany({
      where: {
        coingeckoId: { not: "" }
      }
    });

    if (chains.length === 0) return;

    // SOLUSI: Tambahkan ': any' agar TypeScript tidak error
    const ids = chains
      .map((c: any) => c.coingeckoId)
      .filter((id: any) => id !== null && id !== "")
      .join(",");
    
    if (!ids) return;

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
    
    const res = await axios.get(url);
    const prices = res.data;

    for (const chain of chains) {
      if (chain.coingeckoId && prices[chain.coingeckoId]) {
        const newPrice = prices[chain.coingeckoId].usd;
        
        await prisma.chain.update({
          where: { id: chain.id },
          data: { priceUsd: newPrice }
        });
        
        console.log(`   💲 ${chain.name}: $${newPrice}`);
      }
    }
  } catch (error: any) {
    console.error("Failed to update prices:", error.message);
  }
}