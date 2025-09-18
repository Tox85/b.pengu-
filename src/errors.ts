/**
 * Gestion des erreurs et classification
 */

export class PenguBotError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly deterministic: boolean;

  constructor(
    message: string,
    code: string,
    retryable: boolean = false,
    deterministic: boolean = false
  ) {
    super(message);
    this.name = 'PenguBotError';
    this.code = code;
    this.retryable = retryable;
    this.deterministic = deterministic;
  }
}

export class ExchangeError extends PenguBotError {
  constructor(message: string, exchange: string, retryable: boolean = false) {
    super(message, `EXCHANGE_${exchange.toUpperCase()}`, retryable);
    this.name = 'ExchangeError';
  }
}

export class BridgeError extends PenguBotError {
  constructor(message: string, retryable: boolean = false) {
    super(message, 'BRIDGE_ERROR', retryable);
    this.name = 'BridgeError';
  }
}

export class TradingError extends PenguBotError {
  constructor(message: string, retryable: boolean = false) {
    super(message, 'TRADING_ERROR', retryable);
    this.name = 'TradingError';
  }
}

export class LiquidityError extends PenguBotError {
  constructor(message: string, retryable: boolean = false) {
    super(message, 'LIQUIDITY_ERROR', retryable);
    this.name = 'LiquidityError';
  }
}

export class WalletError extends PenguBotError {
  constructor(message: string, retryable: boolean = false) {
    super(message, 'WALLET_ERROR', retryable);
    this.name = 'WalletError';
  }
}

export class ConfigurationError extends PenguBotError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR', false, true);
    this.name = 'ConfigurationError';
  }
}

/**
 * Vérifie si une erreur est retryable
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof PenguBotError) {
    return error.retryable;
  }

  // Erreurs réseau
  if (error.message.includes('timeout') || 
      error.message.includes('ECONNRESET') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ECONNREFUSED')) {
    return true;
  }

  // Erreurs de rate limit
  if (error.message.includes('rate limit') ||
      error.message.includes('429') ||
      error.message.includes('Too Many Requests')) {
    return true;
  }

  // Erreurs de serveur
  if (error.message.includes('500') ||
      error.message.includes('502') ||
      error.message.includes('503') ||
      error.message.includes('504')) {
    return true;
  }

  return false;
}

/**
 * Vérifie si une erreur est déterministe
 */
export function isDeterministicError(error: Error): boolean {
  if (error instanceof PenguBotError) {
    return error.deterministic;
  }

  // Erreurs de validation
  if (error.message.includes('invalid') ||
      error.message.includes('validation') ||
      error.message.includes('required') ||
      error.message.includes('missing')) {
    return true;
  }

  // Erreurs d'autorisation
  if (error.message.includes('unauthorized') ||
      error.message.includes('forbidden') ||
      error.message.includes('401') ||
      error.message.includes('403')) {
    return true;
  }

  // Erreurs de solde insuffisant
  if (error.message.includes('insufficient') ||
      error.message.includes('balance') ||
      error.message.includes('funds')) {
    return true;
  }

  return false;
}

/**
 * Mappe les erreurs d'exchange
 */
export function mapExchangeError(error: any, exchange: string): PenguBotError {
  const message = error.message || error.toString();
  
  // Erreurs de solde insuffisant
  if (message.includes('insufficient') || message.includes('balance')) {
    return new ExchangeError(`Solde insuffisant sur ${exchange}`, exchange, false);
  }

  // Erreurs de rate limit
  if (message.includes('rate limit') || message.includes('429')) {
    return new ExchangeError(`Rate limit atteint sur ${exchange}`, exchange, true);
  }

  // Erreurs de réseau
  if (message.includes('timeout') || message.includes('network')) {
    return new ExchangeError(`Erreur réseau sur ${exchange}`, exchange, true);
  }

  // Erreurs d'autorisation
  if (message.includes('unauthorized') || message.includes('401')) {
    return new ExchangeError(`Erreur d'autorisation sur ${exchange}`, exchange, false);
  }

  // Erreurs de validation
  if (message.includes('invalid') || message.includes('validation')) {
    return new ExchangeError(`Erreur de validation sur ${exchange}`, exchange, false);
  }

  // Erreur générique
  return new ExchangeError(`Erreur sur ${exchange}: ${message}`, exchange, true);
}

/**
 * Mappe les erreurs de bridge
 */
export function mapBridgeError(error: any): BridgeError {
  const message = error.message || error.toString();
  
  if (message.includes('timeout') || message.includes('network')) {
    return new BridgeError(`Erreur réseau lors du bridge: ${message}`, true);
  }

  if (message.includes('insufficient') || message.includes('balance')) {
    return new BridgeError(`Solde insuffisant pour le bridge: ${message}`, false);
  }

  if (message.includes('slippage') || message.includes('price')) {
    return new BridgeError(`Erreur de slippage lors du bridge: ${message}`, false);
  }

  return new BridgeError(`Erreur de bridge: ${message}`, true);
}

/**
 * Mappe les erreurs de trading
 */
export function mapTradingError(error: any): TradingError {
  const message = error.message || error.toString();
  
  if (message.includes('slippage') || message.includes('price')) {
    return new TradingError(`Erreur de slippage lors du trading: ${message}`, false);
  }

  if (message.includes('insufficient') || message.includes('balance')) {
    return new TradingError(`Solde insuffisant pour le trading: ${message}`, false);
  }

  if (message.includes('timeout') || message.includes('network')) {
    return new TradingError(`Erreur réseau lors du trading: ${message}`, true);
  }

  return new TradingError(`Erreur de trading: ${message}`, true);
}

/**
 * Mappe les erreurs de liquidité
 */
export function mapLiquidityError(error: any): LiquidityError {
  const message = error.message || error.toString();
  
  if (message.includes('tick') || message.includes('range')) {
    return new LiquidityError(`Erreur de plage de prix: ${message}`, false);
  }

  if (message.includes('insufficient') || message.includes('balance')) {
    return new LiquidityError(`Solde insuffisant pour la liquidité: ${message}`, false);
  }

  if (message.includes('timeout') || message.includes('network')) {
    return new LiquidityError(`Erreur réseau lors de la liquidité: ${message}`, true);
  }

  return new LiquidityError(`Erreur de liquidité: ${message}`, true);
}