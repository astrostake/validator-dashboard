import { PrismaClient, Wallet } from "@prisma/client";
import axios, { isAxiosError } from "axios";
import { logger } from "../utils/logger";
import { sleep } from "../utils/helpers";
import { normalizeRestUrl } from "../utils/helpers"; // Make sure to add this to helpers.ts
import { sendDiscordNotification } from "./webhook";
import { CONFIG } from "../config";

const prisma = new PrismaClient();

// --- Interfaces ---

interface ValidatorInfo {
  operatorAddress: string;
  consensusAddress: string;
  moniker: string;
  jailed: boolean;
  status: string;
  tokens: string;
  votingPower: number;
}

interface SigningInfo {
  missedBlocksCounter: string;
  jailedUntil: string;
}

interface Proposal {
  proposalId: string;
  title: string;
  description: string;
  status: string;
  votingEndTime: string;
  finalResult?: string;
}

// --- Helpers ---

async function decodeConsensusPubkey(base64Pubkey: string, prefix: string = 'cosmos'): Promise<string | null> {
  try {
    // Dynamic import to avoid ESM/CJS conflicts
    const { fromBase64, toBech32 } = await import('@cosmjs/encoding');
    const { sha256 } = await import('@cosmjs/crypto');
    
    const pubkeyBytes = fromBase64(base64Pubkey);
    const hash = sha256(pubkeyBytes);
    const addressBytes = hash.slice(0, 20);
    
    return toBech32(`${prefix}valcons`, addressBytes);
  } catch (error) {
    logger.error('[DECODE PUBKEY] Failed:', error);
    return null;
  }
}

function extractChainPrefix(valAddress: string): string {
  const match = valAddress.match(/^(.+?)valoper/);
  return match?.[1] || 'cosmos';
}

function extractTitle(p: any): string {
  // Cek 1: Field standar V1
  if (p.title && p.title.trim() !== "") return p.title;
  
  // Cek 2: Field standar V1Beta1 (Legacy)
  if (p.content && p.content.title) return p.content.title;
  
  // Cek 3: Kadang judul masuk ke Summary
  if (p.summary && p.summary.length < 100) return p.summary; 

  // Cek 4: Struktur V1 Messages (SDK 0.46+)
  if (p.messages && Array.isArray(p.messages)) {
    for (const msg of p.messages) {
      if (msg.content && msg.content.title) return msg.content.title;
    }
  }

  // Cek 5: Metadata
  if (p.metadata) {
    try {
      const meta = JSON.parse(p.metadata);
      if (meta.title) return meta.title;
    } catch (e) {
      if (p.metadata.length > 5 && p.metadata.length < 100) return p.metadata;
    }
  }

  return "Unknown Proposal"; 
}

function formatTallyResult(tally: any): string {
  if (!tally) return 'Yes: 0% | No: 0%';
  
  // 1. Normalisasi Field (V1 pakai '_count', V1Beta1 polosan)
  // Konversi ke BigInt agar aman untuk angka token yang sangat besar
  const yes = BigInt(tally.yes_count || tally.yes || 0);
  const no = BigInt(tally.no_count || tally.no || 0);
  const abstain = BigInt(tally.abstain_count || tally.abstain || 0);
  const veto = BigInt(tally.no_with_veto_count || tally.no_with_veto || 0);
  
  const total = yes + no + abstain + veto;
  
  // Jika total 0, berarti belum ada vote atau data kosong
  if (total === BigInt(0)) return 'Yes: 0% | No: 0%';

  // 2. Hitung Persentase
  // Trik: Kali 1000 dulu sebelum dibagi, biar bisa dapet 1 desimal tanpa float error
  const pYes = (Number((yes * 1000n) / total) / 10).toFixed(1);
  const pNo = (Number((no * 1000n) / total) / 10).toFixed(1);
  const pVeto = (Number((veto * 1000n) / total) / 10).toFixed(1);
  // Abstain biasanya jarang ditampilkan di ringkasan, tapi bisa ditambah kalau mau
  
  return `👍 Yes: ${pYes}% | 👎 No: ${pNo}% | 🚫 Veto: ${pVeto}%`;
}

// --- Fetchers ---

