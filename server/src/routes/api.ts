// src/routes/api.ts - Complete Enhanced Response Structure

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { TxParser } from "../services/parser";
import { syncAllWallets, backfillWalletHistory } from "../services/syncer";
import { updateTokenPrices } from "../services/price";
import { backfillHistoricalPrices, backfillWalletPrices } from "../services/priceBackfill";
import { getGlobalGovernance } from "../services/validatorMonitor";
import { lockManager } from "../utils/lock";
import { logger } from "../utils/logger";
import { calculateUsdValue } from "../utils/helpers";

const router = Router();
const prisma = new PrismaClient();

// ===================================================================
// RESPONSE FORMATTERS - Professional API Response Structure
// ===================================================================

/**
 * Format wallet response with proper categorization
 */
function formatWalletResponse(wallet: any) {
  const isValidator = !!wallet.valAddress;
  const priceUsd = wallet.chain?.priceUsd || 0;
  
  // Calculate totals
  const totalBalance = wallet.available + wallet.staked;
  const totalValueUsd = totalBalance * priceUsd;
  const totalRewardsValueUsd = (wallet.rewards + wallet.commission) * priceUsd;

  const response: any = {
    id: wallet.id,
    label: wallet.label,
    address: wallet.address,
    type: isValidator ? "validator" : "regular",
    
    chain: {
      id: wallet.chain.id,
      name: wallet.chain.name,
      denom: wallet.chain.denom,
      decimals: wallet.chain.decimals,
      priceUsd: wallet.chain.priceUsd
    },
    
    // Balance Information
    balances: {
      available: wallet.available,
      staked: wallet.staked,
      rewards: wallet.rewards,
      total: totalBalance,
      valuation: {
        totalUsd: totalValueUsd,
        rewardsUsd: totalRewardsValueUsd
      }
    },
    
    // Monitoring Status
    status: {
      isSyncing: wallet.isSyncing,
      lastSyncHeartbeat: wallet.lastSyncHeartbeat,
      lastUpdate: wallet.updatedAt
    },
    
    // Webhook Configuration
    notifications: {
      webhookConfigured: !!wallet.webhookUrl,
      settings: {
        walletTransactions: wallet.notifyWalletTx,
        balanceChanges: {
          enabled: wallet.notifyBalanceChange,
          thresholdUsd: wallet.balanceThreshold
        }
      }
    },
    
    metadata: {
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt
    }
  };

  if (isValidator) {
    
    const rawTokens = parseFloat(wallet.tokens || '0');
    const decimals = wallet.chain?.decimals || 6;
    const adjustedVotingPower = rawTokens / Math.pow(10, decimals);

    response.validator = {
      addresses: {
        operator: wallet.valAddress,
        consensus: wallet.consensusAddress,
        withdrawal: wallet.withdrawalAddress
      },
      
      status: {
        jailed: wallet.jailed || false,
        status: wallet.status || 'UNBONDED',
        tokens: wallet.tokens || '0',
        votingPower: rawTokens,
        votingPowerCount: adjustedVotingPower
      },

      earnings: {
        commission: wallet.commission,
        commissionUsd: wallet.commission * priceUsd
      },
      
      // Validator monitoring settings
      monitoring: {
        missedBlocks: {
          enabled: wallet.notifyMissedBlocks,
          threshold: wallet.missedBlocksThreshold,
          cooldownMinutes: wallet.missedBlocksCooldown,
          status: {
            currentCount: wallet.lastMissedBlocksCount,
            lastAlert: wallet.lastMissedBlocksAlert,
            lastCheck: wallet.lastUptimeCheck,
            notifyOnRecovery: wallet.notifyRecovery
          }
        },
        
        governance: {
          enabled: wallet.notifyGovernance,
          tracking: {
            lastCheckedProposalId: wallet.lastCheckedProposalId,
            lastFinishedProposalId: wallet.lastFinishedProposalId,
            lastCheck: wallet.lastGovernanceCheck
          }
        }
      },
      
      // Validator-specific notifications
      notifications: {
        incomingDelegations: wallet.notifyValidatorTx,
        ownDelegations: wallet.notifyOwnDelegations,
        missedBlocksAlerts: wallet.notifyMissedBlocks,
        governanceAlerts: wallet.notifyGovernance
      }
    };
  }

  return response;
}

/**
 * Format chain list response
 */
function formatChainResponse(chain: any) {
  return {
    id: chain.id,
    name: chain.name,
    network: {
      rpc: chain.rpc,
      rest: chain.rest
    },
    token: {
      denom: chain.denom,
      decimals: chain.decimals,
      coingeckoId: chain.coingeckoId || null,
      priceUsd: chain.priceUsd
    },
    metadata: {
      createdAt: chain.createdAt,
      updatedAt: chain.updatedAt
    }
  };
}

/**
 * Format dashboard response with proper categorization
 */
