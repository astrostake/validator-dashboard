// src/routes/webhook.ts - Enhanced Response Structure

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";
import { sendDiscordNotification } from "../services/webhook";

const router = Router();
const prisma = new PrismaClient();

// Helper: Get human-readable field labels
const FIELD_LABELS: Record<string, string> = {
  notifyWalletTx: 'Wallet Transactions',
  notifyValidatorTx: 'Incoming Delegations',
  notifyOwnDelegations: 'Own Delegations',
  notifyBalanceChange: 'Balance Changes',
  balanceThreshold: 'Balance Threshold (USD)',
  notifyMissedBlocks: 'Missed Blocks Alert',
  missedBlocksThreshold: 'Missed Blocks Threshold',
  missedBlocksCooldown: 'Alert Cooldown (minutes)',
  notifyRecovery: 'Recovery Alerts',
  notifyGovernance: 'Governance Proposals',
  consensusAddress: 'Consensus Address'
};

// ===================================================================
// RESPONSE FORMATTERS
// ===================================================================

function formatWebhookSettings(wallet: any) {
  const isValidator = !!wallet.valAddress;
  
  const settings: any = {
    webhookUrl: wallet.webhookUrl,
    general: {
      walletTransactions: wallet.notifyWalletTx,
      balanceChanges: {
        enabled: wallet.notifyBalanceChange,
        thresholdUsd: wallet.balanceThreshold
      }
    }
  };

  if (isValidator) {
    settings.validator = {
      incomingDelegations: wallet.notifyValidatorTx,
      ownDelegations: wallet.notifyOwnDelegations,
      missedBlocks: {
        enabled: wallet.notifyMissedBlocks,
        threshold: wallet.missedBlocksThreshold,
        cooldownMinutes: wallet.missedBlocksCooldown,
        notifyRecovery: wallet.notifyRecovery
      },
      governance: wallet.notifyGovernance,
      consensusAddress: wallet.consensusAddress
    };
  }

  return settings;
}

function formatChangesSummary(changes: any[], isValidator: boolean) {
  const summary = {
    totalChanges: changes.length,
    categories: {
      general: 0,
      validator: 0,
      thresholds: 0
    },
    changes: changes.map(c => ({
      field: c.field,
      label: c.label,
      oldValue: c.oldValue,
      newValue: c.newValue,
      type: typeof c.newValue
    }))
  };

  changes.forEach(c => {
    if (['notifyWalletTx', 'notifyBalanceChange', 'balanceThreshold'].includes(c.field)) {
      summary.categories.general++;
    } else if (c.field.includes('Threshold') || c.field.includes('Cooldown')) {
      summary.categories.thresholds++;
    } else {
      summary.categories.validator++;
    }
  });

  return summary;
}

// ===================================================================
// WEBHOOK CONFIGURATION ENDPOINTS
// ===================================================================

