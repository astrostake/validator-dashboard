// src/utils/logger.ts

const getTimestamp = () => new Date().toISOString();

const formatMeta = (meta: unknown): string => {
  if (meta === undefined || meta === null) return '';
  if (meta instanceof Error) return meta.stack || meta.message;
  
  try {

    if (typeof meta === 'object') {
      return JSON.stringify(meta);
    }

    return String(meta);
  } catch (e) {
    return '[Circular or Invalid Data]';
  }
};

export const logger = {
  info: (message: string, meta?: unknown) => {
    console.log(`[${getTimestamp()}] [INFO] ${message} ${formatMeta(meta)}`);
  },

  warn: (message: string, meta?: unknown) => {
    console.warn(`[${getTimestamp()}] [WARN] ${message} ${formatMeta(meta)}`);
  },

  error: (message: string, error?: unknown) => {
    console.error(`[${getTimestamp()}] [ERROR] ${message} ${formatMeta(error)}`);
  },

  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG === 'true') {
      console.debug(`[${getTimestamp()}] [DEBUG] ${message} ${formatMeta(meta)}`);
    }
  }
};