function formatDashboardResponse(wallets: any[]) {
  const validatorWallets = wallets.filter(w => w.valAddress);
  const regularWallets = wallets.filter(w => !w.valAddress);
  
  // Calculate totals
  const totals = wallets.reduce((acc, w) => {
    const priceUsd = w.chain?.priceUsd || 0;
    return {
      availableUsd: acc.availableUsd + (w.available * priceUsd),
      stakedUsd: acc.stakedUsd + (w.staked * priceUsd),
      rewardsUsd: acc.rewardsUsd + (w.rewards * priceUsd),
      commissionUsd: acc.commissionUsd + (w.commission * priceUsd),
      totalBalanceUsd: acc.totalBalanceUsd + ((w.available + w.staked) * priceUsd)
    };
  }, {
    availableUsd: 0,
    stakedUsd: 0,
    rewardsUsd: 0,
    commissionUsd: 0,
    totalBalanceUsd: 0
  });

  return {
    summary: {
      walletCount: {
        total: wallets.length,
        validators: validatorWallets.length,
        regular: regularWallets.length
      },
      portfolioValue: {
        total: totals.totalBalanceUsd,
        available: totals.availableUsd,
        staked: totals.stakedUsd,
        pendingRewards: totals.rewardsUsd,
        validatorCommission: totals.commissionUsd
      },
      lastUpdate: new Date()
    },
    
    wallets: {
      validators: validatorWallets.map(formatWalletResponse),
      regular: regularWallets.map(formatWalletResponse)
    }
  };
}

/**
 * Format transaction response
 */
function formatTransactionResponse(tx: any, category: string) {
  const baseResponse: any = {
    id: tx.id,
    hash: tx.hash,
    height: tx.height,
    type: tx.type,
    timestamp: tx.timestamp,
    category: category,
    
    wallet: {
      id: tx.walletId,
      label: tx.wallet?.label
    }
  };

  // Add transaction-specific fields based on category
  if (category === 'wallet') {
    baseResponse.transaction = {
      amount: tx.amount,
      sender: tx.sender,
      recipient: tx.recipient,
      direction: tx.direction
    };
  } else {
    baseResponse.transaction = {
      amount: tx.amount,
      delegator: tx.delegator,
      validator: tx.validator,
      destinationValidator: tx.dstValidator,
      subcategory: tx.category // 'own' or 'incoming'
    };
  }

  // Add price analysis if available
  if (tx.priceAtTx && tx.wallet?.chain) {
    const chain = tx.wallet.chain;
    const currentPrice = chain.priceUsd || 0;
    const historicalValue = calculateUsdValue(tx.amount, chain.decimals, tx.priceAtTx);
    const currentValue = calculateUsdValue(tx.amount, chain.decimals, currentPrice);
    const pnl = currentValue - historicalValue;
    
    baseResponse.valuation = {
      token: {
        symbol: chain.denom.substring(1).toUpperCase(),
        priceAtTransaction: tx.priceAtTx,
        priceCurrent: currentPrice
      },
      usdValue: {
        atTransaction: historicalValue,
        current: currentValue
      },
      profitLoss: {
        amountUsd: pnl,
        percentage: historicalValue > 0 ? parseFloat(((pnl / historicalValue) * 100).toFixed(2)) : 0,
        percentageFormatted: historicalValue > 0 ? ((pnl / historicalValue) * 100).toFixed(2) + "%" : "0%",
        isProfit: pnl >= 0
      }
    };
  }

  return baseResponse;
}

/**
 * Format transaction detail with full raw data
 */
function formatTransactionDetail(tx: any, category: string) {
  const formatted = formatTransactionResponse(tx, category);
  
  // Add raw transaction data
  if (tx.rawTx) {
    formatted.raw = {
      available: true,
      data: JSON.parse(tx.rawTx)
    };
  }
  
  return formatted;
}

// ===================================================================
// CHAINS API
// ===================================================================
router.get("/chains", async (req: Request, res: Response) => {
  try {
    const chains = await prisma.chain.findMany();
    
    res.json({
      success: true,
      data: chains.map(formatChainResponse),
      metadata: {
        total: chains.length,
        timestamp: new Date()
      }
    });
  } catch (error) {
    logger.error("Error fetching chains:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to fetch chains",
        code: "FETCH_CHAINS_ERROR"
      }
    });
  }
});

