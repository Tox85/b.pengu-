/**
 * Configuration centralisée de l'environnement avec valeurs par défaut
 */

import { z } from 'zod';

// Schéma de validation des variables d'environnement
const envSchema = z.object({
  // Core
  MNEMONIC: z.string().min(1, 'MNEMONIC est requis').default('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),
  LIFI_API_KEY: z.string().optional(),
  ETHEREUM_RPC_URL: z.string().url().default('http://127.0.0.1:8545'),
  POLYGON_RPC_URL: z.string().url().default('http://127.0.0.1:8545'),
  ABSTRACT_RPC_URL: z.string().url().default('http://127.0.0.1:8545'),
  SOLANA_RPC_URL: z.string().url().default('http://127.0.0.1:8899'),
  
  // Flags avec valeurs par défaut
  ENABLE_CEX: z.string().default('false').transform(val => val === 'true'),
  ENABLE_EX_ORCHESTRATOR: z.string().default('false').transform(val => val === 'true'),
  ENABLE_IDEMPOTENCY: z.string().default('true').transform(val => val === 'true'),
  ENABLE_CIRCUIT_BREAKER: z.string().default('true').transform(val => val === 'true'),
  DRY_RUN: z.string().default('true').transform(val => val === 'true'),
  SIGN_ONLY: z.string().default('false').transform(val => val === 'true'),
  USE_SIMULATION_RPC: z.string().default('true').transform(val => val === 'true'),
  
  // CEX (optionnels)
  BYBIT_API_KEY: z.string().optional(),
  BYBIT_API_SECRET: z.string().optional(),
  BINANCE_API_KEY: z.string().optional(),
  BINANCE_API_SECRET: z.string().optional(),
  
  // Logging
  LOG_LEVEL: z.string().default('info'),
  NODE_ENV: z.string().default('development'),
});

// Validation et parsing des variables d'environnement
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Erreur de configuration des variables d\'environnement:');
    if (error instanceof z.ZodError) {
      error.errors?.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    process.exit(1);
  }
};

export const env = parseEnv();

// Export des flags principaux pour faciliter l'usage
export const ENABLE_CEX = env.ENABLE_CEX;
export const DRY_RUN = env.DRY_RUN;
export const SIGN_ONLY = env.SIGN_ONLY;
export const USE_SIMULATION_RPC = env.USE_SIMULATION_RPC;
export const ENABLE_IDEMPOTENCY = env.ENABLE_IDEMPOTENCY;
export const ENABLE_CIRCUIT_BREAKER = env.ENABLE_CIRCUIT_BREAKER;

// Export de la configuration complète
export const config = {
  mnemonic: env.MNEMONIC,
  bot: {
    totalWallets: 100,
  },
  rpc: {
    solana: env.SOLANA_RPC_URL,
    ethereum: env.ETHEREUM_RPC_URL,
    polygon: env.POLYGON_RPC_URL,
    abstract: env.ABSTRACT_RPC_URL,
  },
  flags: {
    ENABLE_CEX: env.ENABLE_CEX,
    DRY_RUN: env.DRY_RUN,
    SIGN_ONLY: env.SIGN_ONLY,
    USE_SIMULATION_RPC: env.USE_SIMULATION_RPC,
    ENABLE_IDEMPOTENCY: env.ENABLE_IDEMPOTENCY,
    ENABLE_CIRCUIT_BREAKER: env.ENABLE_CIRCUIT_BREAKER,
  },
  lifiApiKey: env.LIFI_API_KEY,
  jupiter: {
    penguMint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
    apiUrl: 'https://quote-api.jup.ag/v6',
    tokensUrl: 'https://tokens.jup.ag/v2',
  },
  tokens: {
    usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    penguMint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
  },
  monitoring: {
    intervalMs: 5000,
  },
  amounts: {
    minWithdrawal: 0.01,
    defaultSlippageBps: 300,
  },
};

// Validation des clés CEX si ENABLE_CEX=true
if (ENABLE_CEX) {
  if (!env.BYBIT_API_KEY || !env.BYBIT_API_SECRET) {
    console.warn('⚠️  ENABLE_CEX=true mais clés Bybit manquantes');
  }
  if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
    console.warn('⚠️  ENABLE_CEX=true mais clés Binance manquantes');
  }
}

// Log de la configuration active
console.log('🔧 Configuration active:', {
  ENABLE_CEX,
  DRY_RUN,
  SIGN_ONLY,
  USE_SIMULATION_RPC,
  ENABLE_IDEMPOTENCY,
  ENABLE_CIRCUIT_BREAKER,
  NODE_ENV: env.NODE_ENV,
  LOG_LEVEL: env.LOG_LEVEL,
});
