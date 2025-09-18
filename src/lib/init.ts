import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger';

export function ensureDataDirectory(): string {
  const dataPath = process.env.SQLITE_PATH || './data/e2e.db';
  const dataDir = dataPath.replace(/\/[^\/]+$/, ''); // Enlever le nom du fichier

  if (!existsSync(dataDir)) {
    try {
      mkdirSync(dataDir, { recursive: true });
      logger.info(`Created data directory: ${dataDir}`);
    } catch (error: any) {
      logger.error(`Failed to create data directory ${dataDir}:`, error.message);
      throw new Error(`Failed to create data directory: ${error.message}`);
    }
  } else {
    logger.info(`Data directory exists: ${dataDir}`);
  }

  return dataDir;
}

export function ensureLogsDirectory(): string {
  const logFile = process.env.LOG_FILE || 'logs/bot.log';
  const logsDir = logFile.replace(/\/[^\/]+$/, ''); // Enlever le nom du fichier

  if (!existsSync(logsDir)) {
    try {
      mkdirSync(logsDir, { recursive: true });
      logger.info(`Created logs directory: ${logsDir}`);
    } catch (error: any) {
      logger.error(`Failed to create logs directory ${logsDir}:`, error.message);
      throw new Error(`Failed to create logs directory: ${error.message}`);
    }
  } else {
    logger.info(`Logs directory exists: ${logsDir}`);
  }

  return logsDir;
}

export function initializeDirectories(): void {
  logger.info('Initializing required directories...');
  
  try {
    ensureDataDirectory();
    ensureLogsDirectory();
    logger.info('✅ All directories initialized successfully');
  } catch (error: any) {
    logger.error('❌ Failed to initialize directories:', error.message);
    throw error;
  }
}
