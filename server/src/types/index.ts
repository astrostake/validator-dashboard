import { 
  Wallet as PrismaWallet, 
  Chain as PrismaChain, 
  WalletTransaction as PrismaWalletTx, 
  ValidatorTransaction as PrismaValidatorTx 
} from "@prisma/client";

// --- Configuration Types ---

export interface ChainConfig {
  name: string;
  rpc: string;
  rest: string;
  denom: string;
  decimals: number;
  coingeckoId?: string;
}

// --- API & Response Types ---

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface DashboardStats {
  available: number;
  staked: number;
  rewards: number;
  commission: number;
  totalUsd: number;
}

export interface ParsedTx {
  type: string;
  amount: string | null;
  sender: string | null;
  recipient: string | null;
  delegator: string | null;
  validator: string | null;
  dstValidator: string | null;
  timestamp: Date;
  height: number;
  hash: string;
}

// --- Domain Models (Extending Prisma) ---

export type Wallet = PrismaWallet & { chain?: PrismaChain };
export type Chain = PrismaChain;

// --- Transaction Categories (Business Logic) ---

export type ValidatorCategory = 'own' | 'incoming';
export type TransactionCategory = 'wallet' | 'staking' | 'validator';

// Extend Prisma types with UI-specific fields
export type WalletTxWithCategory = PrismaWalletTx & { 
  txCategory: 'wallet';
  priceAnalysis?: any; 
};

export type ValidatorTxWithCategory = PrismaValidatorTx & { 
  txCategory: 'staking' | 'validator';
  priceAnalysis?: any;
};

export type TransactionWithCategory = WalletTxWithCategory | ValidatorTxWithCategory;

// --- Type Guards ---

export function isWalletTransaction(tx: TransactionWithCategory): tx is WalletTxWithCategory {
  return tx.txCategory === 'wallet';
}

export function isValidatorTransaction(tx: TransactionWithCategory): tx is ValidatorTxWithCategory {
  return tx.txCategory === 'staking' || tx.txCategory === 'validator';
}