export async function fetchValidatorInfo(
  rest: string,
  valAddress: string,
  decimals: number
): Promise<ValidatorInfo | null> {
  try {
    const restUrl = normalizeRestUrl(rest);
    const url = `${restUrl}/cosmos/staking/v1beta1/validators/${valAddress}`;
    
    const { data } = await axios.get(url, { timeout: CONFIG.API_TIMEOUT_MS });
    const val = data.validator;
    
    let consensusAddr = "";
    if (val.consensus_pubkey?.key) {
      const chainPrefix = extractChainPrefix(valAddress);
      consensusAddr = await decodeConsensusPubkey(val.consensus_pubkey.key, chainPrefix) 
                      || val.consensus_pubkey.key;
    }

    const divisor = Math.pow(10, decimals);
    const votingPower = parseInt(val.tokens) / divisor;

    return {
      operatorAddress: val.operator_address,
      consensusAddress: consensusAddr,
      moniker: val.description?.moniker || "Unknown",
      jailed: val.jailed,
      status: val.status,
      tokens: val.tokens,
      votingPower,
    };
  } catch (error) {
    logger.error(`[VALIDATOR INFO] Failed to fetch ${valAddress}`, error);
    return null;
  }
}

export async function fetchSigningInfo(
  rest: string,
  consensusAddress: string
): Promise<SigningInfo | null> {
  try {
    const restUrl = normalizeRestUrl(rest);
    const url = `${restUrl}/cosmos/slashing/v1beta1/signing_infos/${consensusAddress}`;
    
    const { data } = await axios.get(url, { timeout: CONFIG.API_TIMEOUT_MS });
    const info = data.val_signing_info;

    return {
      missedBlocksCounter: info.missed_blocks_counter,
      jailedUntil: info.jailed_until,
    };
  } catch (error) {
    // 404 is common if validator hasn't signed recently
    if (isAxiosError(error) && error.response?.status === 404) {
      logger.warn(`[SIGNING INFO] Address not found: ${consensusAddress}`);
    } else {
      logger.error(`[SIGNING INFO] Failed to fetch ${consensusAddress}`, error);
    }
    return null;
  }
}

async function fetchLatestProposalOnChain(rest: string): Promise<number> {
  const restUrl = normalizeRestUrl(rest);
  const params = { 'pagination.limit': 1, 'pagination.reverse': true };
  
  try {
    // Try V1
    const { data } = await axios.get(`${restUrl}/cosmos/gov/v1/proposals`, { params, timeout: 5000 });
    if (data.proposals?.length > 0) return parseInt(data.proposals[0].id);
  } catch {}

  try {
    // Try V1Beta1
    const { data } = await axios.get(`${restUrl}/cosmos/gov/v1beta1/proposals`, { params, timeout: 5000 });
    if (data.proposals?.length > 0) return parseInt(data.proposals[0].proposal_id);
  } catch (error) {
    logger.error(`[INIT GOV] Failed to fetch latest proposal`, error);
  }
  
  return 0;
}

async function fetchLatestFinishedProposalId(rest: string): Promise<number> {
  const restUrl = normalizeRestUrl(rest);
  const params = { 
    'proposal_status': 3, 
    'pagination.limit': 1, 
    'pagination.reverse': true 
  };
  
  try {
    const { data } = await axios.get(`${restUrl}/cosmos/gov/v1/proposals`, { params, timeout: 5000 });
    if (data.proposals?.length > 0) return parseInt(data.proposals[0].id);
  } catch {}

  try {
    const { data } = await axios.get(`${restUrl}/cosmos/gov/v1beta1/proposals`, { params, timeout: 5000 });
    if (data.proposals?.length > 0) return parseInt(data.proposals[0].proposal_id);
  } catch (error) {
    logger.error(`[INIT GOV] Failed to fetch latest finished proposal`, error);
  }
  
  return 0;
}

