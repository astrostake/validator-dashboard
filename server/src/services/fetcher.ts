// src/services/fetcher.ts

import { StargateClient } from "@cosmjs/stargate";
import axios, { isAxiosError } from "axios";
import { formatToken, normalizeRestUrl } from "../utils/helpers";
import { logger } from "../utils/logger";
import { CONFIG } from "../config";
import type { DashboardStats } from "../types";

/**
 * Fetches all wallet balances (Available, Staked, Rewards, Commission)
 */
export async function fetchWalletBalances(
  address: string,
  valAddress: string | null,
  rpc: string,
  rest: string,
  denom: string,
  decimals: number
): Promise<DashboardStats> {
  const restUrl = normalizeRestUrl(rest);
  let availableBalance = 0;

  // 1. Available Balance (Try RPC first, fallback to REST)
  try {
    const client = await StargateClient.connect(rpc);
    const balance = await client.getBalance(address, denom);
    availableBalance = Number(balance.amount);
    await client.disconnect();
  } catch (rpcError) {
    try {
      const { data } = await axios.get(`${restUrl}/cosmos/bank/v1beta1/balances/${address}`, { timeout: CONFIG.API_TIMEOUT_MS });
      const balToken = data.balances?.find((b: { denom: string }) => b.denom === denom);
      availableBalance = balToken ? Number(balToken.amount) : 0;
    } catch (restError) {
      logger.error(`[FETCHER] Failed to fetch available balance for ${address}`, restError);
    }
  }

  // 2. Staked Balance
  let totalStaked = 0;
  try {
    const { data } = await axios.get(`${restUrl}/cosmos/staking/v1beta1/delegations/${address}`, { timeout: CONFIG.API_TIMEOUT_MS });
    totalStaked = (data.delegation_responses || []).reduce(
      (acc: number, item: any) => acc + Number(item.balance.amount), 0
    );
  } catch (e) {
    logger.debug(`[FETCHER] No delegations found for ${address}`);
  }

  // 3. Rewards
  let totalReward = 0;
  try {
    const { data } = await axios.get(`${restUrl}/cosmos/distribution/v1beta1/delegators/${address}/rewards`, { timeout: CONFIG.API_TIMEOUT_MS });
    const rewardToken = data.total?.find((r: { denom: string }) => r.denom === denom);
    totalReward = rewardToken ? Number(rewardToken.amount) : 0;
  } catch (e) {
    logger.debug(`[FETCHER] No rewards found for ${address}`);
  }

  // 4. Commission (Validator only)
  let commission = 0;
  if (valAddress) {
    try {
      const { data } = await axios.get(`${restUrl}/cosmos/distribution/v1beta1/validators/${valAddress}/commission`, { timeout: CONFIG.API_TIMEOUT_MS });
      const commToken = data.commission?.commission?.find((c: { denom: string }) => c.denom === denom);
      commission = commToken ? Number(commToken.amount) : 0;
    } catch (e) {
      logger.debug(`[FETCHER] No commission found for ${valAddress}`);
    }
  }

  return {
    available: formatToken(availableBalance, decimals),
    staked: formatToken(totalStaked, decimals),
    rewards: formatToken(totalReward, decimals),
    commission: formatToken(commission, decimals),
    totalUsd: 0 // Calculated by caller
  };
}

/**
 * Advanced Fetcher: Supports legacy Query mode and new Events mode for transaction indexing
 */
export async function fetchIndexerMode(
  restUrl: string,
  queryEvent: string,
  minHeight: number,
  page: number = 1
): Promise<{ txs: any[], total: number }> {
  
  const baseApi = normalizeRestUrl(restUrl) + "/cosmos/tx/v1beta1/txs";
  const LIMIT = "100";
  const ORDER = "1"; // ASC

  const cleanUrl = (params: URLSearchParams) => `${baseApi}?${params.toString().replace(/%40/g, "@")}`;

  // Mode 1: Legacy Query Param
  const paramsLegacy = new URLSearchParams({
    "query": `${queryEvent} AND tx.height>=${minHeight}`,
    "pagination.limit": LIMIT,
    "pagination.page": page.toString(),
    "order_by": ORDER
  });

  try {
    const { data } = await axios.get(cleanUrl(paramsLegacy), { timeout: 15000 });
    return {
      txs: mergeTxResponses(data),
      total: Number(data.pagination?.total || 0)
    };
  } catch (error: unknown) {
    // Mode 2: Fallback to Events Param (Required by some nodes/chains)
    if (isAxiosError(error) && [400, 500, 501].includes(error.response?.status || 0)) {
      const paramsEvents = new URLSearchParams();
      paramsEvents.append("events", queryEvent);
      paramsEvents.append("events", `tx.height>=${minHeight}`);
      paramsEvents.append("pagination.limit", LIMIT);
      paramsEvents.append("pagination.page", page.toString());
      paramsEvents.append("order_by", ORDER);

      try {
        const { data } = await axios.get(cleanUrl(paramsEvents), { timeout: 15000 });
        return {
          txs: mergeTxResponses(data),
          total: Number(data.pagination?.total || 0)
        };
      } catch (e2) {
        logger.error(`[FETCHER] All indexer modes failed for query: ${queryEvent}`);
        return { txs: [], total: 0 };
      }
    }
    throw error;
  }
}

/**
 * Normalizes transaction responses where tx body and metadata are separated
 */
function mergeTxResponses(data: any): any[] {
  const txResponses = data.tx_responses || [];
  const txs = data.txs || [];

  return txResponses.map((res: any, index: number) => {
    if (res.tx) return res;
    return { ...res, tx: txs[index] || null };
  });
}

/**
 * Simple helper to check network health
 */
export async function getLatestBlockHeight(rpc: string): Promise<number> {
  let client;
  try {
    client = await StargateClient.connect(rpc);
    return await client.getHeight();
  } catch (error) {
    logger.error(`[FETCHER] Failed to fetch block height from ${rpc}`);
    return 0;
  } finally {
    if (client) await client.disconnect();
  }
}