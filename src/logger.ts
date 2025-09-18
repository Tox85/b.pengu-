// Logger simple pour éviter les problèmes de types Pino
interface LogLevel {
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
}

class SimpleLogger implements LogLevel {
  private level: string;

  constructor(level: string = 'info') {
    this.level = level;
  }

  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(this.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (data && typeof data === 'object') {
      return `${prefix} ${message} ${JSON.stringify(data, null, 2)}`;
    }
    
    return `${prefix} ${message}`;
  }

  error(message: string, data?: any): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, data));
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, data));
    }
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, data));
    }
  }

  child(module: { module: string }): SimpleLogger {
    const childLogger = new SimpleLogger(this.level);
    const originalFormatMessage = childLogger.formatMessage.bind(childLogger);
    
    childLogger.formatMessage = (level: string, message: string, data?: any) => {
      const baseMessage = originalFormatMessage(level, message, data);
      return baseMessage.replace('] ', `] [${module.module}] `);
    };
    
    return childLogger;
  }
}

// Créer les loggers
const logLevel = process.env['NODE_ENV'] === 'test' ? 'silent' : (process.env['LOG_LEVEL'] || 'info');
export const logger = new SimpleLogger(logLevel);

// Logger spécialisé pour les wallets
export const walletLogger = logger.child({ module: 'wallet' });

// Logger spécialisé pour les exchanges
export const exchangeLogger = logger.child({ module: 'exchange' });

// Logger spécialisé pour le bridge
export const bridgeLogger = logger.child({ module: 'bridge' });

// Logger spécialisé pour le trading
export const tradingLogger = logger.child({ module: 'trading' });

// Logger spécialisé pour la liquidité
export const liquidityLogger = logger.child({ module: 'liquidity' });

// Logger spécialisé pour le monitoring
export const monitorLogger = logger.child({ module: 'monitor' });

// Fonction utilitaire pour logger les erreurs avec contexte
export function logError(error: Error, context: Record<string, any> = {}) {
  logger.error('Erreur détectée', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  });
}

// Fonction utilitaire pour logger les actions importantes
export function logAction(action: string, data: Record<string, any> = {}) {
  logger.info(`Action: ${action}`, data);
}