// ===================================================================
// WALLETS - CREATE
// ===================================================================
router.post("/wallets", async (req: Request, res: Response) => {
  try {
    let { address, valAddress, label, chainId, withdrawalAddress } = req.body;

    if (!address || !label || !chainId) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Missing required fields: address, label, chainId",
          code: "VALIDATION_ERROR",
          fields: {
            address: !address ? "required" : "valid",
            label: !label ? "required" : "valid",
            chainId: !chainId ? "required" : "valid"
          }
        }
      });
    }

    address = address.trim();
    if (valAddress) valAddress = valAddress.trim();
    if (withdrawalAddress) withdrawalAddress = withdrawalAddress.trim();

    const lockKey = `create:wallet:${address}:${chainId}`;
    const acquired = await lockManager.acquire(lockKey, 60000, "createWallet");
    
    if (!acquired) {
      return res.status(409).json({
        success: false,
        error: {
          message: "Another process is creating this wallet. Please wait.",
          code: "RESOURCE_LOCKED"
        }
      });
    }

    try {
      const existing = await prisma.wallet.findUnique({
        where: {
          address_chainId: {
            address,
            chainId: Number(chainId),
          },
        },
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          error: {
            message: "Wallet already exists for this chain",
            code: "DUPLICATE_WALLET"
          }
        });
      }

      const wallet = await prisma.wallet.create({
        data: {
          address,
          valAddress: valAddress || null,
          withdrawalAddress: withdrawalAddress || null,
          label,
          chainId: Number(chainId),
          isSyncing: false,
        },
        include: { chain: true },
      });

      res.json({
        success: true,
        message: "Wallet created successfully. History sync starting in background...",
        data: formatWalletResponse(wallet)
      });

      setTimeout(() => {
        lockManager.release(lockKey);
        backfillWalletHistory(wallet.id).catch(err => 
          logger.error(`Background backfill error for wallet ${wallet.id}:`, err)
        );
      }, 1000);

    } catch (error) {
      lockManager.release(lockKey);
      throw error;
    }

  } catch (error) {
    logger.error("Error adding wallet:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to add wallet",
        code: "CREATE_WALLET_ERROR"
      }
    });
  }
});

// ===================================================================
// WALLETS - DELETE
// ===================================================================
router.delete("/wallet/:id", async (req: Request, res: Response) => {
  try {
    const walletId = Number(req.params.id);
    const lockKey = `delete:wallet:${walletId}`;
    
    const acquired = await lockManager.acquire(lockKey, 60000, "deleteWallet");
    if (!acquired) {
      return res.status(409).json({
        success: false,
        error: {
          message: "Wallet operation in progress. Please try again later.",
          code: "RESOURCE_LOCKED"
        }
      });
    }

    try {
      const wallet = await prisma.wallet.findUnique({
        where: { id: walletId },
        select: { isSyncing: true, label: true, address: true }
      });

      if (!wallet) {
        return res.status(404).json({ 
          success: false,
          error: {
            message: "Wallet not found",
            code: "WALLET_NOT_FOUND"
          }
        });
      }

      if (wallet.isSyncing) {
        logger.info(`[DELETE] ⏳ Waiting for sync to complete for wallet ${walletId}...`);
        
        const syncLockKey = `sync:wallet:${walletId}`;
        const released = await lockManager.waitForRelease(syncLockKey, 30000);
        
        if (!released) {
          return res.status(409).json({
            success: false,
            error: {
              message: "Wallet is syncing and cannot be deleted. Please try again later.",
              code: "WALLET_SYNCING"
            }
          });
        }
      }

      await prisma.$transaction([
        prisma.walletTransaction.deleteMany({ where: { walletId } }),
        prisma.validatorTransaction.deleteMany({ where: { walletId } }),
        prisma.wallet.delete({ where: { id: walletId } }),
      ]);

      logger.info(`[DELETE] ✅ Wallet ${walletId} (${wallet.label}) deleted successfully`);
      
      res.json({ 
        success: true,
        message: "Wallet deleted successfully",
        data: {
          id: walletId,
          label: wallet.label,
          address: wallet.address
        }
      });

    } finally {
      lockManager.release(lockKey);
    }

  } catch (error: any) {
    logger.error("Error deleting wallet:", error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false,
        error: {
          message: "Wallet not found",
          code: "WALLET_NOT_FOUND"
        }
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to delete wallet",
        code: "DELETE_WALLET_ERROR"
      }
    });
  }
});

// ===================================================================
// WALLETS - UPDATE (PATCH)
// ===================================================================
router.patch("/wallet/:id", async (req: Request, res: Response) => {
  try {
    const walletId = Number(req.params.id);
    const { label, valAddress, withdrawalAddress } = req.body;

    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId }
    });

    if (!wallet) {
      return res.status(404).json({ 
        success: false, 
        error: { message: "Wallet not found", code: "WALLET_NOT_FOUND" } 
      });
    }

    const isLinkingValidator = valAddress && !wallet.valAddress;

    // Update Database
    const updated = await prisma.wallet.update({
      where: { id: walletId },
      data: {
        ...(label && { label }),
        ...(valAddress !== undefined && { valAddress: valAddress || null }),
        ...(withdrawalAddress !== undefined && { withdrawalAddress: withdrawalAddress || null })
      },
      include: { chain: true }
    });

    if (isLinkingValidator) {
      // Trigger background job (fire & forget)
      (async () => {
        try {
          // Auto-fetch consensus address
          const { fetchValidatorInfo } = await import("../services/validatorMonitor");
          const valInfo = await fetchValidatorInfo(updated.chain.rest, updated.valAddress!, updated.chain.decimals);
          
          if (valInfo?.consensusAddress) {
            await prisma.wallet.update({
              where: { id: walletId },
              data: { consensusAddress: valInfo.consensusAddress }
            });
          }
          
          // Trigger resync
          const { backfillWalletHistory } = await import("../services/syncer");
          await backfillWalletHistory(walletId);
        } catch (e) {
          logger.error(`Auto-link validator failed for ${walletId}`, e);
        }
      })();
    }

    res.json({
      success: true,
      message: "Wallet updated successfully",
      data: formatWalletResponse(updated)
    });

  } catch (error) {
    logger.error("Error updating wallet:", error);
    res.status(500).json({ 
      success: false, 
      error: { message: "Failed to update wallet", code: "UPDATE_ERROR" } 
    });
  }
});

