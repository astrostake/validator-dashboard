import dotenv from "dotenv";
import { ChainConfig } from "./types";

dotenv.config();

export const CONFIG = {
  // Server
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || "development",
  
  // Database
  DATABASE_URL: process.env.DATABASE_URL,
  
  // Logic & Thresholds
  DEFAULT_MISSED_BLOCKS_THRESHOLD: Number(process.env.MISSED_BLOCKS_THRESHOLD) || 10,
  LOCK_TIMEOUT_MS: 300000, // 5 minutes
  API_TIMEOUT_MS: 10000,   // 10 seconds

  NOTIFICATIONS: {
    DISCORD_USERNAME: process.env.DISCORD_BOT_NAME || 'AstroStake Dashboard',
    DISCORD_AVATAR: process.env.DISCORD_BOT_AVATAR || 'https://astrostake.xyz/logos/astrostake_secondary_colorwhite.png',
  },

};

export const CHAIN_ASSETS: Record<string, string> = {
  "Lumera": "https://astrostake.xyz/logos/projects/lumera-protocol.png",
  "Lava": "https://astrostake.xyz/logos/projects/lava.png",
  "Epix": "https://astrostake.xyz/logos/projects/epix.png",
  "Hippo": "https://astrostake.xyz/logos/projects/hippo-protocol.png",
  "Cysic": "https://astrostake.xyz/logos/projects/cysic.png",
  "Lumen": "https://astrostake.xyz/logos/projects/lumen.png",
};

export const INITIAL_CHAINS: ChainConfig[] = [
  {
    name: "Lumera",
    rpc: "https://lumera-rpc.linknode.org",
    rest: "https://lumera-api.linknode.org",
    denom: "ulume",
    decimals: 6,
  },
  {
    name: "Lava",
    rpc: "http://144.76.111.245:26657",
    rest: "http://144.76.111.245:1317",
    denom: "ulava",
    coingeckoId: "lava-network",
    decimals: 6,
  },
  {
    name: "Epix",
    rpc: "https://rpc.epix.zone",
    rest: "https://api.epix.zone",
    denom: "aepix",
    decimals: 18,
  },
  {
    name: "Hippo",
    rpc: "https://rpc.hippo-protocol.com",
    rest: "https://api.hippo-protocol.com",
    denom: "ahp",
    coingeckoId: 'hippo-protocol',
    decimals: 18
  },
  {
    name: "Cysic",
    rpc: "https://rpc.cysic.xyz",
    rest: "https://rest.cysic.xyz",
    denom: "CGT",
    coingeckoId: 'cysic',
    decimals: 18
  },
  {
    name: "Lumen",
    rpc: "https://lumen-rpc.linknode.org",
    rest: "https://lumen-api.linknode.org",
    denom: "ulmn",
    decimals: 6
  }
];