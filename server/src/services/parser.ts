// src/services/parser.ts

import { ParsedTx } from "../types";

// Helper types for Cosmos SDK raw structures
interface RawMessage {
  "@type"?: string;
  [key: string]: any;
}

interface RawLog {
  events?: Array<{
    type: string;
    attributes?: Array<{ key: string; value: string }>;
  }>;
}

interface EventAttribute {
  key: string;
  value: string;
  index?: boolean;
}

interface Event {
  type: string;
  attributes: EventAttribute[];
}

export class TxParser {
  /**
   * Main Entry Point: Parse a transaction response
   */
  static parse(txResponse: any): ParsedTx {
    const result: ParsedTx = {
      type: "Unknown",
      amount: null,
      sender: null,
      recipient: null,
      delegator: null,
      validator: null,
      dstValidator: null,
      timestamp: new Date(),
      height: 0,
      hash: ""
    };

    if (!txResponse || !txResponse.tx) return result;

    const messages: RawMessage[] = txResponse.tx.body?.messages || [];
    
    // 1. Handle Batch Transactions (Multiple Messages)
    if (messages.length > 1) {
      const ibcRecvMsg = messages.find(m => (m["@type"] || "").includes("RecvPacket"));
    
      if (ibcRecvMsg) {
        // Jika ada, kita FOKUS ke pesan ini saja dan abaikan UpdateClient
        result.type = "IBC Receive";
        this.extractByPattern(ibcRecvMsg, result);
      
        // Jika hasil extractByPattern sudah dapat amount, return segera
        if (result.amount && result.recipient) {
          return result; 
        }
      }
      // ----------------------------------------------------------------------
      
      return this.parseBatchTx(txResponse, messages);
    }

    // 2. Handle Single Message
    const msg = messages[0];
    if (!msg) return result;

    const rawType = msg["@type"] || "";
    result.type = rawType.split(".").pop() || "Tx";

    // Extract fields based on pattern
    this.extractByPattern(msg, result);
    
    // CRITICAL FIX: For Withdraw transactions, extract from events/logs
    if (result.type.includes("Withdraw")) {
      this.enhanceWithdrawData(txResponse, result);
    }
    
    // Fallback: Extract Amount from Logs
    if (!result.amount) {
      result.amount = this.extractAmountFromLogs(txResponse.logs);
    }

    // Fallback: Extract Recipient from Logs or Events
    if (!result.recipient) {
      result.recipient = this.extractRecipientFromEvents(txResponse.events) || 
                        this.extractRecipientFromLogs(txResponse.logs);
    }

    return result;
  }

  /**
   * Handle Batch Transactions (e.g., Batch Withdraw)
   */
  private static parseBatchTx(txResponse: any, messages: RawMessage[]): ParsedTx {
    const result: ParsedTx = {
      type: "Batch",
      amount: null,
      sender: null,
      recipient: null,
      delegator: null,
      validator: null,
      dstValidator: null,
      timestamp: new Date(),
      height: 0,
      hash: ""
    };

    const types = messages.map(m => (m["@type"] || "").split(".").pop());
    const uniqueTypes = [...new Set(types)];

    // Case A: Batch Withdraw (Reward + Commission) - MOST COMMON
    if (uniqueTypes.some(t => t?.includes("Withdraw"))) {
      // Check if it's combined Withdraw Reward + Commission
      const hasReward = types.some(t => t?.includes("WithdrawDelegatorReward"));
      const hasCommission = types.some(t => t?.includes("WithdrawValidatorCommission"));
      
      if (hasReward && hasCommission) {
        result.type = `BatchWithdraw(Reward+Commission)`;
      } else if (types.length > 1) {
        result.type = `BatchWithdraw(${types.length})`;
      } else {
        result.type = types[0] || "Withdraw";
      }
      
      const firstMsg = messages[0];
      result.delegator = firstMsg.delegator_address || firstMsg.delegator;
      result.validator = firstMsg.validator_address || messages.find(m => m.validator_address)?.validator_address;
      result.sender = result.delegator;
      
      // Extract TOTAL amount and recipient from events/logs
      this.enhanceWithdrawData(txResponse, result);
      
      return result;
    }

    // Case B: Batch IBC Update
    if (uniqueTypes.every(t => t?.includes("UpdateClient"))) {
      result.type = `BatchUpdateClient(${types.length})`;
      result.sender = messages[0].signer;
      result.amount = "IBC Update";
      return result;
    }

    // Case C: Default Batch
    result.type = types[0] || "BatchTx";
    this.extractByPattern(messages[0], result);
    
    if (!result.amount) {
      result.amount = this.extractAmountFromLogs(txResponse.logs);
    }
    if (!result.recipient) {
      result.recipient = this.extractRecipientFromEvents(txResponse.events) || 
                        this.extractRecipientFromLogs(txResponse.logs);
    }

    return result;
  }