// ===================================================================
// DASHBOARD
// ===================================================================
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const wallets = await prisma.wallet.findMany({
      include: { chain: true },
      orderBy: { chainId: "asc" },
    });

    res.json({
      success: true,
      data: formatDashboardResponse(wallets)
    });
  } catch (error) {
    logger.error("Error fetching dashboard:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to fetch dashboard data",
        code: "FETCH_DASHBOARD_ERROR"
      }
    });
  }
});

// ===================================================================
// SYNC OPERATIONS
// ===================================================================
router.post("/wallet/:id/resync", async (req: Request, res: Response) => {
  try {
    const walletId = Number(req.params.id);
    const lockKey = `resync:wallet:${walletId}`;

    const acquired = await lockManager.acquire(lockKey, 300000, "resyncWallet");
    if (!acquired) {
      return res.status(409).json({
        success: false,
        error: {
          message: "Wallet operation in progress. Cannot start resync.",
          code: "RESOURCE_LOCKED"
        }
      });
    }

    try {
      const wallet = await prisma.wallet.findUnique({
        where: { id: walletId },
        select: { id: true, label: true, isSyncing: true }
      });

      if (!wallet) {
        return res.status(404).json({ 
          success: false,
          error: {
            message: "Wallet not found",
            code: "WALLET_NOT_FOUND"
          }
        });
      }

      if (wallet.isSyncing) {
        const syncLockKey = `sync:wallet:${walletId}`;
        logger.info(`[RESYNC] ⏳ Waiting for existing sync to complete...`);
        
        const released = await lockManager.waitForRelease(syncLockKey, 60000);
        if (!released) {
          return res.status(409).json({
            success: false,
            error: {
              message: "Wallet is currently syncing. Please try again later.",
              code: "WALLET_SYNCING"
            }
          });
        }
      }

      await prisma.$transaction([
        prisma.walletTransaction.deleteMany({ where: { walletId } }),
        prisma.validatorTransaction.deleteMany({ where: { walletId } }),
        prisma.wallet.update({
          where: { id: walletId },
          data: { isSyncing: false }
        })
      ]);

      logger.info(`[RESYNC] 🗑️ History cleared for wallet ${walletId}`);

      res.json({ 
        success: true,
        message: "History cleared. Starting full resync...",
        data: {
          walletId,
          label: wallet.label,
          status: "resync_started"
        }
      });

      setTimeout(() => {
        lockManager.release(lockKey);
        backfillWalletHistory(walletId).catch(err => 
          logger.error(`Resync error for wallet ${walletId}:`, err)
        );
      }, 1000);

    } catch (error) {
      lockManager.release(lockKey);
      throw error;
    }

  } catch (error) {
    logger.error("Error starting resync:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to start resync",
        code: "RESYNC_ERROR"
      }
    });
  }
});

router.post("/sync", async (req: Request, res: Response) => {
  res.json({ 
    success: true,
    message: "Manual sync started",
    data: {
      status: "sync_initiated",
      timestamp: new Date()
    }
  });
  
  try {
    await Promise.all([
      syncAllWallets(),
      updateTokenPrices()
    ]);
    logger.info("✅ Manual sync completed");
  } catch (error) {
    logger.error("Manual sync error:", error);
  }
});

