import { jest } from 'vitest';

export const mockWalletManager = {
  getWallet: vi.fn().mockImplementation((index: number) => ({
    index,
    address: `SolanaAddress${index}`,
    privateKey: `solanaPrivateKey${index}`,
    publicKey: `solanaPublicKey${index}`,
    evmAddress: `0x${index.toString().padStart(40, '0')}`,
    evmPrivateKey: `evmPrivateKey${index}`,
  })),
  
  getSolanaKeypair: vi.fn().mockImplementation((index: number) => ({
    publicKey: { toBase58: () => `SolanaAddress${index}` },
    secretKey: new Uint8Array(64),
  })),
  
  getAllWallets: vi.fn().mockImplementation(() => 
    Array.from({ length: 5 }, (_, i) => ({
      id: i,
      address: `SolanaAddress${i}`,
      balance: 0,
      lastActivity: new Date(),
      isActive: true,
    }))
  ),
  
  getTokenBalance: vi.fn().mockResolvedValue(10),
  
  getAllBalances: vi.fn().mockResolvedValue(new Map()),
  
  getWalletsWithLowBalance: vi.fn().mockResolvedValue([]),
  
  getWalletStats: vi.fn().mockResolvedValue({
    totalWallets: 5,
    activeWallets: 5,
    totalBalance: 0,
  }),
  
  signSolanaTransaction: vi.fn().mockResolvedValue('signed-transaction'),
};

export const mockBotState = {
  wallets: Array.from({ length: 5 }, (_, i) => ({
    id: i,
    address: `SolanaAddress${i}`,
    balance: 0,
    lastActivity: new Date(),
    isActive: true,
  })),
  balances: new Map(),
  positions: new Map(),
  lastWithdrawal: new Map(),
  lastRebalance: new Map(),
  totalFeesCollected: 0,
  totalVolume: 0,
  startTime: new Date(),
  isRunning: false,
};