  /**
   * CRITICAL FIX: Enhance Withdraw transactions with data from events
   * This handles both single and batch withdrawals
   */
  private static enhanceWithdrawData(txResponse: any, result: ParsedTx): void {
    const events: Event[] = txResponse.events || [];
    
    let totalRewardAmount = BigInt(0);
    let totalCommissionAmount = BigInt(0);
    let denom = "";
    
    // Extract amounts from specific event types
    for (const event of events) {
      if (event.type === "withdraw_rewards") {
        const amountAttr = event.attributes?.find(a => a.key === "amount");
        if (amountAttr?.value) {
          const matches = amountAttr.value.match(/(\d+)([a-zA-Z]+)/);
          if (matches) {
            totalRewardAmount += BigInt(matches[1]);
            if (!denom) denom = matches[2];
          }
        }
        
        // Also extract validator and delegator if not set
        if (!result.validator) {
          const valAttr = event.attributes?.find(a => a.key === "validator");
          if (valAttr?.value) result.validator = valAttr.value;
        }
        if (!result.delegator) {
          const delAttr = event.attributes?.find(a => a.key === "delegator");
          if (delAttr?.value) result.delegator = delAttr.value;
        }
      }
      
      if (event.type === "withdraw_commission") {
        const amountAttr = event.attributes?.find(a => a.key === "amount");
        if (amountAttr?.value) {
          const matches = amountAttr.value.match(/(\d+)([a-zA-Z]+)/);
          if (matches) {
            totalCommissionAmount += BigInt(matches[1]);
            if (!denom) denom = matches[2];
          }
        }
      }
    }
    
    // Calculate total amount
    const grandTotal = totalRewardAmount + totalCommissionAmount;
    
    if (grandTotal > 0) {
      // Format amount display based on what was withdrawn
      if (totalRewardAmount > 0 && totalCommissionAmount > 0) {
        result.amount = `${grandTotal.toString()}${denom} (R:${totalRewardAmount.toString()}+C:${totalCommissionAmount.toString()})`;
      } else {
        result.amount = `${grandTotal.toString()}${denom}`;
      }
    }
    
    // Extract recipient from transfer events
    if (!result.recipient) {
      result.recipient = this.extractRecipientFromEvents(events);
    }
  }