// reparse
router.post("/wallet/:id/reparse", async (req: Request, res: Response) => {
  try {
    const walletId = Number(req.params.id);
    const lockKey = `reparse:wallet:${walletId}`;
    
    const acquired = await lockManager.acquire(lockKey, 300000, "reparseWallet");
    if (!acquired) {
      return res.status(409).json({
        success: false,
        error: {
          message: "Re-parsing already in progress for this wallet",
          code: "RESOURCE_LOCKED"
        }
      });
    }
    
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      select: { id: true, label: true }
    });

    if (!wallet) {
      lockManager.release(lockKey);
      return res.status(404).json({ 
        success: false,
        error: {
          message: "Wallet not found",
          code: "WALLET_NOT_FOUND"
        }
      });
    }

    res.json({ 
      success: true,
      message: "Re-parsing started in background...",
      data: {
        walletId,
        label: wallet.label,
        status: "reparse_started"
      }
    });

    (async () => {
      try {
        let updated = 0;

        const walletTxs = await prisma.walletTransaction.findMany({
          where: { walletId, rawTx: { not: null } },
          take: 1000
        });

        for (const tx of walletTxs) {
          const stillExists = await prisma.wallet.findUnique({
            where: { id: walletId },
            select: { id: true }
          });

          if (!stillExists) {
            logger.warn(`[REPARSE] Wallet ${walletId} deleted, aborting`);
            break;
          }

          const rawData = JSON.parse(tx.rawTx!);
          const parsed = TxParser.parse(rawData);

          await prisma.walletTransaction.update({
            where: { id: tx.id },
            data: {
              type: parsed.type,
              amount: parsed.amount,
              sender: parsed.sender,
              recipient: parsed.recipient
            }
          });
          updated++;
        }

        const validatorTxs = await prisma.validatorTransaction.findMany({
          where: { walletId, rawTx: { not: null } },
          take: 1000
        });

        for (const tx of validatorTxs) {
          const stillExists = await prisma.wallet.findUnique({
            where: { id: walletId },
            select: { id: true }
          });

          if (!stillExists) {
            logger.warn(`[REPARSE] Wallet ${walletId} deleted, aborting`);
            break;
          }

          const rawData = JSON.parse(tx.rawTx!);
          const parsed = TxParser.parse(rawData);

          await prisma.validatorTransaction.update({
            where: { id: tx.id },
            data: {
              type: parsed.type,
              amount: parsed.amount,
              delegator: parsed.delegator,
              validator: parsed.validator,
              dstValidator: parsed.dstValidator
            }
          });
          updated++;
        }

        logger.info(`✅ Re-parse complete for wallet ${walletId}: ${updated} transactions`);
      } catch (error) {
        logger.error(`❌ Re-parse failed for wallet ${walletId}:`, error);
      } finally {
        lockManager.release(lockKey);
      }
    })();

  } catch (error) {
    logger.error("Error starting re-parse:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to start re-parse",
        code: "REPARSE_ERROR"
      }
    });
  }
});

// Add this to your api.ts file

// ===================================================================
// BULK REPARSE - Reparse All Wallets
// ===================================================================
router.post("/reparse-all", async (req: Request, res: Response) => {
  try {
    const lockKey = "global:reparse-all";
    
    const acquired = await lockManager.acquire(lockKey, 3600000, "reparseAll");
    if (!acquired) {
      return res.status(409).json({
        success: false,
        error: {
          message: "Bulk reparse already in progress",
          code: "RESOURCE_LOCKED"
        }
      });
    }

    // Get all wallets
    const wallets = await prisma.wallet.findMany({
      select: { id: true, label: true }
    });

    res.json({ 
      success: true,
      message: `Bulk reparse started for ${wallets.length} wallets`,
      data: {
        totalWallets: wallets.length,
        status: "reparse_started",
        wallets: wallets.map(w => ({ id: w.id, label: w.label }))
      }
    });

    // Process in background
    (async () => {
      try {
        let totalUpdated = 0;
        const results: any[] = [];

        for (const wallet of wallets) {
          // Check if wallet still exists
          const stillExists = await prisma.wallet.findUnique({
            where: { id: wallet.id },
            select: { id: true }
          });

          if (!stillExists) {
            logger.warn(`[BULK REPARSE] Wallet ${wallet.id} deleted, skipping`);
            continue;
          }

          try {
            logger.info(`[BULK REPARSE] Processing wallet ${wallet.id} (${wallet.label})...`);
            
            let walletUpdated = 0;

            // Reparse Wallet Transactions
            const walletTxs = await prisma.walletTransaction.findMany({
              where: { walletId: wallet.id, rawTx: { not: null } }
            });

            for (const tx of walletTxs) {
              try {
                const rawData = JSON.parse(tx.rawTx!);
                const parsed = TxParser.parse(rawData);

                await prisma.walletTransaction.update({
                  where: { id: tx.id },
                  data: {
                    type: parsed.type,
                    amount: parsed.amount,
                    sender: parsed.sender,
                    recipient: parsed.recipient
                  }
                });
                walletUpdated++;
              } catch (e) {
                logger.error(`[BULK REPARSE] Failed to parse wallet tx ${tx.hash}:`, e);
              }
            }

            // Reparse Validator Transactions
            const validatorTxs = await prisma.validatorTransaction.findMany({
              where: { walletId: wallet.id, rawTx: { not: null } }
            });

            for (const tx of validatorTxs) {
              try {
                const rawData = JSON.parse(tx.rawTx!);
                const parsed = TxParser.parse(rawData);

                await prisma.validatorTransaction.update({
                  where: { id: tx.id },
                  data: {
                    type: parsed.type,
                    amount: parsed.amount,
                    delegator: parsed.delegator,
                    validator: parsed.validator,
                    dstValidator: parsed.dstValidator
                  }
                });
                walletUpdated++;
              } catch (e) {
                logger.error(`[BULK REPARSE] Failed to parse validator tx ${tx.hash}:`, e);
              }
            }

            totalUpdated += walletUpdated;
            results.push({
              walletId: wallet.id,
              label: wallet.label,
              transactionsUpdated: walletUpdated,
              status: "completed"
            });

            logger.info(`[BULK REPARSE] ✅ Wallet ${wallet.id}: ${walletUpdated} transactions reparsed`);
            
            // Small delay between wallets to prevent DB overload
            await new Promise(resolve => setTimeout(resolve, 500));

          } catch (error) {
            logger.error(`[BULK REPARSE] ❌ Failed for wallet ${wallet.id}:`, error);
            results.push({
              walletId: wallet.id,
              label: wallet.label,
              status: "failed",
              error: error instanceof Error ? error.message : "Unknown error"
            });
          }
        }

        logger.info(`[BULK REPARSE] ✅ COMPLETED - Total ${totalUpdated} transactions reparsed across ${wallets.length} wallets`);
        
        // Optional: Store results somewhere for later retrieval
        // Could be stored in a separate table or logged to a file

      } catch (error) {
        logger.error("[BULK REPARSE] ❌ Fatal error:", error);
      } finally {
        lockManager.release(lockKey);
      }
    })();

  } catch (error) {
    logger.error("Error starting bulk reparse:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to start bulk reparse",
        code: "BULK_REPARSE_ERROR"
      }
    });
  }
});