async function fetchActiveProposals(rest: string, lastId: number): Promise<Proposal[]> {
  const restUrl = normalizeRestUrl(rest);
  const params = { 
    'proposal_status': 2, // VOTING_PERIOD
    'pagination.limit': 50, 
    'pagination.reverse': true 
  };

  let rawProposals: any[] = [];
  let version = 'v1';

  try {
    const { data } = await axios.get(`${restUrl}/cosmos/gov/v1/proposals`, { params });
    rawProposals = data.proposals || [];
  } catch {
    try {
      version = 'v1beta1';
      const { data } = await axios.get(`${restUrl}/cosmos/gov/v1beta1/proposals`, { params });
      rawProposals = data.proposals || [];
    } catch (error) {
      logger.error(`[PROPOSALS] Failed to fetch proposals`, error);
      return [];
    }
  }

  // Normalize and Filter
  return rawProposals
    .map(p => {
        const id = version === 'v1' ? p.id : p.proposal_id;
        // FIX: Gunakan extractTitle disini!
        const title = extractTitle(p) !== "Unknown Proposal" ? extractTitle(p) : `Proposal #${id}`;
        
        return {
          proposalId: id,
          title: title,
          description: version === 'v1' ? p.summary : p.content?.description,
          status: p.status,
          votingEndTime: p.voting_end_time,
        };
    })
    .filter(p => parseInt(p.proposalId) > lastId)
    .sort((a, b) => parseInt(a.proposalId) - parseInt(b.proposalId));
}

async function fetchFinishedProposals(rest: string, lastFinishedId: number): Promise<Proposal[]> {
  const restUrl = normalizeRestUrl(rest);
  const statuses = [3, 4, 5]; // PASSED, REJECTED, FAILED
  let allFinished: any[] = [];
  let version = 'v1';

  const fetchByStatus = async (status: number, ver: 'v1' | 'v1beta1') => {
    const params = { 
      'proposal_status': status, 
      'pagination.limit': 5,
      'pagination.reverse': true 
    };
    try {
      const { data } = await axios.get(`${restUrl}/cosmos/gov/${ver}/proposals`, { params, timeout: 5000 });
      return data.proposals || [];
    } catch { return []; }
  };

  try {
    for (const status of statuses) {
      const res = await fetchByStatus(status, 'v1');
      allFinished = [...allFinished, ...res];
    }
  } catch {
    version = 'v1beta1';
    for (const status of statuses) {
      const res = await fetchByStatus(status, 'v1beta1');
      allFinished = [...allFinished, ...res];
    }
  }

  return allFinished
    .map(p => {
      const id = version === 'v1' ? p.id : p.proposal_id;
      // use extractTitle here!
      const title = extractTitle(p) !== "Unknown Proposal" ? extractTitle(p) : `Proposal #${id}`;
      
      // NEW: Get Tally Result
      const tally = p.final_tally_result;
      const resultStr = formatTallyResult(tally);

      return {
        proposalId: id,
        title: title,
        description: "",
        status: p.status,
        votingEndTime: p.voting_end_time,
        finalResult: resultStr
      };
    })
    .filter(p => parseInt(p.proposalId) > lastFinishedId)
    .sort((a, b) => parseInt(a.proposalId) - parseInt(b.proposalId));
}

// --- Core Logic ---

