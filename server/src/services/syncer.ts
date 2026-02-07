// src/services/syncer.ts (Enhanced with TxParser for Complete Parsing)

import { PrismaClient, Prisma } from "@prisma/client";
import axios from "axios";
import { fetchWalletBalances, fetchIndexerMode } from "./fetcher";
import { sleep, retryWithBackoff } from "../utils/helpers";
import { logger } from "../utils/logger";
import { sendDiscordNotification } from "./webhook";
import { TxParser } from "./parser";
import { lockManager } from "../utils/lock";

const prisma = new PrismaClient();

const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Helper: Extract all messages including nested ones (e.g., in MsgExec)
 */
function extractAllMessages(messages: any[]): any[] {
  const allMessages: any[] = [];
  
  for (const msg of messages) {
    allMessages.push(msg);
    
    // If this is a MsgExec, extract nested messages
    if (msg["@type"] === "/cosmos.authz.v1beta1.MsgExec" && Array.isArray(msg.msgs)) {
      // Recursively extract nested messages
      const nestedMsgs = extractAllMessages(msg.msgs);
      allMessages.push(...nestedMsgs);
    }
  }
  
  return allMessages;
}

/**
 * Helper: Parse individual message to extract key fields
 * ENHANCED: Use TxParser for better parsing
 */
function parseMessage(msg: any): {
  type: string;
  amount: string | null;
  sender: string | null;
  recipient: string | null;
  delegator: string | null;
  validator: string | null;
  dstValidator: string | null;
} {
  const type = (msg["@type"] || "").split(".").pop() || "Unknown";
  
  if (type.includes("RecvPacket") && msg.packet && msg.packet.data) {
    try {
      const buff = Buffer.from(msg.packet.data, 'base64');
      const decoded = JSON.parse(buff.toString('utf-8'));
      
      // Ambil data asli dari dalam paket
      return {
        type: "IBCRecv",
        amount: (decoded.amount && decoded.denom) ? `${decoded.amount}${decoded.denom}` : null,
        sender: decoded.sender || null,
        recipient: decoded.receiver || null,
        delegator: null,
        validator: null,
        dstValidator: null
      };
    } catch (e) {
      console.error("[Parser] Failed to decode IBC packet:", e);
    }
  }

  // Extract amount
  let amount: string | null = null;
  if (msg.amount) {
    if (Array.isArray(msg.amount)) {
      const coin = msg.amount[0];
      amount = coin ? `${coin.amount}${coin.denom}` : null;
    } else if (msg.amount.amount && msg.amount.denom) {
      amount = `${msg.amount.amount}${msg.amount.denom}`;
    }
  }
  
  // Handle token field
  if (!amount && msg.token && msg.token.amount && msg.token.denom) {
    amount = `${msg.token.amount}${msg.token.denom}`;
  }
  
  // Handle value field
  if (!amount && msg.value && msg.value.amount && msg.value.denom) {
    amount = `${msg.value.amount}${msg.value.denom}`;
  }
  
  // Extract addresses - ENHANCED with more patterns from TxParser
  const sender = msg.from_address || msg.sender || msg.signer || msg.delegator_address || 
                 msg.granter || msg.depositor || msg.voter || msg.proposer || msg.executor || null;
  const recipient = msg.to_address || msg.recipient || msg.receiver || msg.grantee || null;
  const delegator = msg.delegator_address || msg.delegator || msg.voter || msg.depositor || msg.sender || null;
  const validator = msg.validator_address || msg.validator_src_address || msg.source_validator || msg.validator_addr || null;
  const dstValidator = msg.validator_dst_address || msg.destination_validator || null;
  
  return { type, amount, sender, recipient, delegator, validator, dstValidator };
}

/**
 * Helper: Aggregate amounts from multiple messages
 */
