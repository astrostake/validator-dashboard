// src/services/webhook.ts

import axios from "axios";
import { logger } from "../utils/logger";
import { CONFIG } from "../config";
import { formatToken } from "../utils/helpers";
import type { Wallet, Chain } from "../types";

import { version } from "../../../package.json";

// Extends Wallet for internal use to ensure chain data is accessible
interface WalletWithChain extends Omit<Wallet, 'chain'> {
  chain: Chain;
}

type NotificationCategory = 
  | 'wallet' 
  | 'validator-own' 
  | 'validator-incoming' 
  | 'balance'
  | 'validator-alert'
  | 'governance-alert'
  | 'config-update';  // NEW: For configuration changes

// Interfaces for additional data payloads
interface BalanceChangeData {
  oldTotal: number;
  newTotal: number;
  change: number;
}

interface ValidatorAlertData {
  alertType: 'jailed' | 'missed_blocks' | 'recovery';
  message: string;
  missedBlocks?: number;
  threshold?: number;
  jailed?: boolean;
  jailedUntil?: string;
  increase?: number;
  wasJailed?: boolean;
  previousMissed?: number;
}

interface GovernanceAlertData {
  alertType: 'new_proposal' | 'proposal_finished';
  proposalId: string;
  title: string;
  description: string;
  votingEndTime?: string;
  status: string;
  finalResult?: string;
}

// NEW: Configuration update notification data
interface ConfigUpdateData {
  updateType: 
    | 'monitoring_enabled'
    | 'monitoring_disabled'
    | 'monitoring_updated'
    | 'webhook_connected'
    | 'webhook_disconnected';
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
    label?: string;
  }[];
  summary: string;
}

/**
 * Sends a structured notification to Discord via Webhook
 */
