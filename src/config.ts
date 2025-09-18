import { z } from 'zod';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

// Schéma de validation pour la configuration
const configSchema = z.object({
  // Mnemonic et sécurité
  mnemonic: z.string().min(1, 'Mnemonic requis'),
  
  // Feature flags
  features: z.object({
    enableCex: z.boolean().default(false),
    enableExOrchestrator: z.boolean().default(false),
    enableIdempotency: z.boolean().default(false),
    enableCircuitBreaker: z.boolean().default(false),
    dryRun: z.boolean().default(false),
    signOnly: z.boolean().default(false),
  }),
  
  // Configuration des exchanges (optionnel si ENABLE_CEX=false)
  exchanges: z.object({
    bybit: z.object({
      apiKey: z.string().optional(),
      secret: z.string().optional(),
    }),
    binance: z.object({
      apiKey: z.string().optional(),
      secret: z.string().optional(),
    }),
  }),
  
  // Configuration Li.Fi
  lifi: z.object({
    apiKey: z.string().optional(),
  }),
  
  // Configuration Jupiter
  jupiter: z.object({
    apiKey: z.string().optional(),
    penguMint: z.string().min(1, 'PENGU mint address requis'),
  }),
  
  // Configuration des tokens
  tokens: z.object({
    usdcMint: z.string().min(1, 'USDC mint address requis'),
    penguMint: z.string().min(1, 'PENGU mint address requis'),
    usdcEth: z.string().optional(),
  }),
  
  // Configuration des mints (alias pour compatibilité)
  PENGU_MINT: z.string().min(1, 'PENGU mint address requis'),
  USDC_MINT: z.string().min(1, 'USDC mint address requis'),
  
  // Configuration bridge/trading
  bridge: z.object({
    preferredTool: z.enum(['cctp', 'mayan', 'stargate']).default('cctp'),
    feeThresholdPct: z.number().min(0).max(100, 'Seuil de frais doit être entre 0 et 100').default(3),
    allowedSlippageBps: z.number().min(0).max(10000, 'Slippage doit être entre 0 et 10000 bps').default(300),
  }),
  
  // Configuration des limites E2E
  limits: z.object({
    maxBridgeFeePct: z.number().min(0).max(1, 'Frais de bridge max doivent être entre 0 et 1'),
    maxSlippagePct: z.number().min(0).max(1, 'Slippage max doit être entre 0 et 1'),
    e2eWallets: z.number().int().positive('Nombre de wallets E2E doit être positif'),
  }),
  
  // Mapping des tokens CEX
  coinNetworkMap: z.object({
    USDC: z.object({
      bybit: z.string().min(1, 'Network Bybit USDC requis'),
      binance: z.string().min(1, 'Network Binance USDC requis'),
    }),
  }),
  
  // RPC Endpoints
  rpc: z.object({
    ethereum: z.string().url('URL RPC Ethereum invalide'),
    ethereumWs: z.string().url('URL WebSocket Ethereum invalide'),
    bsc: z.string().url('URL RPC BSC invalide').optional(),
    bscWs: z.string().url('URL WebSocket BSC invalide').optional(),
    arbitrum: z.string().url('URL RPC Arbitrum invalide'),
    arbitrumWs: z.string().url('URL WebSocket Arbitrum invalide'),
    solana: z.string().url('URL RPC Solana invalide'),
    solanaWs: z.string().url('URL WebSocket Solana invalide'),
    solanaDevnet: z.string().url('URL RPC Solana Devnet invalide'),
    solanaDevnetWs: z.string().url('URL WebSocket Solana Devnet invalide'),
  }),
  
  // Configuration des montants
  amounts: z.object({
    minWithdrawal: z.number().positive('Montant minimum de retrait doit être positif'),
    maxWithdrawal: z.number().positive('Montant maximum de retrait doit être positif'),
    defaultSlippageBps: z.number().min(0).max(10000, 'Slippage doit être entre 0 et 10000 bps'),
    minSolBalance: z.number().positive('Balance SOL minimum doit être positive'),
    minUsdcBalance: z.number().positive('Balance USDC minimum doit être positive'),
  }),
  
  // Configuration de la liquidité
  liquidity: z.object({
    lowerPct: z.number().min(0).max(100, 'Pourcentage inférieur doit être entre 0 et 100'),
    upperPct: z.number().min(0).max(100, 'Pourcentage supérieur doit être entre 0 et 100'),
    positionSizeUsdc: z.number().positive('Taille de position USDC doit être positive'),
  }),
  
  // Configuration du monitoring
  monitoring: z.object({
    intervalMs: z.number().positive('Intervalle de monitoring doit être positif'),
    rebalanceThresholdPct: z.number().min(0).max(100, 'Seuil de rééquilibrage doit être entre 0 et 100'),
    rechargeThresholdUsdc: z.number().positive('Seuil de recharge USDC doit être positif'),
  }),
  
  // Configuration des logs
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']),
    file: z.string().optional(),
  }),
  
  // Configuration du bot
  bot: z.object({
    totalWallets: z.number().int().positive('Nombre total de wallets doit être positif'),
    batchSize: z.number().int().positive('Taille de batch doit être positive'),
    randomDelayMinMs: z.number().int().min(0, 'Délai minimum doit être positif ou nul'),
    randomDelayMaxMs: z.number().int().positive('Délai maximum doit être positif'),
  }),
});

// Types dérivés du schéma
export type Config = z.infer<typeof configSchema>;