export async function checkValidatorUptime(walletId: number): Promise<void> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { chain: true }
  });

  if (!wallet?.valAddress) return;

  try {
    logger.info(`[UPTIME] Checking ${wallet.label}...`);

    const valInfo = await fetchValidatorInfo(wallet.chain.rest, wallet.valAddress, wallet.chain.decimals);
    if (!valInfo) return;

    // Save consensus address if missing
    if (!wallet.consensusAddress && valInfo.consensusAddress) {
       await prisma.wallet.update({
         where: { id: walletId },
         data: { consensusAddress: valInfo.consensusAddress }
       });
       wallet.consensusAddress = valInfo.consensusAddress;
    }

    if (!wallet.consensusAddress) {
      logger.warn(`[UPTIME] No consensus address for ${wallet.label}. Skipping signing check.`);
      return;
    }

    const signingInfo = await fetchSigningInfo(wallet.chain.rest, wallet.consensusAddress);
    if (!signingInfo) return;

    const missedBlocks = parseInt(signingInfo.missedBlocksCounter);
    const threshold = wallet.missedBlocksThreshold || CONFIG.DEFAULT_MISSED_BLOCKS_THRESHOLD;
    const lastMissed = wallet.lastMissedBlocksCount || 0;
    
    logger.info(`[UPTIME] 📊 ${wallet.label}: Missed ${missedBlocks}/${threshold} | Jailed: ${valInfo.jailed}`);

    // ===================================================================
    // COOLDOWN SYSTEM
    // ===================================================================
    const now = new Date();
    const cooldownMs = wallet.missedBlocksCooldown * 60 * 1000; // minutes to ms
    const timeSinceLastAlert = wallet.lastMissedBlocksAlert 
      ? now.getTime() - wallet.lastMissedBlocksAlert.getTime()
      : Infinity;
    
    const cooldownActive = timeSinceLastAlert < cooldownMs;
    const commonUpdateData = {
        tokens: valInfo.tokens,
        status: valInfo.status,
        lastJailedStatus: valInfo.jailed
    };

    // ===================================================================
    // 1. JAILED ALERT (Follows cooldown)
    // ===================================================================
    if (valInfo.jailed && !wallet.lastJailedStatus) {
      // Check cooldown for jailed alert too
      if (!cooldownActive && wallet.notifyMissedBlocks && wallet.webhookUrl) {
        await sendDiscordNotification(
          wallet as Wallet & { chain: any }, 
          null, 
          'ValidatorJailed', 
          null, 
          'validator-alert', 
          {
            alertType: 'jailed',
            message: `⚠️ Validator **${valInfo.moniker}** has been JAILED!`,
            missedBlocks,
            jailedUntil: signingInfo.jailedUntil
          }
        );
        
        // Update alert timestamp
        await prisma.wallet.update({
          where: { id: walletId },
          data: { 
            ...commonUpdateData,
            lastJailedStatus: true,
            lastMissedBlocksAlert: now
          }
        });
      } else {
        // Just update status without sending alert (cooldown active)
        await prisma.wallet.update({
          where: { id: walletId },
          data: { 
            ...commonUpdateData,
            lastJailedStatus: true 
          }
        });
        
        if (cooldownActive) {
          logger.debug(
            `[UPTIME] 🔕 Jailed alert suppressed (cooldown: ${Math.round(timeSinceLastAlert / 1000)}s / ${wallet.missedBlocksCooldown}m)`
          );
        }
      }
    } 
    else if (!valInfo.jailed && wallet.lastJailedStatus) {
      logger.info(`[UPTIME] ✅ ${wallet.label} is now unjailed`);
      
      // ✅ RECOVERY NOTIFICATION
      if (wallet.notifyRecovery && wallet.notifyMissedBlocks && wallet.webhookUrl) {
        await sendDiscordNotification(
          wallet as Wallet & { chain: any }, 
          null, 
          'ValidatorRecovered', 
          null, 
          'validator-alert', 
          {
            alertType: 'recovery',
            message: `✅ Validator **${valInfo.moniker}** has been UNJAILED and is now active!`,
            missedBlocks,
            wasJailed: true
          }
        );
      }
      
      await prisma.wallet.update({
        where: { id: walletId },
        data: { 
            ...commonUpdateData,
            lastJailedStatus: false 
        }
      });
    }

    // ===================================================================
    // 2. MISSED BLOCKS ALERT (With Cooldown)
    // ===================================================================
    const crossedThreshold = missedBlocks >= threshold;
    const increased = missedBlocks > lastMissed;
    const hasHistory = lastMissed > 0 || wallet.lastUptimeCheck !== null;
    
    // Should send alert if:
    // 1. Crossed threshold
    // 2. Increased since last check
    // 3. Not first check (has history)
    // 4. Cooldown period passed
    const shouldAlert = crossedThreshold && 
                       increased && 
                       hasHistory && 
                       !cooldownActive;
    
    if (shouldAlert) {
      if (wallet.notifyMissedBlocks && wallet.webhookUrl) {
        await sendDiscordNotification(
          wallet as Wallet & { chain: any }, 
          null, 
          'MissedBlocks', 
          null, 
          'validator-alert', 
          {
            alertType: 'missed_blocks',
            message: `🔴 Validator **${valInfo.moniker}** missed ${missedBlocks} blocks (threshold: ${threshold})`,
            missedBlocks,
            threshold,
            jailed: valInfo.jailed,
            increase: missedBlocks - lastMissed
          }
        );
        
        // Update alert timestamp
        await prisma.wallet.update({
          where: { id: walletId },
          data: {
            ...commonUpdateData,
            lastMissedBlocksCount: missedBlocks,
            lastMissedBlocksAlert: now,
            lastUptimeCheck: now
          }
        });
        
        logger.info(`[UPTIME] 🔔 Alert sent: ${missedBlocks} missed blocks (+${missedBlocks - lastMissed})`);
      }
    } 
    else {
      // Just update counters without alert
      await prisma.wallet.update({
        where: { id: walletId },
        data: {
          ...commonUpdateData,
          lastMissedBlocksCount: missedBlocks,
          lastUptimeCheck: now
        }
      });
      
      // Debug logging
      if (crossedThreshold && increased && cooldownActive) {
        const remainingCooldown = Math.ceil((cooldownMs - timeSinceLastAlert) / 1000 / 60);
        logger.debug(
          `[UPTIME] 🔕 Alert suppressed (cooldown: ${remainingCooldown}m remaining, ` +
          `missed: ${missedBlocks}, increase: +${missedBlocks - lastMissed})`
        );
      }
    }

    // ===================================================================
    // 3. RECOVERY ALERT (Dropped below threshold)
    // ===================================================================
    const recovered = missedBlocks < threshold && lastMissed >= threshold;
    
    if (recovered && wallet.notifyRecovery && wallet.notifyMissedBlocks && wallet.webhookUrl) {
      await sendDiscordNotification(
        wallet as Wallet & { chain: any }, 
        null, 
        'ValidatorRecovered', 
        null, 
        'validator-alert', 
        {
          alertType: 'recovery',
          message: `✅ Validator **${valInfo.moniker}** recovered! Missed blocks now at ${missedBlocks} (was ${lastMissed})`,
          missedBlocks,
          previousMissed: lastMissed,
          threshold
        }
      );
      
      logger.info(`[UPTIME] 🎉 Recovery: ${wallet.label} dropped from ${lastMissed} to ${missedBlocks} missed blocks`);
    }

  } catch (error) {
    logger.error(`[UPTIME] Error checking ${wallet.label}`, error);
  }
}