export async function sendDiscordNotification(
  wallet: WalletWithChain,
  txResponse: any | null,
  type: string,
  amount: string | null,
  category: NotificationCategory,
  extraData?: BalanceChangeData | ValidatorAlertData | GovernanceAlertData | ConfigUpdateData
): Promise<void> {
  if (!wallet.webhookUrl) return;

  try {
    const chainName = wallet.chain.name.toUpperCase();
    const walletLabel = wallet.label;
    
    const embed: any = {
      timestamp: new Date().toISOString(),
      footer: {
        text: `v${version} | ${wallet.chain.name}`
      }
    };

    // --- 1. CONFIGURATION UPDATES ---
    if (category === 'config-update') {
      const data = extraData as ConfigUpdateData;
      
      switch (data.updateType) {
        case 'webhook_connected':
          embed.title = `🔗 [${chainName}] Webhook Connected`;
          embed.color = 0x10b981; // Green
          embed.description = `Webhook successfully configured for **${walletLabel}**`;
          
          // Show active features if any, otherwise show setup instructions
          const activeFeatures = data.changes
            .filter(c => c.field.startsWith('notify') && c.newValue === true)
            .map(c => `✅ ${c.label || c.field}`)
            .join('\n');
          
          if (activeFeatures) {
            embed.fields = [
              { 
                name: '📡 Currently Active', 
                value: activeFeatures,
                inline: false 
              },
              {
                name: '💡 Tip',
                value: 'You can enable or disable specific alerts anytime in your monitoring settings.',
                inline: false
              }
            ];
            
            if (data.summary) {
              embed.footer.text = `v${version} | ${wallet.chain.name} | ${data.summary}`;
            }
          } else {
            embed.fields = [
              { 
                name: '📋 Next Steps', 
                value: 'Your webhook is ready! Configure which alerts you want to receive:\n\n' +
                       '• **Transaction Alerts** - Get notified on new transactions\n' +
                       '• **Balance Changes** - Track significant balance movements\n' +
                       '• **Validator Monitoring** - Missed blocks & jailing alerts\n' +
                       '• **Governance Proposals** - New proposals & voting results\n\n' +
                       'Enable these features in your monitoring settings.',
                inline: false 
              }
            ];
          }
          break;

        case 'webhook_disconnected':
          embed.title = `🔌 [${chainName}] Webhook Disconnected`;
          embed.color = 0x6b7280; // Gray
          embed.description = `Notifications disabled for **${walletLabel}**`;
          break;

        case 'monitoring_enabled':
          embed.title = `📡 [${chainName}] Monitoring Activated`;
          embed.color = 0x3b82f6; // Blue
          embed.description = `**${walletLabel}** monitoring is now active`;
          
          const enabledFeatures = data.changes
            .filter(c => c.newValue === true)
            .map(c => `✅ ${c.label || c.field}`)
            .join('\n');
          
          if (enabledFeatures) {
            embed.fields = [
              { name: '📋 Enabled Alerts', value: enabledFeatures, inline: false }
            ];
          }
          
          // Add threshold info if present
          const thresholds = data.changes
            .filter(c => c.field.includes('Threshold') || c.field.includes('Cooldown'))
            .map(c => `• ${c.label || c.field}: **${c.newValue}**`)
            .join('\n');
          
          if (thresholds) {
            embed.fields.push({ 
              name: '⚙️ Configuration', 
              value: thresholds, 
              inline: false 
            });
          }
          break;

        case 'monitoring_disabled':
          embed.title = `⏸️ [${chainName}] Monitoring Paused`;
          embed.color = 0xf59e0b; // Orange
          embed.description = `Monitoring paused for **${walletLabel}**`;
          
          const disabledFeatures = data.changes
            .filter(c => c.newValue === false)
            .map(c => `⏸️ ${c.label || c.field}`)
            .join('\n');
          
          if (disabledFeatures) {
            embed.fields = [
              { name: '📋 Disabled Alerts', value: disabledFeatures, inline: false }
            ];
          }
          break;

        case 'monitoring_updated':
          embed.title = `🔧 [${chainName}] Monitoring Settings Updated`;
          embed.color = 0x8b5cf6; // Purple
          embed.description = `Configuration changed for **${walletLabel}**`;
          
          const updates = data.changes.map(c => {
            const emoji = typeof c.newValue === 'boolean' 
              ? (c.newValue ? '✅' : '⏸️')
              : '🔄';
            
            let changeStr = `${emoji} **${c.label || c.field}**`;
            
            // Format boolean changes
            if (typeof c.newValue === 'boolean') {
              changeStr += `: ${c.newValue ? 'Enabled' : 'Disabled'}`;
            }
            // Format numeric changes
            else if (typeof c.newValue === 'number') {
              changeStr += `: ${c.oldValue} → **${c.newValue}**`;
            }
            // Format string changes
            else if (c.oldValue !== c.newValue) {
              const oldDisplay = c.oldValue || '(none)';
              const newDisplay = c.newValue || '(none)';
              changeStr += `: ${oldDisplay} → **${newDisplay}**`;
            }
            
            return changeStr;
          }).join('\n');
          
          if (updates) {
            embed.fields = [
              { name: '📝 Changes', value: updates, inline: false }
            ];
          }
          
          if (data.summary) {
            embed.fields.push({
              name: '💡 Summary',
              value: data.summary,
              inline: false
            });
          }
          break;
      }
    }
    // --- 2. VALIDATOR & GOVERNANCE ALERTS ---
    else if (category === 'validator-alert') {
      const data = extraData as ValidatorAlertData;
      const isJailed = data.alertType === 'jailed';
      const isRecovery = data.alertType === 'recovery';
      
      if (isRecovery) {
        embed.title = data.wasJailed 
          ? `✅ [${chainName}] VALIDATOR UNJAILED!`
          : `✅ [${chainName}] VALIDATOR RECOVERED`;
        embed.color = 0x10b981;
        embed.description = `**Validator:** ${walletLabel}\n${data.message}`;
        
        if (data.wasJailed) {
          embed.fields = [
            { name: 'Status', value: '🟢 ACTIVE', inline: true },
            { name: 'Current Missed', value: `${data.missedBlocks || 0}`, inline: true }
          ];
        } else {
          embed.fields = [
            { name: 'Previous', value: `${data.previousMissed}`, inline: true },
            { name: 'Current', value: `**${data.missedBlocks}**`, inline: true },
            { name: 'Threshold', value: `${data.threshold}`, inline: true }
          ];
        }
      }
      else if (isJailed) {
        embed.title = `🚨 [${chainName}] VALIDATOR JAILED!`;
        embed.color = 0xdc2626;
        embed.description = `**Validator:** ${walletLabel}\n${data.message}`;
        
        embed.fields = [
          { name: 'Missed', value: `**${data.missedBlocks}**`, inline: true },
          { name: 'Threshold', value: `${data.threshold}`, inline: true },
          { name: 'Status', value: '🔴 JAILED', inline: true }
        ];
      }
      else {
        embed.title = `⚠️ [${chainName}] MISSED BLOCKS WARNING`;
        embed.color = 0xf59e0b;
        embed.description = `**Validator:** ${walletLabel}\n${data.message}`;
        
        embed.fields = [
          { name: 'Missed', value: `**${data.missedBlocks}**`, inline: true },
          { name: 'Threshold', value: `${data.threshold}`, inline: true },
          { name: 'Increase', value: `+${data.increase || 0}`, inline: true }
        ];
        
        if (data.jailed) {
          embed.fields.push({ name: 'Status', value: '🔴 JAILED', inline: true });
        }
      }
    }
    else if (category === 'governance-alert') {
      const data = extraData as GovernanceAlertData;
      
      if (data.alertType === 'new_proposal') {
        embed.title = `🗳️ [${chainName}] New Proposal #${data.proposalId}`;
        embed.color = 0x8b5cf6;
        embed.description = `**${data.title}**\n\n${data.description.substring(0, 300)}${data.description.length > 300 ? '...' : ''}`;
        
        embed.fields = [
          { name: 'Ending', value: `<t:${Math.floor(new Date(data.votingEndTime!).getTime() / 1000)}:R>`, inline: true }, 
          { name: 'Status', value: 'Voting Period', inline: true }
        ];
      } 
      else if (data.alertType === 'proposal_finished') {
        const isPassed = data.status.includes('PASSED');
        
        embed.title = `⚖️ [${chainName}] Proposal #${data.proposalId} Ended`;
        embed.color = isPassed ? 0x10b981 : 0xef4444; 
        embed.description = `**${data.title}**\n\nResult: **${isPassed ? '✅ PASSED' : '❌ ' + data.status}**`;
        
        if (data.finalResult) {
           embed.fields = [
             { name: 'Final Tally', value: `\`\`\`${data.finalResult}\`\`\``, inline: false }
           ];
        }
      }
    }
    // --- 3. BALANCE CHANGE ---
    else if (category === 'balance') {
      const data = extraData as BalanceChangeData;
      const isIncrease = data.newTotal > data.oldTotal;
      
      embed.title = isIncrease 
        ? `📈 [${chainName}] Balance Increase` 
        : `📉 [${chainName}] Balance Decrease`;
        
      embed.color = isIncrease ? 0x10b981 : 0xef4444;
      embed.fields = [
        { name: 'Wallet', value: walletLabel, inline: false },
        { name: 'Amount', value: `$${data.newTotal.toLocaleString('en-US', {minimumFractionDigits: 2})}`, inline: true },
        { name: 'Change', value: `**${isIncrease ? '+' : '-'}$${Math.abs(data.change).toFixed(2)}**`, inline: true }
      ];
    } 
    // --- 4. STANDARD TRANSACTIONS ---
    else {
      const cleanType = type.replace('Msg', '');
      const isIncoming = category === 'validator-incoming';
      
      embed.title = isIncoming 
        ? `🔥 [${chainName}] Validator Received Delegation` 
        : `📢 [${chainName}] New Transaction: ${cleanType}`;
      
      embed.color = getColorForTxType(type);
      
      embed.fields = [
        { name: 'Wallet', value: walletLabel, inline: true },
        { name: 'Type', value: `\`${cleanType}\``, inline: true },
      ];

      if (amount && amount !== 'Failed') {
        embed.fields.push({ name: 'Amount', value: `**${formatNotificationAmount(amount, wallet.chain)}**`, inline: false });
      }

      embed.fields.push({ name: 'Hash', value: `\`${txResponse?.txhash?.substring(0, 10)}...${txResponse?.txhash?.slice(-6)}\``, inline: false });
    }

    await axios.post(wallet.webhookUrl, {
      username: CONFIG.NOTIFICATIONS.DISCORD_USERNAME,
      avatar_url: CONFIG.NOTIFICATIONS.DISCORD_AVATAR,
      embeds: [embed]
    }, { timeout: CONFIG.API_TIMEOUT_MS });

    logger.info(`[WEBHOOK] Notification sent: ${wallet.label} (${category})`);
  } catch (error) {
    logger.error(`[WEBHOOK ERROR] Failed for ${wallet.label}`, error);
  }
}