// Fonction pour charger et valider la configuration
export function loadConfig(): Config {
  const rawConfig = {
    mnemonic: process.env['WALLET_MNEMONIC'] || process.env['MNEMONIC'] || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    
    features: {
      enableCex: process.env['ENABLE_CEX'] === 'true',
      enableExOrchestrator: process.env['ENABLE_EX_ORCHESTRATOR'] === 'true',
      enableIdempotency: process.env['ENABLE_IDEMPOTENCY'] === 'true',
      enableCircuitBreaker: process.env['ENABLE_CIRCUIT_BREAKER'] === 'true',
      dryRun: process.env['DRY_RUN'] === 'true',
      signOnly: process.env['SIGN_ONLY'] === 'true',
    },
    
    exchanges: {
      bybit: {
        apiKey: process.env['BYBIT_API_KEY'],
        secret: process.env['BYBIT_SECRET'],
      },
      binance: {
        apiKey: process.env['BINANCE_API_KEY'],
        secret: process.env['BINANCE_SECRET'],
      },
    },
    
    lifi: {
      apiKey: process.env['LIFI_API_KEY'],
    },
    
    jupiter: {
      apiKey: process.env['JUPITER_API_KEY'],
      penguMint: process.env['PENGU_MINT'] || '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
    },
    
    tokens: {
      usdcMint: process.env['USDC_MINT'] || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      penguMint: process.env['PENGU_MINT'] || '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
      usdcEth: process.env['USDC_ETH'] || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
    
    PENGU_MINT: process.env['PENGU_MINT'] || '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
    USDC_MINT: process.env['USDC_MINT'] || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    
    bridge: {
      preferredTool: (process.env['BRIDGE_PREFERRED_TOOL'] as 'cctp' | 'mayan' | 'stargate') || 'cctp',
      feeThresholdPct: parseFloat(process.env['FEE_THRESHOLD_PCT'] || '3'),
      allowedSlippageBps: parseInt(process.env['ALLOWED_SLIPPAGE_BPS'] || '300'),
    },
    
    limits: {
      maxBridgeFeePct: parseFloat(process.env['MAX_BRIDGE_FEE_PCT'] || '0.10'),
      maxSlippagePct: parseFloat(process.env['MAX_SLIPPAGE_PCT'] || '0.01'),
      e2eWallets: parseInt(process.env['E2E_WALLETS'] || '5'),
    },
    
    coinNetworkMap: {
      USDC: {
        bybit: process.env['USDC_BYBIT_NETWORK'] || 'USDC',
        binance: process.env['USDC_BINANCE_NETWORK'] || 'USDC',
      },
    },
    
    rpc: {
      ethereum: process.env['ETHEREUM_RPC_URL'] || 'https://mainnet.infura.io/v3/your_key',
      ethereumWs: process.env['ETHEREUM_WS_URL'] || 'wss://mainnet.infura.io/ws/v3/your_key',
      bsc: process.env['BSC_RPC_URL'],
      bscWs: process.env['BSC_WS_URL'],
      arbitrum: process.env['ARBITRUM_RPC_URL'] || 'https://arbitrum-mainnet.infura.io/v3/your_key',
      arbitrumWs: process.env['ARBITRUM_WS_URL'] || 'wss://arbitrum-mainnet.infura.io/ws/v3/your_key',
      solana: process.env['SOLANA_RPC_URL'] || 'https://api.mainnet-beta.solana.com',
      solanaWs: process.env['SOLANA_WS_URL'] || 'wss://api.mainnet-beta.solana.com',
      solanaDevnet: process.env['SOLANA_DEVNET_RPC_URL'] || 'https://api.devnet.solana.com',
      solanaDevnetWs: process.env['SOLANA_DEVNET_WS_URL'] || 'wss://api.devnet.solana.com',
    },
    
    amounts: {
      minWithdrawal: parseFloat(process.env['MIN_WITHDRAWAL_AMOUNT'] || '0.001'),
      maxWithdrawal: parseFloat(process.env['MAX_WITHDRAWAL_AMOUNT'] || '0.01'),
      defaultSlippageBps: parseInt(process.env['ALLOWED_SLIPPAGE_BPS'] || '300'),
      minSolBalance: parseFloat(process.env['MIN_SOL_BALANCE'] || '0.01'),
      minUsdcBalance: parseFloat(process.env['MIN_USDC_BALANCE'] || '2'),
    },
    
    liquidity: {
      lowerPct: parseFloat(process.env['LP_LOWER_PCT'] || '10'),
      upperPct: parseFloat(process.env['LP_UPPER_PCT'] || '10'),
      positionSizeUsdc: parseFloat(process.env['LP_POSITION_SIZE_USDC'] || '5'),
    },
    
    monitoring: {
      intervalMs: parseInt(process.env['MONITOR_INTERVAL_MS'] || '60000'),
      rebalanceThresholdPct: parseFloat(process.env['REBALANCE_THRESHOLD_PCT'] || '5'),
      rechargeThresholdUsdc: parseFloat(process.env['RECHARGE_THRESHOLD_USDC'] || '50'),
    },
    
    logging: {
      level: (process.env['LOG_LEVEL'] as 'error' | 'warn' | 'info' | 'debug') || 'info',
      file: process.env['LOG_FILE'],
    },
    
    bot: {
      totalWallets: parseInt(process.env['TOTAL_WALLETS'] || '5'),
      batchSize: parseInt(process.env['BATCH_SIZE'] || '10'),
      randomDelayMinMs: parseInt(process.env['RANDOM_DELAY_MIN_MS'] || '1000'),
      randomDelayMaxMs: parseInt(process.env['RANDOM_DELAY_MAX_MS'] || '5000'),
    },
  };

  // Validation et retour de la configuration
  return configSchema.parse(rawConfig);
}

// Configuration globale
export const config = loadConfig();