router.post("/wallet/:id/webhook", async (req: Request, res: Response) => {
  try {
    const walletId = Number(req.params.id);
    const {
      webhookUrl,
      notifyWalletTx,
      notifyValidatorTx,
      notifyOwnDelegations,
      notifyBalanceChange,
      balanceThreshold,
      notifyMissedBlocks,
      missedBlocksThreshold,
      missedBlocksCooldown,
      notifyRecovery,
      notifyGovernance,
      consensusAddress
    } = req.body;

    // 1. Get current wallet state
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      include: { chain: true },
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

    const isValidator = !!wallet.valAddress;

    // 2. Validate webhook URL if provided
    const isWebhookChanging = webhookUrl !== undefined && webhookUrl !== wallet.webhookUrl;
    const isWebhookBeingSet = isWebhookChanging && !wallet.webhookUrl && webhookUrl;
    const isWebhookBeingRemoved = isWebhookChanging && wallet.webhookUrl && !webhookUrl;

    if (webhookUrl) {
      const { validateWebhook } = await import("../services/webhook");
      const isValid = await validateWebhook(webhookUrl);

      if (!isValid) {
        return res.status(400).json({ 
          success: false,
          error: {
            message: "Invalid or unreachable webhook URL",
            code: "INVALID_WEBHOOK_URL"
          }
        });
      }
    }

    // 3. Track changes for notification
    const changes: Array<{field: string, oldValue: any, newValue: any, label?: string}> = [];
    
    const trackChange = (field: string, newValue: any, oldValue: any) => {
      if (newValue !== undefined && newValue !== oldValue) {
        changes.push({
          field,
          oldValue,
          newValue,
          label: FIELD_LABELS[field] || field
        });
      }
    };

    // Track all changes
    trackChange('notifyWalletTx', notifyWalletTx, wallet.notifyWalletTx);
    trackChange('notifyValidatorTx', notifyValidatorTx, wallet.notifyValidatorTx);
    trackChange('notifyOwnDelegations', notifyOwnDelegations, wallet.notifyOwnDelegations);
    trackChange('notifyBalanceChange', notifyBalanceChange, wallet.notifyBalanceChange);
    trackChange('balanceThreshold', balanceThreshold, wallet.balanceThreshold);
    trackChange('notifyMissedBlocks', notifyMissedBlocks, wallet.notifyMissedBlocks);
    trackChange('missedBlocksThreshold', missedBlocksThreshold, wallet.missedBlocksThreshold);
    trackChange('missedBlocksCooldown', missedBlocksCooldown, wallet.missedBlocksCooldown);
    trackChange('notifyRecovery', notifyRecovery, wallet.notifyRecovery);
    trackChange('notifyGovernance', notifyGovernance, wallet.notifyGovernance);
    trackChange('consensusAddress', consensusAddress, wallet.consensusAddress);

    // 4. Update wallet settings
    const consensusAddressChanged = consensusAddress !== undefined && consensusAddress !== wallet.consensusAddress;

    const updated = await prisma.wallet.update({
      where: { id: walletId },
      data: {
        ...(webhookUrl !== undefined && { webhookUrl: webhookUrl || null }),
        ...(notifyWalletTx !== undefined && { notifyWalletTx }),
        ...(notifyValidatorTx !== undefined && { notifyValidatorTx }),
        ...(notifyOwnDelegations !== undefined && { notifyOwnDelegations }),
        ...(notifyBalanceChange !== undefined && { notifyBalanceChange }),
        ...(balanceThreshold !== undefined && { balanceThreshold: Number(balanceThreshold) }),
        ...(notifyMissedBlocks !== undefined && { notifyMissedBlocks }),
        ...(missedBlocksThreshold !== undefined && { 
            missedBlocksThreshold: parseInt(String(missedBlocksThreshold), 10) 
        }),
        ...(missedBlocksCooldown !== undefined && { 
            missedBlocksCooldown: parseInt(String(missedBlocksCooldown), 10) 
        }),
        ...(notifyRecovery !== undefined && { notifyRecovery }),
        ...(notifyGovernance !== undefined && { notifyGovernance }),
        ...(consensusAddress !== undefined && { consensusAddress: consensusAddress || null })
      },
      include: { chain: true },
    });

    // 5. Send configuration update notification
    let notificationSent = false;
    
    if (updated.webhookUrl && changes.length > 0) {
      try {
        let updateType: 'monitoring_enabled' | 'monitoring_disabled' | 'monitoring_updated' | 'webhook_connected' | 'webhook_disconnected';
        let summary = '';

        if (isWebhookBeingSet) {
          updateType = 'webhook_connected';
          
          const activeFeatures = [];
          if (updated.notifyWalletTx) activeFeatures.push('✅ Wallet Transactions');
          if (updated.notifyBalanceChange) activeFeatures.push('✅ Balance Changes');
          if (isValidator && updated.notifyValidatorTx) activeFeatures.push('✅ Incoming Delegations');
          if (isValidator && updated.notifyMissedBlocks) activeFeatures.push('✅ Missed Blocks Alert');
          if (isValidator && updated.notifyGovernance) activeFeatures.push('✅ Governance Proposals');
          
          if (activeFeatures.length > 0) {
            summary = `${activeFeatures.length} alert type(s) already configured`;
          }
        } else if (isWebhookBeingRemoved) {
          updateType = 'webhook_disconnected';
        } else {
          const monitoringChanges = changes.filter(c => 
            c.field.startsWith('notify') && typeof c.newValue === 'boolean'
          );
          
          const allEnabled = monitoringChanges.every(c => c.newValue === true);
          const allDisabled = monitoringChanges.every(c => c.newValue === false);
          
          if (monitoringChanges.length > 0 && allEnabled) {
            updateType = 'monitoring_enabled';
            summary = `You will now receive alerts for ${monitoringChanges.length} event type(s)`;
          } else if (monitoringChanges.length > 0 && allDisabled) {
            updateType = 'monitoring_disabled';
            summary = `Alerts disabled for ${monitoringChanges.length} event type(s)`;
          } else {
            updateType = 'monitoring_updated';
            
            const enabled = changes.filter(c => c.newValue === true).length;
            const disabled = changes.filter(c => c.newValue === false).length;
            const modified = changes.filter(c => typeof c.newValue !== 'boolean').length;
            
            const parts = [];
            if (enabled > 0) parts.push(`${enabled} enabled`);
            if (disabled > 0) parts.push(`${disabled} disabled`);
            if (modified > 0) parts.push(`${modified} updated`);
            
            summary = parts.join(', ');
          }
        }

        if (updateType !== 'webhook_disconnected') {
          await sendDiscordNotification(
            updated as any,
            null,
            'ConfigUpdate',
            null,
            'config-update',
            {
              updateType,
              changes,
              summary
            }
          );
          notificationSent = true;
        }
      } catch (error) {
        logger.error('[WEBHOOK] Failed to send config update notification:', error);
      }
    }

    // 6. Auto check: If consensus address was just added/changed OR if monitoring was just enabled
    const shouldRunCheck = 
      (consensusAddressChanged && consensusAddress) || 
      (notifyMissedBlocks === true && !wallet.notifyMissedBlocks && updated.consensusAddress);

    if (shouldRunCheck && updated.notifyMissedBlocks) {
      logger.info(`[WEBHOOK SAVE] Triggering immediate uptime check for wallet ${walletId}...`);
      
      (async () => {
        try {
          const { checkValidatorUptime } = await import("../services/validatorMonitor");
          await checkValidatorUptime(walletId);
          logger.info(`[WEBHOOK SAVE] ✅ Initial uptime check completed for wallet ${walletId}`);
        } catch (error) {
          logger.error(`[WEBHOOK SAVE] Failed to check uptime:`, error);
        }
      })();
    }

    res.json({
      success: true,
      message: "Webhook settings updated successfully",
      data: {
        wallet: {
          id: walletId,
          label: wallet.label,
          type: isValidator ? "validator" : "regular"
        },
        settings: formatWebhookSettings(updated),
        changesSummary: formatChangesSummary(changes, isValidator),
        actions: {
          notificationSent,
          uptimeCheckTriggered: shouldRunCheck && updated.notifyMissedBlocks
        }
      }
    });

  } catch (error) {
    logger.error("Error updating webhook settings:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to update webhook settings",
        code: "UPDATE_WEBHOOK_ERROR"
      }
    });
  }
});