/**
 * Helper: Format amount with token denomination and USD conversion
 */
function formatNotificationAmount(raw: string, chain: Chain): string {
  const match = raw.match(/^(\d+)([a-zA-Z]+)$/);
  if (!match) return raw;

  const tokenAmount = formatToken(match[1], chain.decimals);
  let cleanDenom = match[2].toUpperCase();
  
  if ((match[2].startsWith('u') || match[2].startsWith('a')) && match[2].length > 3) {
    cleanDenom = match[2].substring(1).toUpperCase();
  }

  const tokenStr = `${tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${cleanDenom}`;
  const usdValue = tokenAmount * (chain.priceUsd || 0);

  return usdValue > 0 ? `${tokenStr} (~$${usdValue.toFixed(2)})` : tokenStr;
}

function getColorForTxType(type: string): number {
  if (type.includes('Delegate')) return 0x3b82f6;
  if (type.includes('Withdraw')) return 0x10b981;
  if (type.includes('Send')) return 0x06b6d4;
  return 0x3b82f6;
}

/**
 * Validate webhook URL without sending notification
 * Used during save settings to check if webhook is reachable
 */
export async function validateWebhook(webhookUrl: string): Promise<boolean> {
  try {
    // Send a minimal HEAD or GET request to check if webhook exists
    // Discord webhooks return 200 OK for valid URLs even with empty POST
    const response = await axios.get(webhookUrl, { 
      timeout: CONFIG.API_TIMEOUT_MS,
      validateStatus: (status) => status === 200 || status === 404
    });
    
    // If we get 404, webhook doesn't exist
    if (response.status === 404) {
      logger.warn('[WEBHOOK VALIDATE] Webhook URL not found (404)');
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('[WEBHOOK VALIDATE] Validation failed', error);
    return false;
  }
}

/**
 * Test a webhook connection by sending actual test notification
 * Only used when user explicitly clicks "Test Webhook" button
 */
export async function testWebhook(webhookUrl: string, chainName: string): Promise<boolean> {
  try {
    await axios.post(webhookUrl, {
      embeds: [{
        title: `✅ [${chainName.toUpperCase()}] Webhook Test Successful`,
        description: `Your webhook is properly configured and ready to receive notifications.`,
        color: 0x10b981,
        timestamp: new Date().toISOString(),
        footer: {
          text: `v${version} | Test Connection`
        }
      }]
    }, { timeout: CONFIG.API_TIMEOUT_MS });
    return true;
  } catch (error) {
    logger.error('[WEBHOOK TEST] Failed', error);
    return false;
  }
}