// ===================================================================
// REPARSE STATUS - Check bulk reparse progress
// ===================================================================
router.get("/reparse-status", async (req: Request, res: Response) => {
  try {
    const lockKey = "global:reparse-all";
    const isLocked = lockManager.isLocked(lockKey);
    
    if (!isLocked) {
      return res.json({
        success: true,
        data: {
          status: "idle",
          message: "No bulk reparse in progress"
        }
      });
    }

    // Count transactions being reparsed
    const totalWalletTxs = await prisma.walletTransaction.count({
      where: { rawTx: { not: null } }
    });
    
    const totalValidatorTxs = await prisma.validatorTransaction.count({
      where: { rawTx: { not: null } }
    });

    res.json({
      success: true,
      data: {
        status: "in_progress",
        message: "Bulk reparse is currently running",
        estimated: {
          transactionsToProcess: totalWalletTxs + totalValidatorTxs,
          note: "Check logs for detailed progress"
        }
      }
    });

  } catch (error) {
    logger.error("Error checking reparse status:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to check reparse status",
        code: "STATUS_CHECK_ERROR"
      }
    });
  }
});

// ===================================================================
// PRICE BACKFILL
// ===================================================================
router.post("/backfill-prices", async (req: Request, res: Response) => {
  const lockKey = "global:price-backfill";
  
  const acquired = await lockManager.acquire(lockKey, 3600000, "priceBackfill");
  if (!acquired) {
    return res.status(429).json({
      success: false,
      error: {
        message: "Price backfill already in progress",
        code: "BACKFILL_IN_PROGRESS"
      }
    });
  }

  res.json({ 
    success: true,
    message: "Price backfill started in background...",
    data: {
      status: "backfill_started",
      timestamp: new Date()
    }
  });
  
  try {
    await backfillHistoricalPrices();
  } catch (error) {
    logger.error("Backfill price error:", error);
  } finally {
    lockManager.release(lockKey);
  }
});

router.post("/wallet/:id/backfill-prices", async (req, res) => {
  const walletId = parseInt(req.params.id);
  
  if (isNaN(walletId)) {
    return res.status(400).json({ 
      success: false,
      error: {
        message: "Invalid wallet ID",
        code: "VALIDATION_ERROR"
      }
    });
  }

  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    select: { id: true, label: true }
  });

  if (!wallet) {
    return res.status(404).json({
      success: false,
      error: {
        message: "Wallet not found",
        code: "WALLET_NOT_FOUND"
      }
    });
  }

  backfillWalletPrices(walletId).catch(err => 
    logger.error(`Error backfilling prices for wallet ${walletId}:`, err)
  );

  res.json({ 
    success: true,
    message: "Price update started in background",
    data: {
      walletId,
      label: wallet.label,
      status: "price_backfill_started"
    }
  });
});

