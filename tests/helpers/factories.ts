import { jest } from 'vitest';
import { makeBybit, makeBinance } from '../mocks/ccxt';

/**
 * Helper pour créer un ExchangeManager avec injection de dépendances
 */
export const makeExchangeManager = (ExchangeManager: any, over: any = {}) => {
  return new ExchangeManager({ 
    bybit: makeBybit(), 
    binance: makeBinance(), 
    ...over 
  });
};

/**
 * Helper pour créer un botState initialisé pour les tests de monitoring
 */
export const fakeBotState = (n = 5) => ({
  wallets: Array.from({ length: n }, (_, i) => ({ 
    id: i, 
    index: i,
    address: `SolanaAddress${i}`,
    evmAddress: `0x${i.toString().padStart(40, '0')}`,
    privateKey: `solanaPrivateKey${i}`,
    publicKey: `solanaPublicKey${i}`,
    evmPrivateKey: `evmPrivateKey${i}`
  })),
  balances: new Map(),
  positions: new Map(),
  lastWithdrawal: new Map(),
  lastRebalance: new Map(),
  totalFeesCollected: 0,
  totalVolume: 0,
  startTime: new Date(),
  isRunning: false,
});

/**
 * Helper pour créer des wallets de test
 */
export const fakeWallets = (n = 5) => {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    address: `SolanaAddress${i}`,
    privateKey: `solanaPrivateKey${i}`,
    publicKey: `solanaPublicKey${i}`,
    evmAddress: `0x${i.toString().padStart(40, '0')}`,
    evmPrivateKey: `evmPrivateKey${i}`
  }));
};

/**
 * Helper pour créer un MonitorManager avec injection de dépendances
 */
export const makeMonitorManager = (MonitorManager: any, over: any = {}) => {
  const mockWalletManager = {
    getAllWallets: vi.fn().mockReturnValue(fakeWallets(5)),
    getAllBalances: vi.fn().mockResolvedValue([]),
    getWalletsWithLowBalance: vi.fn().mockResolvedValue([]),
    getWallet: vi.fn().mockReturnValue(fakeWallets(1)[0]),
    getWalletStats: vi.fn().mockResolvedValue({ 
      totalWallets: 5, 
      activeWallets: 5,
      totalSolBalance: 0,
      totalUsdcBalance: 0,
      totalPenguBalance: 0
    })
  };

  const mockExchangeManager = {
    withdrawRandomAmount: vi.fn().mockResolvedValue({ success: true }),
    checkConnectivity: vi.fn().mockResolvedValue({ bybit: true, binance: true }),
    cleanWithdrawalHistory: vi.fn()
  };

  const mockBridgeManager = {
    bridgeUsdtToSolana: vi.fn().mockResolvedValue({ success: true }),
    checkConnectivity: vi.fn().mockResolvedValue(true)
  };

  const mockTradingManager = {
    swapUsdcToPengu: vi.fn().mockResolvedValue({ success: true }),
    swapPenguToUsdc: vi.fn().mockResolvedValue({ success: true }),
    checkConnectivity: vi.fn().mockResolvedValue(true)
  };

  const mockLiquidityManager = {
    getAllPositions: vi.fn().mockResolvedValue([]),
    checkConnectivity: vi.fn().mockResolvedValue(true)
  };

  return new MonitorManager({
    walletManager: mockWalletManager,
    exchangeManager: mockExchangeManager,
    bridgeManager: mockBridgeManager,
    tradingManager: mockTradingManager,
    liquidityManager: mockLiquidityManager,
    botState: fakeBotState(5),
    ...over
  });
};