export async function checkGovernance(walletId: number): Promise<void> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { chain: true }
  });

  if (!wallet?.valAddress) return;

  try {
    let lastId = wallet.lastCheckedProposalId || 0;
    
    // COLD START
    if (lastId === 0) {
      logger.info(`[GOV] ❄️ Cold Start for ${wallet.label}`);
      const latestId = await fetchLatestProposalOnChain(wallet.chain.rest);
      const latestFinishedId = await fetchLatestFinishedProposalId(wallet.chain.rest);
      
      if (latestId > 0) {
        await prisma.wallet.update({
          where: { id: walletId },
          data: { 
            lastCheckedProposalId: latestId, 
            lastFinishedProposalId: latestFinishedId > 0 ? latestFinishedId : Math.max(0, latestId - 20),
            lastGovernanceCheck: new Date() 
          }
        });
      }
      return;
    }

    // CHECK NEW PROPOSALS
    const newProposals = await fetchActiveProposals(wallet.chain.rest, lastId);
    if (newProposals.length > 0) {
      logger.info(`[GOV] Found ${newProposals.length} new proposals for ${wallet.label}`);
      
      if (wallet.notifyGovernance && wallet.webhookUrl) {
        for (const p of newProposals) {
          await sendDiscordNotification(wallet as Wallet & { chain: any }, null, 'NewProposal', null, 'governance-alert', {
            alertType: 'new_proposal',
            proposalId: p.proposalId,
            title: p.title,
            description: p.description?.substring(0, 500) || "",
            votingEndTime: p.votingEndTime,
            status: p.status
          });
          await sleep(1000);
        }
      }
      
      const maxId = Math.max(...newProposals.map(p => parseInt(p.proposalId)));
      await prisma.wallet.update({
        where: { id: walletId },
        data: { lastCheckedProposalId: maxId }
      });
    }

    // CHECK FINISHED PROPOSALS
    let lastFinishedId = wallet.lastFinishedProposalId || lastId; 
    const finishedProposals = await fetchFinishedProposals(wallet.chain.rest, lastFinishedId);

    if (finishedProposals.length > 0) {
      logger.info(`[GOV] Found ${finishedProposals.length} finished proposals for ${wallet.label}`);

      if (wallet.notifyGovernance && wallet.webhookUrl) {
        for (const p of finishedProposals) {
          await sendDiscordNotification(wallet as Wallet & { chain: any }, null, 'FinishedProposal', null, 'governance-alert', {
            alertType: 'proposal_finished',
            proposalId: p.proposalId,
            title: p.title,
            description: "", 
            status: p.status,
            finalResult: p.finalResult // <-- PASSING DATA TALLY
          });
          await sleep(1000);
        }
      }

      const maxFinishedId = Math.max(...finishedProposals.map(p => parseInt(p.proposalId)));
      await prisma.wallet.update({
        where: { id: walletId },
        data: { 
          lastFinishedProposalId: maxFinishedId,
          lastGovernanceCheck: new Date()
        }
      });
    } else {
      await prisma.wallet.update({
        where: { id: walletId },
        data: { lastGovernanceCheck: new Date() }
      });
    }

  } catch (error) {
    logger.error(`[GOV] Error checking ${wallet.label}`, error);
  }
}