// ===================================================================
// TRANSACTIONS
// ===================================================================
router.get("/wallet/:id/transactions", async (req: Request, res: Response) => {
  try {
    const walletId = Number(req.params.id);
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const category = req.query.category as string; 
    const subType = req.query.type as string;

    // Verify wallet exists
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      select: { id: true, label: true, valAddress: true }
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Wallet not found",
          code: "WALLET_NOT_FOUND"
        }
      });
    }

    let transactions: any[] = [];
    let total = 0;

    if (category === 'wallet') {
      let whereCondition: any = { walletId };

      const stakingKeywords = [
        'Delegate', 'Undelegate', 'Redelegate', 
        'Withdraw', 'Commission', 'Vote', 'Proposal', 
        'Unjail', 'CreateValidator', 'EditValidator'
      ];

      if (subType === 'staking') {
        whereCondition.OR = stakingKeywords.map(k => ({ type: { contains: k } }));
      } 
      else if (subType === 'general') {
        whereCondition.AND = stakingKeywords.map(k => ({ type: { not: { contains: k } } }));
      }

      transactions = await prisma.walletTransaction.findMany({
        where: whereCondition,
        orderBy: { height: "desc" },
        take: limit,
        skip: offset,
        include: {
          wallet: {
            include: { chain: true }
          }
        }
      });
      
      total = await prisma.walletTransaction.count({ where: whereCondition });
    } 
    else {
// 1. Inisialisasi kondisi dasar (hanya walletId dulu)
      let whereCondition: any = { walletId };
      
      // 2. Modifikasi whereCondition sesuai kategori
      if (category === 'delegate') {
        // FIX: Gunakan AND di level ROOT object 'whereCondition'
        // Ini memberitahu Prisma: Cari yang type berisi 'Delegate' DAN BUKAN 'Undelegate' DAN BUKAN 'Redelegate'
        whereCondition.AND = [
          { type: { contains: 'Delegate' } },
          { type: { not: { contains: 'Undelegate' } } },
          { type: { not: { contains: 'Redelegate' } } }
        ];
      } 
      else if (category === 'undelegate') {
        whereCondition.type = { contains: 'Undelegate' };
      } 
      else if (category === 'redelegate') {
        whereCondition.type = { contains: 'Redelegate' }; 
      }
      
      // Jika category == 'all' atau 'validator', whereCondition tetap { walletId },
      // sehingga akan mengambil semua data tanpa filter type.

      // 3. Eksekusi Query
      transactions = await prisma.validatorTransaction.findMany({
        where: whereCondition,
        orderBy: { height: "desc" },
        take: limit,
        skip: offset,
        include: {
          wallet: {
            include: { chain: true }
          }
        }
      });
      
      total = await prisma.validatorTransaction.count({ where: whereCondition });
    }

    const breakdown = {
      wallet: await prisma.walletTransaction.count({ where: { walletId } }),
      staking: await prisma.validatorTransaction.count({ where: { walletId, category: 'own' } }),
      validator: await prisma.validatorTransaction.count({ where: { walletId, category: 'incoming' } })
    };

    res.json({
      success: true,
      data: {
        wallet: {
          id: walletId,
          label: wallet.label
        },
        transactions: transactions.map(tx => 
          formatTransactionResponse(tx, category === 'wallet' ? 'wallet' : 'validator')
        ),
        pagination: {
          total,
          limit,
          offset,
          page: Math.floor(offset / limit) + 1,
          totalPages: Math.ceil(total / limit),
          hasMore: (offset + limit) < total,
          hasPrevious: offset > 0
        },
        breakdown
      }
    });

  } catch (error) {
    logger.error("Error fetching transactions:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to fetch transactions",
        code: "FETCH_TRANSACTIONS_ERROR"
      }
    });
  }
});

router.get("/transaction/:hash", async (req, res) => {
  try {
    const { hash } = req.params;
    const walletId = Number(req.query.walletId);

    if (!hash) {
      return res.status(400).json({ 
        success: false,
        error: {
          message: "Transaction hash is required",
          code: "VALIDATION_ERROR"
        }
      });
    }

    const walletTx = await prisma.walletTransaction.findFirst({
      where: { hash, ...(walletId && { walletId }) },
      include: { wallet: { include: { chain: true } } }
    });

    if (walletTx) {
      return res.json({
        success: true,
        data: formatTransactionDetail(walletTx, 'wallet')
      });
    }

    const validatorTx = await prisma.validatorTransaction.findFirst({
      where: { hash, ...(walletId && { walletId }) },
      include: { wallet: { include: { chain: true } } }
    });

    if (validatorTx) {
      const cat = validatorTx.category === 'own' ? 'staking' : 'validator';
      return res.json({
        success: true,
        data: formatTransactionDetail(validatorTx, cat)
      });
    }

    res.status(404).json({ 
      success: false,
      error: {
        message: "Transaction not found",
        code: "TRANSACTION_NOT_FOUND"
      }
    });

  } catch (error) {
    logger.error("Error fetching transaction detail:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to fetch transaction detail",
        code: "FETCH_TRANSACTION_ERROR"
      }
    });
  }
});

