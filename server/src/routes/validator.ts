// src/routes/validator.ts - Enhanced Response Structure

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

const router = Router();
const prisma = new PrismaClient();

// ===================================================================
// RESPONSE FORMATTERS
// ===================================================================

function formatValidatorInfo(valInfo: any, signingInfo?: any) {
  return {
    operator: {
      address: valInfo.operatorAddress,
      consensusAddress: valInfo.consensusAddress,
      moniker: valInfo.moniker
    },
    status: {
      jailed: valInfo.jailed,
      bondStatus: valInfo.status,
      votingPower: valInfo.votingPower,
      tokens: valInfo.tokens
    },
    signing: signingInfo ? {
      missedBlocks: parseInt(signingInfo.missedBlocksCounter),
      jailedUntil: signingInfo.jailedUntil
    } : null
  };
}

function formatMonitoringStatus(wallet: any) {
  return {
    uptime: {
      enabled: wallet.notifyMissedBlocks,
      lastCheck: wallet.lastUptimeCheck,
      currentMissedBlocks: wallet.lastMissedBlocksCount,
      threshold: wallet.missedBlocksThreshold,
      isJailed: wallet.lastJailedStatus
    },
    governance: {
      enabled: wallet.notifyGovernance,
      lastCheck: wallet.lastGovernanceCheck,
      lastCheckedProposalId: wallet.lastCheckedProposalId,
      lastFinishedProposalId: wallet.lastFinishedProposalId
    }
  };
}

// ===================================================================
// VALIDATOR MONITORING ENDPOINTS
// ===================================================================

router.get("/wallet/:id/fetch-consensus", async (req: Request, res: Response) => {
  try {
    const walletId = Number(req.params.id);

    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      include: { chain: true }
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

    if (!wallet.valAddress) {
      return res.status(400).json({ 
        success: false,
        error: {
          message: "This wallet is not a validator",
          code: "NOT_VALIDATOR"
        }
      });
    }

    const { fetchValidatorInfo } = await import("../services/validatorMonitor");
    const valInfo = await fetchValidatorInfo(wallet.chain.rest, wallet.valAddress, wallet.chain.decimals);
    
    if (!valInfo || !valInfo.consensusAddress) {
      return res.status(404).json({ 
        success: false,
        error: {
          message: "Could not fetch consensus address from chain",
          code: "CONSENSUS_FETCH_FAILED"
        }
      });
    }

    // Auto-save consensus address to DB
    await prisma.wallet.update({
      where: { id: walletId },
      data: { consensusAddress: valInfo.consensusAddress }
    });

    res.json({
      success: true,
      message: "Consensus address fetched and saved successfully",
      data: {
        wallet: {
          id: walletId,
          label: wallet.label
        },
        validator: {
          operatorAddress: wallet.valAddress,
          consensusAddress: valInfo.consensusAddress
        }
      }
    });

  } catch (error: any) {
    logger.error("Error fetching consensus address:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to fetch consensus address",
        code: "FETCH_CONSENSUS_ERROR"
      }
    });
  }
});

router.post("/wallet/:id/check-validator", async (req: Request, res: Response) => {
  try {
    const walletId = Number(req.params.id);

    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      include: { chain: true }
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

    if (!wallet.valAddress) {
      return res.status(400).json({ 
        success: false,
        error: {
          message: "This wallet is not a validator",
          code: "NOT_VALIDATOR"
        }
      });
    }

    res.json({ 
      success: true,
      message: "Validator check started in background",
      data: {
        wallet: {
          id: walletId,
          label: wallet.label
        },
        checks: {
          uptime: wallet.notifyMissedBlocks,
          governance: wallet.notifyGovernance
        },
        status: "check_initiated"
      }
    });

    // Run in background
    (async () => {
      const { checkValidatorUptime, checkGovernance } = await import("../services/validatorMonitor");
      
      if (wallet.notifyMissedBlocks) {
        await checkValidatorUptime(walletId);
      }
      
      if (wallet.notifyGovernance) {
        await checkGovernance(walletId);
      }
    })().catch(error => {
      logger.error("Manual validator check error:", error);
    });

  } catch (error) {
    logger.error("Error starting validator check:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to start validator check",
        code: "VALIDATOR_CHECK_ERROR"
      }
    });
  }
});

router.get("/wallet/:id/validator-status", async (req: Request, res: Response) => {
  try {
    const walletId = Number(req.params.id);

    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      include: { chain: true }
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

    if (!wallet.valAddress) {
      return res.status(400).json({ 
        success: false,
        error: {
          message: "This wallet is not a validator",
          code: "NOT_VALIDATOR"
        }
      });
    }

    const { fetchValidatorInfo, fetchSigningInfo } = await import("../services/validatorMonitor");
    
    const valInfo = await fetchValidatorInfo(wallet.chain.rest, wallet.valAddress, wallet.chain.decimals);
    
    if (!valInfo) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Could not fetch validator information from chain",
          code: "VALIDATOR_INFO_FETCH_FAILED"
        }
      });
    }
    
    let signingInfo = null;
    if (wallet.consensusAddress) {
      signingInfo = await fetchSigningInfo(wallet.chain.rest, wallet.consensusAddress);
    }

    res.json({
      success: true,
      data: {
        wallet: {
          id: walletId,
          label: wallet.label
        },
        validator: formatValidatorInfo(valInfo, signingInfo),
        monitoring: formatMonitoringStatus(wallet),
        chain: {
          id: wallet.chain.id,
          name: wallet.chain.name
        }
      }
    });

  } catch (error) {
    logger.error("Error fetching validator status:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to fetch validator status",
        code: "FETCH_VALIDATOR_STATUS_ERROR"
      }
    });
  }
});

export default router;