export async function monitorAllValidators(): Promise<void> {
  logger.info("🔍 Starting Validator Monitoring...");
  
  const wallets = await prisma.wallet.findMany({
    where: {
      valAddress: { not: null },
      OR: [{ notifyMissedBlocks: true }, { notifyGovernance: true }]
    },
    include: { chain: true }
  });

  for (const wallet of wallets) {
    if (wallet.notifyMissedBlocks) {
      await checkValidatorUptime(wallet.id);
      await sleep(1000);
    }
    if (wallet.notifyGovernance) {
      await checkGovernance(wallet.id);
      await sleep(1000);
    }
  }

  logger.info("✅ Validator Monitoring Complete");
}

export async function getGlobalGovernance() {
  // 1. Ambil semua chain beserta WALLETS-nya (tanpa filter di query agar chain non-val tetap masuk)
  const chains = await prisma.chain.findMany({
    include: {
      wallets: true
    }
  });

  let allProposals: any[] = [];

  // 2. Loop semua chain secara parallel
  await Promise.all(chains.map(async (chain) => {
    // Jika tidak ada wallet sama sekali di chain ini, skip
    if (chain.wallets.length === 0) return;

    // LOGIKA PILIH WALLET:
    // Prioritaskan wallet yang punya 'valAddress' (Validator).
    // Jika tidak ada, pakai wallet pertama yang ditemukan.
    const wallet = chain.wallets.find(w => w.valAddress) || chain.wallets[0];
    
    const restUrl = normalizeRestUrl(chain.rest);
    const address = wallet.address;

    try {
      // A. HANYA Ambil Proposal Aktif (Voting Period)
      // Kita set lastId 0 agar mengambil semua proposal aktif yang ada
      const activeProposals = await fetchActiveProposals(chain.rest, 0);

      // Jika tidak ada proposal aktif, lanjut ke chain berikutnya
      if (activeProposals.length === 0) return;

      // B. Cek Status Vote Saya untuk setiap proposal aktif
      const proposalsWithVote = await Promise.all(activeProposals.map(async (p) => {
        let myVote = "NOT_VOTED";
        
        try {
          // Coba fetch status vote ke API (Support V1 & V1Beta1)
          let voteData = null;
          try {
            const { data } = await axios.get(`${restUrl}/cosmos/gov/v1/proposals/${p.proposalId}/votes/${address}`, { timeout: 2000 });
            voteData = data.vote;
          } catch {
             // Fallback ke V1Beta1
             const { data } = await axios.get(`${restUrl}/cosmos/gov/v1beta1/proposals/${p.proposalId}/votes/${address}`, { timeout: 2000 });
             voteData = data.vote;
          }

          if (voteData) {
             const options = voteData.options || (voteData.option ? [{ option: voteData.option }] : []);
             if (options.length > 0) {
               const opt = options[0].option;
               // Mapping Kode Vote ke String
               if (opt === 1 || opt === 'VOTE_OPTION_YES') myVote = "YES";
               else if (opt === 2 || opt === 'VOTE_OPTION_ABSTAIN') myVote = "ABSTAIN";
               else if (opt === 3 || opt === 'VOTE_OPTION_NO') myVote = "NO";
               else if (opt === 4 || opt === 'VOTE_OPTION_NO_WITH_VETO') myVote = "VETO";
               else myVote = "VOTED";
             }
          }
        } catch (e) {
            // Error 400/404 wajar jika belum vote, abaikan
        }

        return {
          ...p,
          chainName: chain.name,
          walletLabel: wallet.label,
          type: 'active', // Karena kita filter active only, tipenya pasti active
          myVote
        };
      }));

      allProposals.push(...proposalsWithVote);

    } catch (error) {
      console.error(`Failed to fetch active gov for ${chain.name}`);
    }
  }));

  // 3. Sorting Global
  // Urutkan berdasarkan waktu berakhir voting (Deadline terdekat di paling atas)
  return allProposals.sort((a, b) => {
     return new Date(a.votingEndTime).getTime() - new Date(b.votingEndTime).getTime();
  });
}