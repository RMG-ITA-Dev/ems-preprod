/**
 * Development-only logging utility for EMS 2.0
 * Logs are only output in development mode (import.meta.env.DEV)
 */

const PREFIX = "[EMS]";

const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) {
      console.log(PREFIX, ...args);
    }
  },

  warn: (...args: unknown[]) => {
    if (isDev) {
      console.warn(PREFIX, ...args);
    }
  },

  error: (...args: unknown[]) => {
    // Always log errors, even in production
    console.error(PREFIX, ...args);
  },

  debug: (...args: unknown[]) => {
    if (isDev) {
      console.debug(PREFIX, ...args);
    }
  },
};
