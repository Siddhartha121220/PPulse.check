/**
 * Logger
 *
 * Structured logging for the rPPG pipeline.
 * Provides leveled logging with timestamps and module tags.
 *
 * In production builds, only WARN and ERROR are emitted.
 * In development, all levels are active.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

let minimumLevel: LogLevel = __DEV__ ? 'DEBUG' : 'WARN';

/**
 * Set the minimum log level. Messages below this level are silenced.
 */
export function setLogLevel(level: LogLevel): void {
  minimumLevel = level;
}

/**
 * Create a tagged logger for a specific module.
 *
 * Usage:
 *   const log = createLogger('PipelineController');
 *   log.info('Pipeline started', { mode: 'standard' });
 *   log.error('Face detection failed', { error: e.message });
 */
export function createLogger(tag: string) {
  function shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minimumLevel];
  }

  function formatMessage(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
    const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level}] [${tag}] ${message}${dataStr}`;
  }

  return {
    debug(message: string, data?: unknown): void {
      if (shouldLog('DEBUG')) {
        console.log(formatMessage('DEBUG', message, data));
      }
    },

    info(message: string, data?: unknown): void {
      if (shouldLog('INFO')) {
        console.log(formatMessage('INFO', message, data));
      }
    },

    warn(message: string, data?: unknown): void {
      if (shouldLog('WARN')) {
        console.warn(formatMessage('WARN', message, data));
      }
    },

    error(message: string, data?: unknown): void {
      if (shouldLog('ERROR')) {
        console.error(formatMessage('ERROR', message, data));
      }
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
