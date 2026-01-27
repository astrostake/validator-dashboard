import { logger } from "./logger";

/**
 * Normalizes amount string and calculates USD value based on decimals and price
 */
export function calculateUsdValue(
  amountStr: string | null, 
  decimals: number, 
  price: number
): number {
  if (!amountStr || amountStr === 'Failed') return 0;
  
  // Extract number from string (e.g., "1000ulume" -> 1000)
  const match = amountStr.match(/^([\d\.]+)/);
  if (!match) return 0;
  
  const rawQty = parseFloat(match[1]);
  const tokenQty = rawQty / Math.pow(10, decimals);
  
  return tokenQty * price;
}

export const formatToken = (amount: string | number, decimals: number): number => {
  if (!amount) return 0;
  return Number(amount) / Math.pow(10, decimals);
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: unknown;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        logger.warn(`Retry ${i + 1}/${maxRetries} failed. Retrying in ${delay}ms...`, error);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

export const normalizeRestUrl = (url: string): string => {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url.replace(/\/$/, '');
};