router.get("/wallet/:id/webhook", async (req: Request, res: Response) => {
  try {
    const walletId = Number(req.params.id);
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      select: {
        id: true,
        label: true,
        valAddress: true,
        webhookUrl: true,
        notifyWalletTx: true,
        notifyValidatorTx: true,
        notifyOwnDelegations: true,
        notifyBalanceChange: true,
        balanceThreshold: true,
        notifyMissedBlocks: true,
        missedBlocksThreshold: true,
        missedBlocksCooldown: true,
        notifyRecovery: true,
        notifyGovernance: true,
        consensusAddress: true
      }
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

    res.json({
      success: true,
      data: {
        wallet: {
          id: wallet.id,
          label: wallet.label,
          type: wallet.valAddress ? "validator" : "regular"
        },
        settings: formatWebhookSettings(wallet)
      }
    });
  } catch (error) {
    logger.error("Error fetching webhook settings:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to fetch webhook settings",
        code: "FETCH_WEBHOOK_ERROR"
      }
    });
  }
});

router.post("/wallet/:id/webhook/test", async (req: Request, res: Response) => {
  try {
    const walletId = Number(req.params.id);

    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      include: { chain: true },
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

    if (!wallet.webhookUrl) {
      return res.status(400).json({ 
        success: false,
        error: {
          message: "Webhook URL not configured for this wallet",
          code: "WEBHOOK_NOT_CONFIGURED"
        }
      });
    }

    const { testWebhook } = await import("../services/webhook");
    const success = await testWebhook(wallet.webhookUrl, wallet.chain.name);

    if (success) {
      res.json({ 
        success: true,
        message: "Test notification sent successfully",
        data: {
          wallet: {
            id: walletId,
            label: wallet.label
          },
          webhookUrl: wallet.webhookUrl,
          chain: wallet.chain.name
        }
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: {
          message: "Failed to send test notification. Please check webhook URL.",
          code: "WEBHOOK_TEST_FAILED"
        }
      });
    }
  } catch (error) {
    logger.error("Error testing webhook:", error);
    res.status(500).json({ 
      success: false,
      error: {
        message: "Failed to test webhook",
        code: "WEBHOOK_TEST_ERROR"
      }
    });
  }
});

export default router;