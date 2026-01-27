// src/index.ts

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cron from "node-cron";
import path from "path";
import { exec } from "child_process";
import { PrismaClient } from "@prisma/client";

import { CONFIG, INITIAL_CHAINS } from "./config";
import { syncAllWallets } from "./services/syncer";
import { updateTokenPrices } from "./services/price";
import { logger } from "./utils/logger";

// API Routes
import apiRoutes from "./routes/api";
import webhookRoutes from "./routes/webhook";
import validatorRoutes from "./routes/validator";

// ===================================================================
// APP INITIALIZATION
// ===================================================================
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// ===================================================================
// MIDDLEWARE
// ===================================================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../client/")));

// ===================================================================
// API ROUTES
// ===================================================================
app.use("/api", apiRoutes);
app.use("/api", webhookRoutes);
app.use("/api", validatorRoutes);

// ===================================================================
// STATIC FILES & REACT SPA (PRIORITY 2)
// ===================================================================

const CLIENT_BUILD_PATH = path.join(__dirname, "../../client/dist");

app.use(express.static(CLIENT_BUILD_PATH));

app.get(/.*/, (req: Request, res: Response) => {
  res.sendFile(path.join(CLIENT_BUILD_PATH, "index.html"));
});

// ===================================================================
// ERROR HANDLER
// ===================================================================
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ===================================================================
// DATABASE SEED
// ===================================================================
async function initializeDatabase(): Promise<void> {
  try {
    logger.info("🌱 Checking chain config...");
    
    for (const c of INITIAL_CHAINS) {
      const existing = await prisma.chain.findFirst({
        where: { name: c.name }
      });

      if (!existing) {
        await prisma.chain.create({ data: c });
        logger.info(`   ✅ Added new chain: ${c.name}`);
      } else {
        await prisma.chain.update({
          where: { id: existing.id },
          data: {
            rpc: c.rpc,
            rest: c.rest,
            denom: c.denom,
            decimals: c.decimals,
            coingeckoId: c.coingeckoId
          }
        });
        logger.info(`   🔄 Updated chain config: ${c.name}`);
      }
    }
  } catch (error) {
    logger.error("Error during initialization:", error);
  }
}

// ===================================================================
// CRON JOBS
// ===================================================================
let syncInProgress = false;

function setupCronJobs(): void {
  // Cron: Sync wallets (every 5 minutes)
  cron.schedule("*/5 * * * *", () => {
    if (!syncInProgress) {
      logger.info("⏰ Cron: Syncing wallets...");
      syncInProgress = true;
      syncAllWallets()
        .catch((error) => logger.error("Cron sync error:", error))
        .finally(() => { syncInProgress = false; });
    }
  });

  // Cron: Update prices (every 10 minutes)
  cron.schedule("*/10 * * * *", () => {
    updateTokenPrices().catch((error) => {
      logger.error("Cron price update error:", error);
    });
  });

  // Cron: Monitor Validators (every 3 minutes)
  cron.schedule("*/3 * * * *", async () => {
    const { monitorAllValidators } = await import("./services/validatorMonitor");
    monitorAllValidators().catch((error) => {
      logger.error("Validator monitoring error:", error);
    });
  });

  logger.info("⏱️  Cron jobs scheduled");
}

// ===================================================================
// SERVER START
// ===================================================================
app.listen(PORT, async () => {
  logger.info("⚡ Triggering database seed...");
  await initializeDatabase();
  
  const url = `http://localhost:${PORT}`;
  logger.info(`🚀 Validator Monitor running at: ${url}`);
  
  // Initial price update
  updateTokenPrices();

  // Initial sync with delay
  setTimeout(() => {
    logger.info("🔄 Starting initial sync...");
    syncAllWallets().catch((error) => {
      logger.error("Initial sync error:", error);
    });
  }, 5000);

  // Setup cron jobs
  setupCronJobs();

  // Auto-open browser (development mode)
  if (process.env.NODE_ENV !== 'production') {
    const startCommand = process.platform === 'darwin' ? 'open' : 
                        process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${startCommand} ${url}`, (error) => {
      if (error) {
        logger.warn("Failed to open browser automatically:", error);
      }
    });
  }
});