function aggregateAmounts(amounts: (string | null)[]): string | null {
  const validAmounts = amounts.filter(a => a !== null) as string[];
  if (validAmounts.length === 0) return null;
  
  // Parse amounts and group by denom
  const denomMap: { [denom: string]: bigint } = {};
  
  for (const amountStr of validAmounts) {
    const match = amountStr.match(/^(\d+)([a-zA-Z]+)$/);
    if (match) {
      const [, amount, denom] = match;
      if (!denomMap[denom]) {
        denomMap[denom] = BigInt(0);
      }
      denomMap[denom] += BigInt(amount);
    }
  }
  
  // Format result
  const results: string[] = [];
  for (const [denom, total] of Object.entries(denomMap)) {
    results.push(`${total.toString()}${denom}`);
  }
  
  if (results.length === 1) {
    return results[0];
  } else if (results.length > 1) {
    return results.join(", ");
  }
  
  return null;
}

/**
 * Smart Crawling with Heartbeat Protection
 */
export async function backfillWalletHistory(walletId: number): Promise<void> {
  const lockKey = `sync:wallet:${walletId}`;
  
  // Try to acquire lock with retry
  const acquired = await lockManager.acquireWithRetry(
    lockKey, 
    "backfillWalletHistory",
    3,
    2000
  );

  if (!acquired) {
    logger.warn(`[INDEXER] ❌ Could not acquire lock for wallet ${walletId}`);
    return;
  }

  try {
    // Double-check wallet still exists (might have been deleted)
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      include: { chain: true },
    });

    if (!wallet) {
      logger.warn(`[INDEXER] ⚠️ Wallet ${walletId} not found, aborting sync`);
      return;
    }

    // CRITICAL: Set syncing flag atomically with heartbeat
    const updated = await prisma.wallet.updateMany({
      where: { 
        id: walletId, 
        isSyncing: false 
      },
      data: { 
        isSyncing: true,
        lastSyncHeartbeat: new Date() // Initial heartbeat
      }
    });

    if (updated.count === 0) {
      logger.info(`[INDEXER] ⏭️ Wallet ${wallet.label} already syncing`);
      return;
    }

    logger.info(`[INDEXER] 🚀 Starting sync for ${wallet.label}...`);

    // Your existing sync logic here...
    const [lastWalletTx, lastValidatorTx] = await Promise.all([
      prisma.walletTransaction.findFirst({ 
        where: { walletId: wallet.id }, 
        orderBy: { height: "desc" } 
      }),
      prisma.validatorTransaction.findFirst({ 
        where: { walletId: wallet.id }, 
        orderBy: { height: "desc" } 
      })
    ]);

    const startHeight = Math.max(lastWalletTx?.height || 0, lastValidatorTx?.height || 0);
    logger.info(`[INDEXER] 📍 Resume from Block ${startHeight}...`);

    const eventQueries = [
      `message.sender='${wallet.address}'`,
      `transfer.recipient='${wallet.address}'`,
    ];

    if (wallet.withdrawalAddress && wallet.withdrawalAddress !== wallet.address) {
      eventQueries.push(`transfer.recipient='${wallet.withdrawalAddress}'`);
    }

    if (wallet.valAddress) {
      eventQueries.push(
        `delegate.validator='${wallet.valAddress}'`,
        `redelegate.destination_validator='${wallet.valAddress}'`,
        `unbond.validator='${wallet.valAddress}'`,
        `redelegate.source_validator='${wallet.valAddress}'`
      );
    }

    for (const queryEvent of eventQueries) {
      // Check if wallet still exists before each query
      const stillExists = await prisma.wallet.findUnique({
        where: { id: walletId },
        select: { id: true }
      });

      if (!stillExists) {
        logger.warn(`[INDEXER] ⚠️ Wallet ${walletId} deleted during sync, aborting`);
        return;
      }

      logger.info(`[INDEXER] 🔍 Query: ${queryEvent}`);
      
      let running = true;
      let iterHeight = startHeight;
      let page = 1; 
      let consecutiveErrors = 0;

      while (running) {
        try {
          const result = await fetchIndexerMode(
            wallet.chain.rest, 
            queryEvent, 
            iterHeight, 
            page
          );
          
          const txs = (Array.isArray(result) ? result : (result as any).txs) || [];
          
          // Reset error counter on success
          consecutiveErrors = 0;
          
          if (txs.length === 0) {
            running = false; 
            break;
          }

          let newTxCount = 0;

          await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            for (const t of txs) {
              if (!t.txhash || !t.height) continue;
              
              const h = Number(t.height);
              const rawTxJson = JSON.stringify(t);
              const currentTokenPrice = wallet.chain.priceUsd || 0;

              const messages = t.tx?.body?.messages || [];
              const allMessages = extractAllMessages(messages);

              // ✅ ENHANCEMENT: Use TxParser for better type detection and data extraction
              // This gives us comprehensive parsing for ALL transaction types
              const txParserResult = TxParser.parse(t);

              // ✅ Aggregate ALL relevant messages for this wallet
              const myWalletMessages: any[] = [];
              for (const msg of allMessages) {
                const parsed = parseMessage(msg);
                const isMyAction = parsed.sender === wallet.address || parsed.delegator === wallet.address;
                const isMyReceipt = parsed.recipient === wallet.address || 
                                   (wallet.withdrawalAddress && parsed.recipient === wallet.withdrawalAddress);
                
                if (isMyAction || isMyReceipt) {
                  myWalletMessages.push(parsed);
                }
              }

              // If we have relevant wallet messages, save as 1 aggregated record
              if (myWalletMessages.length > 0) {
                const exists = await tx.walletTransaction.findUnique({
                  where: { hash_walletId: { hash: t.txhash, walletId: wallet.id } }
                });

                if (!exists) {
                  // Determine direction from first relevant message
                  const firstMsg = myWalletMessages[0];
                  const isMyAction = firstMsg.sender === wallet.address || firstMsg.delegator === wallet.address;
                  const isMyReceipt = firstMsg.recipient === wallet.address || 
                                     (wallet.withdrawalAddress && firstMsg.recipient === wallet.withdrawalAddress);
                  const direction = isMyAction && !isMyReceipt ? 'OUT' : 
                                   (!isMyAction && isMyReceipt ? 'IN' : 'SELF');

                  // Aggregate amounts from all relevant messages
                  const amounts = myWalletMessages.map(m => m.amount);
                  const aggregatedAmount = aggregateAmounts(amounts);

                  // ✅ ENHANCED: Use TxParser type for better accuracy
                  let txType: string;
                  if (myWalletMessages.length === 1) {
                    // Single message - use TxParser type which is more comprehensive
                    txType = txParserResult.type;
                  } else {
                    // Multiple messages - use descriptive batch naming
                    const types = myWalletMessages.map(m => m.type);
                    const uniqueTypes = [...new Set(types)];
                    
                    // Check if this is MsgExec with multiple nested messages
                    if (txParserResult.type.startsWith("Exec/")) {
                      // MsgExec case: "Exec/Delegate(batch:3)"
                      txType = `${txParserResult.type}(batch:${myWalletMessages.length})`;
                    } else if (uniqueTypes.length === 1) {
                      // Same type batch: "Delegate(batch:3)"
                      txType = `${uniqueTypes[0]}(batch:${myWalletMessages.length})`;
                    } else {
                      // Mixed types: "Withdraw+Send(batch:2)"
                      txType = `${uniqueTypes.slice(0, 2).join('+')}(batch:${myWalletMessages.length})`;
                    }
                  }

                  // ✅ ENHANCED: Use TxParser amount if available and better (for withdrawals especially)
                  let finalAmount = aggregatedAmount || "0";
                  const shouldUseParserAmount = 
                    txType.includes("Withdraw") || 
                    txType.includes("IBC") || 
                    txType.includes("RecvPacket");

                  if (shouldUseParserAmount && txParserResult.amount) {
                    // Gunakan hasil TxParser karena dia sudah berhasil decode Base64 packet
                    finalAmount = txParserResult.amount;
                  }

                  // ✅ ENHANCED: Use TxParser recipient if available (better for withdrawals)
                  let finalRecipient = firstMsg.recipient || (isMyReceipt ? wallet.address : null);
                  if (txType.includes("Withdraw") && txParserResult.recipient) {
                    finalRecipient = txParserResult.recipient;
                  }

                  await tx.walletTransaction.create({
                    data: {
                      hash: t.txhash, 
                      height: h, 
                      timestamp: new Date(t.timestamp),
                      type: txType, 
                      amount: finalAmount,
                      sender: firstMsg.sender || (isMyAction ? wallet.address : null),
                      recipient: finalRecipient,
                      direction, 
                      rawTx: rawTxJson, 
                      walletId: wallet.id,
                      priceAtTx: currentTokenPrice
                    }
                  });
                  newTxCount++;
                  
                  if (wallet.notifyWalletTx && wallet.webhookUrl) {
                    const shouldNotify = (finalAmount && finalAmount !== "0") || 
                                        txType.includes('Send') || 
                                        txType.includes('Withdraw');
                    if (shouldNotify) {
                      await sendDiscordNotification(
                        wallet, 
                        t, 
                        txType, 
                        finalAmount, 
                        'wallet'
                      );
                    }
                  }
                }
              }

              // ✅ Aggregate ALL relevant messages for this validator
              if (wallet.valAddress) {
                const myValidatorMessages: any[] = [];
                for (const msg of allMessages) {
                  const parsed = parseMessage(msg);
                  const isRelatedToValidator = 
                    parsed.validator === wallet.valAddress || 
                    parsed.dstValidator === wallet.valAddress;
                  
                  if (isRelatedToValidator) {
                    myValidatorMessages.push(parsed);
                  }
                }

                // If we have relevant validator messages, save as 1 aggregated record
                if (myValidatorMessages.length > 0) {
                  const existsVal = await tx.validatorTransaction.findUnique({
                    where: { hash_walletId: { hash: t.txhash, walletId: wallet.id } }
                  });

                  if (!existsVal) {
                    // Determine category from first relevant message
                    const firstMsg = myValidatorMessages[0];
                    const category = firstMsg.delegator === wallet.address ? 'own' : 'incoming';

                    // Aggregate amounts
                    const amounts = myValidatorMessages.map(m => m.amount);
                    const aggregatedAmount = aggregateAmounts(amounts);

                    // ✅ ENHANCED: Use TxParser type for single message
                    let txType: string;
                    if (myValidatorMessages.length === 1) {
                      txType = txParserResult.type;
                    } else {
                      const types = myValidatorMessages.map(m => m.type);
                      const uniqueTypes = [...new Set(types)];
                      
                      // Check if this is MsgExec with multiple nested messages
                      if (txParserResult.type.startsWith("Exec/")) {
                        // MsgExec case: "Exec/Delegate(batch:3)"
                        txType = `${txParserResult.type}(batch:${myValidatorMessages.length})`;
                      } else if (uniqueTypes.length === 1) {
                        // Same type batch: "Delegate(batch:3)"
                        txType = `${uniqueTypes[0]}(batch:${myValidatorMessages.length})`;
                      } else {
                        // Mixed types: "Delegate+Redelegate(batch:2)"
                        txType = `${uniqueTypes.slice(0, 2).join('+')}(batch:${myValidatorMessages.length})`;
                      }
                    }

                    await tx.validatorTransaction.create({
                      data: {
                        hash: t.txhash, 
                        height: h, 
                        timestamp: new Date(t.timestamp),
                        type: txType, 
                        amount: aggregatedAmount || null,
                        delegator: firstMsg.delegator || null,
                        validator: firstMsg.validator || wallet.valAddress,
                        dstValidator: firstMsg.dstValidator || null,
                        category,
                        rawTx: rawTxJson, 
                        walletId: wallet.id,
                        priceAtTx: currentTokenPrice
                      }
                    });
                    newTxCount++;
                    
                    if (wallet.webhookUrl && category === 'incoming' && wallet.notifyValidatorTx) {
                      await sendDiscordNotification(
                        wallet, 
                        t, 
                        txType, 
                        aggregatedAmount, 
                        'validator-incoming'
                      );
                    }
                  }
                }
              }
            }
          });

          const lastHeight = txs[txs.length - 1]?.height 
            ? Number(txs[txs.length - 1].height) 
            : iterHeight;

          logger.info(
            `   Block ${lastHeight} | Page ${page} | ` +
            `Found ${txs.length} txs, Saved ${newTxCount} new`
          );

          if (lastHeight > iterHeight) {
            iterHeight = lastHeight;
            page = 1; 
          } else {
            page++;
            logger.debug(`   -> Stuck at Block ${lastHeight}, next page...`);
          }

          if (txs.length < 100) running = false;
          await sleep(200);

        } catch (error: unknown) {
          consecutiveErrors++;
          logger.error(`[INDEXER ERROR] Query: ${queryEvent}, Error #${consecutiveErrors}:`, error);
          
          // Better handling for network errors
          if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            
            // 502/503/504 = Server down, wait longer
            if (status && [502, 503, 504].includes(status)) {
              logger.warn(`[INDEXER] ⚠️ Server error ${status}, waiting 10s before retry...`);
              await sleep(10000);
              
              // If server is consistently down (3+ errors), skip this query
              if (consecutiveErrors >= 3) {
                logger.error(`[INDEXER] ❌ Server unreachable after 3 attempts, skipping query: ${queryEvent}`);
                running = false;
              }
              continue;
            }
            
            // 429 = Rate limit
            if (status === 429) {
              logger.warn(`[INDEXER] ⏳ Rate limited, waiting 5s...`);
              await sleep(5000);
              continue;
            }
            
            // 400/500 = Bad query or server error
            if (status && [400, 500, 501].includes(status)) {
              logger.error(`[INDEXER] ❌ Query failed with ${status}, skipping: ${queryEvent}`);
              running = false;
              break;
            }
          }
          
          // Generic error handling
          if (consecutiveErrors >= 5) {
            logger.error(`[INDEXER] ❌ Too many consecutive errors (${consecutiveErrors}), aborting query`);
            running = false;
          } else {
            await sleep(2000);
          }
        }
      }

      // ✅ HEARTBEAT: Update after each query completes
      try {
        await prisma.wallet.update({
          where: { id: walletId },
          data: { lastSyncHeartbeat: new Date() }
        });
        logger.debug(`[HEARTBEAT] Updated for wallet ${walletId}`);
      } catch (e) {
        logger.warn(`[HEARTBEAT] Failed to update for wallet ${walletId}`, e);
      }
    }

  } catch (error) {
    logger.error(`[SYNC FATAL] Wallet ${walletId}:`, error);
  } finally {
    // CRITICAL: Always clean up, even on error
    try {
      await prisma.wallet.updateMany({
        where: { id: walletId },
        data: { isSyncing: false }
      });
    } catch (e) {
      logger.error(`[SYNC] Failed to reset isSyncing flag for wallet ${walletId}`, e);
    }
    
    lockManager.release(lockKey);
    logger.info(`[INDEXER] ✅ Sync finished for wallet ${walletId}`);
  }
}

