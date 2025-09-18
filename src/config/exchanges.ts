/**
 * Configuration des exchanges avec feature flags
 */

export interface ExchangeConfig {
  enabled: boolean;
  priority: number;
  retryConfig: {
    maxRetries: number;
    baseMs: number;
    maxMs: number;
  };
  circuitBreaker: {
    failureThreshold: number;
    openMs: number;
    halfOpenMaxCalls: number;
  };
  idempotency: {
    enabled: boolean;
    ttlMs: number;
  };
}

export const EXCHANGE_CONFIG: Record<string, ExchangeConfig> = {
  bybit: {
    enabled: true,
    priority: 1,
    retryConfig: {
      maxRetries: parseInt(process.env.WITHDRAW_MAX_RETRIES || '3'),
      baseMs: parseInt(process.env.RETRY_BASE_MS || '200'),
      maxMs: parseInt(process.env.RETRY_MAX_MS || '1500'),
    },
    circuitBreaker: {
      failureThreshold: parseInt(process.env.CB_FAIL_THRESHOLD || '5'),
      openMs: parseInt(process.env.CB_OPEN_MS || '10000'),
      halfOpenMaxCalls: 1,
    },
    idempotency: {
      enabled: process.env.ENABLE_IDEMPOTENCY === 'true',
      ttlMs: 300000, // 5 minutes
    },
  },
  binance: {
    enabled: true,
    priority: 2,
    retryConfig: {
      maxRetries: parseInt(process.env.WITHDRAW_MAX_RETRIES || '3'),
      baseMs: parseInt(process.env.RETRY_BASE_MS || '200'),
      maxMs: parseInt(process.env.RETRY_MAX_MS || '1500'),
    },
    circuitBreaker: {
      failureThreshold: parseInt(process.env.CB_FAIL_THRESHOLD || '5'),
      openMs: parseInt(process.env.CB_OPEN_MS || '10000'),
      halfOpenMaxCalls: 1,
    },
    idempotency: {
      enabled: process.env.ENABLE_IDEMPOTENCY === 'true',
      ttlMs: 300000, // 5 minutes
    },
  },
};

export const FEATURE_FLAGS = {
  ENABLE_EX_ORCHESTRATOR: process.env.ENABLE_EX_ORCHESTRATOR === 'true',
  ENABLE_IDEMPOTENCY: process.env.ENABLE_IDEMPOTENCY === 'true',
  ENABLE_CIRCUIT_BREAKER: process.env.ENABLE_CIRCUIT_BREAKER === 'true',
} as const;

export function getExchangeConfig(exchange: string): ExchangeConfig {
  return EXCHANGE_CONFIG[exchange] || EXCHANGE_CONFIG.bybit;
}

export function isExchangeEnabled(exchange: string): boolean {
  return getExchangeConfig(exchange).enabled;
}

export function getEnabledExchanges(): string[] {
  return Object.entries(EXCHANGE_CONFIG)
    .filter(([_, config]) => config.enabled)
    .sort(([_, a], [__, b]) => a.priority - b.priority)
    .map(([name, _]) => name);
}