  /**
   * Extract recipient from events (used for withdrawals)
   */
  private static extractRecipientFromEvents(events: Event[]): string | null {
    if (!events || !Array.isArray(events)) return null;
    
    // Priority order: transfer > coin_received
    for (const event of events) {
      if (event.type === "transfer") {
        const recipientAttr = event.attributes?.find(a => a.key === "recipient");
        if (recipientAttr?.value) {
          // Skip fee collector addresses
          if (!recipientAttr.value.includes("17xpfvakm2amg962yls6f84z3kell8c5l")) {
            return recipientAttr.value;
          }
        }
      }
      
      if (event.type === "coin_received") {
        const receiverAttr = event.attributes?.find(a => a.key === "receiver");
        if (receiverAttr?.value) {
          // Skip fee collector addresses
          if (!receiverAttr.value.includes("17xpfvakm2amg962yls6f84z3kell8c5l")) {
            return receiverAttr.value;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Core Logic: Extract data based on known Cosmos SDK field patterns
   */
  private static extractByPattern(msg: RawMessage, result: ParsedTx): void {
    
    // 1. AMOUNT PATTERNS
    if (msg.amount) {
      if (Array.isArray(msg.amount)) {
        result.amount = msg.amount[0] ? `${msg.amount[0].amount}${msg.amount[0].denom}` : null;
      } else if (msg.amount.amount && msg.amount.denom) {
        result.amount = `${msg.amount.amount}${msg.amount.denom}`;
      }
    }
    if (msg.token && msg.token.amount && msg.token.denom) {
      result.amount = `${msg.token.amount}${msg.token.denom}`;
    }
    if (msg.value && msg.value.amount && msg.value.denom) {
      result.amount = `${msg.value.amount}${msg.value.denom}`;
    }

    if (result.type.includes("RecvPacket") || msg["@type"]?.includes("RecvPacket")) {
      if (msg.packet && msg.packet.data) {
        try {
          const buff = Buffer.from(msg.packet.data, 'base64');
          const decoded = JSON.parse(buff.toString('utf-8'));
          
          if (decoded.receiver) result.recipient = decoded.receiver;
          if (decoded.sender) result.sender = decoded.sender;
          if (decoded.amount && decoded.denom) {
             result.amount = `${decoded.amount}${decoded.denom}`;
          }
          result.type = "IBC Receive"; 
          return;
        } catch (e) { /* ignore */ }
      }
    }

    // 2. SENDER MAPPING
    result.sender = 
      msg.from_address ||
      msg.sender ||
      msg.signer ||
      msg.voter ||
      msg.granter ||
      msg.depositor ||
      msg.proposer ||
      msg.delegator_address ||
      msg.executor;

    // 3. RECIPIENT MAPPING
    result.recipient = 
      msg.to_address || 
      msg.receiver || 
      msg.recipient ||
      msg.grantee;

    // Handle MultiSend
    if (msg.inputs && msg.outputs) {
      result.sender = msg.inputs[0]?.address;
      result.recipient = msg.outputs[0]?.address;
      const amt = msg.inputs[0]?.coins?.[0];
      if (amt) result.amount = `${amt.amount}${amt.denom}`;
    }

    // 4. VALIDATOR SPECIFIC
    result.delegator = 
      msg.delegator_address || 
      msg.delegator || 
      msg.voter || 
      msg.grantee || 
      msg.depositor ||
      msg.sender;

    result.validator = 
      msg.validator_address || 
      msg.validator_src_address || 
      msg.validator_addr ||
      msg.source_validator;
      
    result.dstValidator = 
      msg.validator_dst_address || 
      msg.destination_validator;

    // 5. GOVERNANCE
    if (msg.proposal_id) {
      if (msg.option) {
        const option = this.parseVoteOption(msg.option);
        result.amount = `Prop #${msg.proposal_id}: ${option}`;
      }
    }

    // 6. SPECIAL CASES
    if (result.type.includes("Unjail")) {
      result.amount = "Unjail";
    }

    // 7. AUTHZ EXEC (Nested Messages)
    if (result.type.includes("Exec") && msg.msgs && Array.isArray(msg.msgs)) {
      const meaningfulMsg = msg.msgs.find((m: any) => {
        const t = (m["@type"] || "").toLowerCase();
        return t.includes("delegate") || t.includes("send") || t.includes("transfer");
      }) || msg.msgs[0];

      if (meaningfulMsg) {
        const rawInnerType = meaningfulMsg["@type"] || "";
        const innerTypeClean = rawInnerType.split(".").pop()?.replace("Msg", "") || "InnerTx";
        result.type = `Exec/${innerTypeClean}`;

        if (meaningfulMsg.amount) {
          if (Array.isArray(meaningfulMsg.amount)) {
             const coin = meaningfulMsg.amount[0];
             result.amount = `${coin.amount}${coin.denom}`;
          } else if (meaningfulMsg.amount.amount && meaningfulMsg.amount.denom) {
             result.amount = `${meaningfulMsg.amount.amount}${meaningfulMsg.amount.denom}`;
          }
        } else if (meaningfulMsg.value && meaningfulMsg.value.amount) {
           result.amount = `${meaningfulMsg.value.amount}${meaningfulMsg.value.denom}`;
        }

        if (meaningfulMsg.delegator_address) result.delegator = meaningfulMsg.delegator_address;
        if (meaningfulMsg.validator_address) result.validator = meaningfulMsg.validator_address;
        if (meaningfulMsg.from_address) result.sender = meaningfulMsg.from_address;
        if (meaningfulMsg.to_address) result.recipient = meaningfulMsg.to_address;
      }
    }
  }

  private static parseVoteOption(option: any): string {
    const opts = ["EMPTY", "YES", "ABSTAIN", "NO", "NO_WITH_VETO"];
    
    if (typeof option === 'string') {
      const cleaned = option.replace("VOTE_OPTION_", "");
      return opts.includes(cleaned) ? cleaned : option;
    }
    
    const index = Number(option);
    return opts[index] || "UNKNOWN";
  }

  /**
   * Extract Amount from Event Logs (Aggregates multiple coins)
   */
  private static extractAmountFromLogs(logs: RawLog[]): string | null {
    if (!logs || !Array.isArray(logs)) return null;
    
    let totalAmount = BigInt(0);
    let denom = "";
    let found = false;

    for (const log of logs) {
      const events = log.events || [];
      
      for (const event of events) {
        // Withdraw rewards/commission
        if (event.type === "withdraw_rewards" || event.type === "withdraw_commission") {
          const amountAttr = event.attributes?.find(a => a.key === "amount");
          if (amountAttr && amountAttr.value) {
            const parts = amountAttr.value.split(",");
            
            for (const coinStr of parts) {
              const matches = coinStr.match(/(\d+)([a-zA-Z]+)/);
              if (matches) {
                totalAmount += BigInt(matches[1]);
                if (!denom) denom = matches[2];
                found = true;
              }
            }
          }
        }
        
        // Transfer / IBC Coin Received
        if (event.type === "transfer" || event.type === "coin_received") {
          const amountAttr = event.attributes?.find(a => a.key === "amount");
          if (amountAttr && amountAttr.value) {
             return amountAttr.value;
          }
        }
      }
    }
    
    return found && totalAmount > 0 ? `${totalAmount.toString()}${denom}` : null;
  }

  /**
   * Extract Recipient from Event Logs (Crucial for Withdrawal Address)
   */
  private static extractRecipientFromLogs(logs: RawLog[]): string | null {
    if (!logs || !Array.isArray(logs)) return null;
    
    for (const log of logs) {
      const events = log.events || [];
      
      for (const event of events) {
        // Transfer
        if (event.type === "transfer") {
          const recipientAttr = event.attributes?.find(a => a.key === "recipient");
          if (recipientAttr?.value) return recipientAttr.value;
        }

        // IBC / Withdrawal
        if (event.type === "coin_received") {
          const receiverAttr = event.attributes?.find(a => a.key === "receiver");
          if (receiverAttr?.value) return receiverAttr.value;
        }

        // Withdraw Rewards
        if (event.type === "withdraw_rewards" || event.type === "withdraw_commission") {
          const recipientAttr = event.attributes?.find(a => 
            a.key === "recipient" || a.key === "withdraw_address"
          );
          if (recipientAttr?.value) return recipientAttr.value;
        }
      }
    }
    
    return null;
  }
}