/**
 * Periodic sync with global coordination and stuck detection
 */
const globalSyncLock = "global:sync";

export async function syncAllWallets(): Promise<void> {
  // Prevent multiple simultaneous global syncs
  if (!await lockManager.acquire(globalSyncLock, 600000, "syncAllWallets")) {
    logger.warn("[SYNC] ⏭️ Global sync already running, skipping");
    return;
  }

  try {
    logger.info("🔄 Running Periodic Sync...");
    
    // ✅ STUCK DETECTION: Reset wallets with stale heartbeat
    const stuckWallets = await prisma.wallet.findMany({
      where: { isSyncing: true },
      select: { 
        id: true, 
        label: true, 
        lastSyncHeartbeat: true,
        updatedAt: true 
      }
    });
    
    const now = new Date();
    
    for (const w of stuckWallets) {
      // Check heartbeat freshness
      const heartbeatAge = w.lastSyncHeartbeat 
        ? now.getTime() - w.lastSyncHeartbeat.getTime()
        : Infinity;
      
      // If heartbeat is stale (>10 minutes), wallet is stuck
      if (heartbeatAge > STUCK_THRESHOLD_MS) {
        logger.warn(
          `[SYNC] 🔧 Resetting stuck wallet ${w.id} (${w.label}). ` +
          `Heartbeat age: ${Math.round(heartbeatAge / 1000 / 60)} minutes`
        );
        
        await prisma.wallet.update({
          where: { id: w.id },
          data: { isSyncing: false }
        });
        
        // Release lock if exists
        const lockKey = `sync:wallet:${w.id}`;
        lockManager.release(lockKey);
      } else {
        logger.debug(
          `[SYNC] ⏳ Wallet ${w.label} syncing actively ` +
          `(heartbeat ${Math.round(heartbeatAge / 1000)}s ago)`
        );
      }
    }
    
    const wallets = await prisma.wallet.findMany({ 
      include: { chain: true } 
    });
    
    for (const wallet of wallets) {
      // Skip if already syncing
      if (wallet.isSyncing) {
        logger.debug(`[SYNC] ⏭️ Skipping ${wallet.label} (already syncing)`);
        continue;
      }
      
      try {
        const oldBalances = {
          available: wallet.available,
          staked: wallet.staked,
          rewards: wallet.rewards,
          commission: wallet.commission
        };

        const balances = await retryWithBackoff(
          () => fetchWalletBalances(
            wallet.address, 
            wallet.valAddress, 
            wallet.chain.rpc,
            wallet.chain.rest, 
            wallet.chain.denom, 
            wallet.chain.decimals
          ), 
          3, 
          2000
        );
        
        try {
          await prisma.wallet.update({
            where: { id: wallet.id },
            data: {
              available: balances.available, 
              staked: balances.staked,
              rewards: balances.rewards, 
              commission: balances.commission,
              updatedAt: new Date(),
            },
          });

          if (wallet.notifyBalanceChange && wallet.webhookUrl && wallet.balanceThreshold > 0) {
            const currentPrice = wallet.chain.priceUsd || 0;
            const totalOld = (oldBalances.available + oldBalances.staked) * currentPrice;
            const totalNew = (balances.available + balances.staked) * currentPrice;
            const change = Math.abs(totalNew - totalOld);

            if (change >= wallet.balanceThreshold) {
              await sendDiscordNotification(
                wallet as any, 
                null, 
                'BalanceChange', 
                null, 
                'balance', 
                {
                  oldTotal: totalOld,
                  newTotal: totalNew,
                  change: change
                }
              );
            }
          }

          // Trigger tx indexing (non-blocking)
          try {
            await backfillWalletHistory(wallet.id);
          } catch (err) {
            logger.error(`[SYNC] TX indexing failed for ${wallet.label}`, err);
          }

        } catch (dbError: any) {
          if (dbError.code === 'P2025') continue;
          throw dbError;
        }
        
      } catch (error: unknown) {
        logger.error(`[SYNC ERROR] ${wallet.label}:`, error);
      }
    }
    
    logger.info("✅ Periodic Sync Complete");
  } finally {
    lockManager.release(globalSyncLock);
  }
}