router.get("/transaction/:hash/raw", async (req, res) => {
  try {
    const { hash } = req.params;

    if (!hash) {
      return res.status(400).json({ 
        success: false,
        error: {
          message: "Transaction hash is required",
          code: "VALIDATION_ERROR"
        }
      });
    }

    const walletTx = await prisma.walletTransaction.findFirst({
      where: { hash },
      select: { rawTx: true, hash: true, height: true }
    });

    if (walletTx?.rawTx) {
      return res.json({
        success: true,
        data: {
          hash: walletTx.hash,
          height: walletTx.height,
          raw: JSON.parse(walletTx.rawTx)
        }
      });
    }

    const validatorTx = await prisma.validatorTransaction.findFirst({
      where: { hash },
      select: { rawTx: true, hash: true, height: true }
    });

    if (validatorTx?.rawTx) {
      return res.json({
        success: true,
        data: {
          hash: validatorTx.hash,
          height: validatorTx.height,
          raw: JSON.parse(validatorTx.rawTx)
        }
      });
    }

    res.status(404).json({ 
      success: false,
      error: {
        message: "Raw transaction data not found",
        code: "RAW_TX_NOT_FOUND"
      }
    });

  } catch (error) {
    logger.error("Error fetching raw transaction:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to fetch raw transaction",
        code: "FETCH_RAW_TX_ERROR"
      }
    });
  }
});

// ===================================================================
// GOVERNANCE
// ===================================================================
router.get("/governance/all", async (req, res) => {
  try {
    const proposals = await getGlobalGovernance();
    
    res.json({
      success: true,
      data: {
        proposals: proposals.map(p => ({
          id: p.proposalId,
          title: p.title,
          description: p.description,
          status: p.status,
          type: p.type,
          voting: {
            endTime: p.votingEndTime,
            myVote: p.myVote
          },
          chain: {
            name: p.chainName
          },
          wallet: {
            label: p.walletLabel
          }
        })),
        metadata: {
          total: proposals.length,
          timestamp: new Date()
        }
      }
    });
  } catch (error) {
    logger.error("Global Gov Error:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to fetch global governance",
        code: "FETCH_GOVERNANCE_ERROR"
      }
    });
  }
});

// ===================================================================
// HEALTH & TESTING
// ===================================================================
router.get("/health", async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    const walletCount = await prisma.wallet.count();
    const validatorCount = await prisma.wallet.count({
      where: { valAddress: { not: null } }
    });
    const walletTxCount = await prisma.walletTransaction.count();
    const validatorTxCount = await prisma.validatorTransaction.count();
    const syncingCount = await prisma.wallet.count({
      where: { isSyncing: true }
    });
    
    res.json({ 
      success: true,
      data: {
        status: "healthy",
        services: {
          database: "connected",
          api: "operational"
        },
        statistics: {
          wallets: {
            total: walletCount,
            validators: validatorCount,
            regular: walletCount - validatorCount,
            syncing: syncingCount
          },
          transactions: {
            wallet: walletTxCount,
            validator: validatorTxCount,
            total: walletTxCount + validatorTxCount
          }
        },
        timestamp: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: {
        message: "Database connection failed",
        code: "DATABASE_ERROR"
      },
      timestamp: new Date()
    });
  }
});

router.get("/test-rpc/:chainId", async (req: Request, res: Response) => {
  try {
    const chainId = Number(req.params.chainId);
    const chain = await prisma.chain.findUnique({
      where: { id: chainId }
    });
    
    if (!chain) {
      return res.status(404).json({ 
        success: false,
        error: {
          message: "Chain not found",
          code: "CHAIN_NOT_FOUND"
        }
      });
    }
    
    const startTime = Date.now();
    
    let rpcStatus = "failed";
    let rpcLatency = 0;
    let rpcError = null;
    try {
      const { StargateClient } = await import("@cosmjs/stargate");
      const client = await StargateClient.connect(chain.rpc);
      await client.getHeight();
      await client.disconnect();
      rpcLatency = Date.now() - startTime;
      rpcStatus = "ok";
    } catch (e: any) {
      rpcLatency = Date.now() - startTime;
      rpcError = e.message;
    }
    
    let restStatus = "failed";
    let restLatency = 0;
    let restError = null;
    const restStartTime = Date.now();
    try {
      const axios = (await import("axios")).default;
      await axios.get(`${chain.rest}/cosmos/base/tendermint/v1beta1/node_info`, {
        timeout: 10000
      });
      restLatency = Date.now() - restStartTime;
      restStatus = "ok";
    } catch (e: any) {
      restLatency = Date.now() - restStartTime;
      restError = e.message;
    }
    
    const allHealthy = rpcStatus === "ok" && restStatus === "ok";
    
    res.json({
      success: true,
      data: {
        chain: {
          id: chain.id,
          name: chain.name
        },
        endpoints: {
          rpc: {
            url: chain.rpc,
            status: rpcStatus,
            latency: rpcLatency,
            error: rpcError
          },
          rest: {
            url: chain.rest,
            status: restStatus,
            latency: restLatency,
            error: restError
          }
        },
        assessment: {
          overall: allHealthy ? "healthy" : "degraded",
          recommendation: allHealthy 
            ? "Both endpoints are working fine" 
            : "Check connectivity or try alternative endpoints"
        },
        timestamp: new Date()
      }
    });
    
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: {
        message: error.message || "Failed to test RPC endpoints",
        code: "RPC_TEST_ERROR"
      }
    });
  }
});

export default router;