// Types communs pour le bot PENGU

export interface Wallet {
  index: number;
  address: string;
  privateKey: string;
  publicKey: string;
  evmAddress: string;
  evmPrivateKey: string;
}

export interface WalletBalance {
  walletIndex: number;
  address: string;
  sol: number;
  usdc: number;
  pengu: number;
  lastUpdated: Date;
}

export interface ExchangeConfig {
  apiKey: string;
  secret: string;
  sandbox?: boolean;
}

export interface RpcConfig {
  ethereum: string;
  ethereumWs: string;
  bsc: string;
  bscWs: string;
  arbitrum: string;
  arbitrumWs: string;
  solana: string;
  solanaWs: string;
  solanaDevnet: string;
  solanaDevnetWs: string;
}

export interface WithdrawalResult {
  success: boolean;
  txId?: string;
  amount: number;
  currency: string;
  toAddress: string;
  exchangeUsed?: string;
  selectedWallet?: Wallet;
  error?: string;
}

export interface BridgeQuote {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  tool: string;
  toolDetails: {
    key: string;
    name: string;
    logoURI: string;
  };
  gasCosts: Array<{
    type: string;
    price: string;
    gasPrice: string;
    gasLimit: string;
    balance: string;
    balanceUSD: string;
    token: {
      address: string;
      chainId: number;
      symbol: string;
      decimals: number;
      logoURI: string;
    };
  }>;
  steps: Array<{
    type: string;
    tool: string;
    toolDetails: {
      key: string;
      name: string;
      logoURI: string;
    };
    fromChain: string;
    toChain: string;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    toAmount: string;
    fromAddress: string;
    toAddress: string;
    gasCosts: Array<{
      type: string;
      price: string;
      gasPrice: string;
      gasLimit: string;
      balance: string;
      balanceUSD: string;
      token: {
        address: string;
        chainId: number;
        symbol: string;
        decimals: number;
        logoURI: string;
      };
    }>;
  }>;
}

export interface SwapQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      inAmount: string;
      outputMint: string;
      outAmount: string;
      notEnoughLiquidity: boolean;
      minInAmount: string;
      minOutAmount: string;
      priceImpactPct: string;
      lpFee?: {
        amount: string;
        mint: string;
        pct: number;
      };
      platformFee?: {
        amount: string;
        mint: string;
        pct: number;
      };
    };
    percent: number;
  }>;
}

export interface LiquidityPosition {
  positionId: string;
  poolId: string;
  lowerTick: number;
  upperTick: number;
  liquidity: string;
  tokenAmountA: string;
  tokenAmountB: string;
  feeOwedA: string;
  feeOwedB: string;
  rewardInfos: Array<{
    mint: string;
    vault: string;
    authority: string;
    rewardGrowthInside: string;
    rewardTotalEmissioned: string;
    rewardTotalUnclaimed: string;
    rewardLastUpdatedTime: string;
  }>;
}

export interface PoolInfo {
  address: string;
  whirlpoolsConfig: string;
  whirlpoolBump: number[];
  tickSpacing: number;
  tickSpacingSeed: number[];
  feeRate: number;
  protocolFeeRate: number;
  liquidity: string;
  sqrtPrice: string;
  tickCurrentIndex: number;
  protocolFeeOwedA: string;
  protocolFeeOwedB: string;
  tokenMintA: string;
  tokenVaultA: string;
  feeGrowthGlobalA: string;
  tokenMintB: string;
  tokenVaultB: string;
  feeGrowthGlobalB: string;
  rewardLastUpdatedTime: string;
  rewardInfos: Array<{
    mint: string;
    vault: string;
    authority: string;
    rewardGrowthInside: string;
    rewardTotalEmissioned: string;
    rewardTotalUnclaimed: string;
    rewardLastUpdatedTime: string;
  }>;
}

export interface RebalanceAction {
  type: 'swap' | 'add_liquidity' | 'remove_liquidity' | 'collect_fees';
  walletIndex: number;
  amount?: number;
  tokenA?: string;
  tokenB?: string;
  reason: string;
}

export interface BotState {
  wallets: Wallet[];
  balances: Map<number, WalletBalance>;
  positions: Map<number, LiquidityPosition[]>;
  lastWithdrawal: Map<number, Date>;
  lastRebalance: Map<number, Date>;
  totalFeesCollected: number;
  totalVolume: number;
  startTime: Date;
  isRunning: boolean;
}

export interface MonitoringMetrics {
  totalWallets: number;
  activeWallets: number;
  totalSolBalance: number;
  totalUsdcBalance: number;
  totalPenguBalance: number;
  activePositions: number;
  totalFeesCollected: number;
  averagePositionValue: number;
  lastUpdate: Date;
}

export type AlertType = 'connectivity' | 'balance' | 'liquidity' | 'performance' | 'risk' | 'error';
export type AlertLevel = 'info' | 'warn' | 'error' | 'critical';

// Constantes pour les tokens
export const TOKEN_ADDRESSES = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  PENGU: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv', // Adresse PENGU Solana officielle
  PENGU_ETH: '0xDEa8ef664cEF492C6E3fD0b3DDd4492930ec4832', // Adresse PENGU Ethereum
} as const;

// Constantes pour les chaînes
export const CHAIN_IDS = {
  ETHEREUM: 1,
  BSC: 56,
  SOLANA: 101,
} as const;

// Constantes pour les pools Orca
export const ORCA_POOLS = {
  PENGU_USDC: 'PENGU_USDC_POOL_ID_HERE', // À remplacer par l'ID du pool réel
} as const;
