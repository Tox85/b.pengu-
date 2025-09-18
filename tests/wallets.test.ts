// Mock de @solana/web3.js AVANT l'import
vi.doMock('@solana/web3.js', () => ({
  Connection: vi.fn().mockImplementation(() => ({
    getAccountInfo: vi.fn(),
    sendTransaction: vi.fn(),
    confirmTransaction: vi.fn(),
  })),
  PublicKey: vi.fn(),
  Transaction: vi.fn(),
  Keypair: {
    fromSeed: vi.fn().mockImplementation((seed) => {
      console.log('Mock Keypair.fromSeed called with seed:', seed);
      const mockKeypair = {
        publicKey: {
          toString: () => 'mock-public-key',
          toBase58: () => 'mock-public-key-base58'
        },
        secretKey: new Uint8Array(64),
      };
      console.log('Mock Keypair.fromSeed returning:', mockKeypair);
      return mockKeypair;
    }),
  },
}));

// Mock de la configuration pour limiter le nombre de wallets en test
vi.mock('../src/config/env', () => ({
  config: {
    mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    bot: {
      totalWallets: 5, // Limiter à 5 wallets pour les tests
    },
    rpc: {
      solana: 'https://api.devnet.solana.com',
      ethereum: 'https://mainnet.infura.io/v3/test',
      bsc: 'https://bsc-dataseed.binance.org',
      arbitrum: 'https://arb1.arbitrum.io/rpc',
    },
    exchanges: {
      bybit: {
        apiKey: 'test_bybit_api_key',
        secret: 'test_bybit_secret',
      },
      binance: {
        apiKey: 'test_binance_api_key',
        secret: 'test_binance_secret',
      },
    },
    tokens: {
      usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      penguMint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
    },
    limits: {
      maxBridgeFeePct: 0.10,
      maxSlippagePct: 0.01,
      e2eWallets: 5,
    },
    amounts: {
      minWithdrawal: 0.001,
      maxWithdrawal: 0.01,
      defaultSlippageBps: 300,
      minSolBalance: 0.01,
      minUsdcBalance: 1.0,
    },
    liquidity: {
      lowerPct: 10,
      upperPct: 20,
      positionSizeUsdc: 100,
    },
    monitoring: {
      intervalMs: 30000,
      rebalanceThresholdPct: 5,
      rechargeThresholdUsdc: 10,
    },
  },
}));

import { WalletManager } from '../modules/wallets';
import { Keypair } from '@solana/web3.js';


describe('WalletManager', () => {
  let walletManager: WalletManager;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    
    walletManager = new WalletManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devrait initialiser le bon nombre de wallets', () => {
    const wallets = walletManager.getAllWallets();
    expect(wallets).toHaveLength(5);
  });

  it('devrait dériver des wallets avec des adresses valides', () => {
    const wallets = walletManager.getAllWallets();
    
    wallets.forEach((wallet, index) => {
      expect(wallet).toBeDefined();
      expect(wallet.index).toBe(index);
      expect(wallet.address).toBeDefined();
      expect(wallet.privateKey).toBeDefined();
      expect(wallet.publicKey).toBeDefined();
      expect(wallet.evmAddress).toBeDefined();
      expect(wallet.evmPrivateKey).toBeDefined();
    });
  });

  it('devrait récupérer un wallet par index', () => {
    const wallet = walletManager.getWallet(0);
    expect(wallet).toBeDefined();
    expect(wallet?.index).toBe(0);
  });

  it('devrait retourner undefined pour un index invalide', () => {
    const wallet = walletManager.getWallet(999);
    expect(wallet).toBeUndefined();
  });

  it('devrait récupérer un wallet aléatoire', () => {
    const wallet = walletManager.getRandomWallet();
    expect(wallet).toBeDefined();
    expect(wallet.index).toBeGreaterThanOrEqual(0);
    expect(wallet.index).toBeLessThan(5);
  });

  it('devrait avoir des adresses différentes pour chaque wallet', () => {
    const wallets = walletManager.getAllWallets();
    const addresses = wallets.map(w => w.address);
    const uniqueAddresses = new Set(addresses);
    
    expect(uniqueAddresses.size).toBe(addresses.length);
  });

  it('devrait avoir des adresses EVM différentes pour chaque wallet', () => {
    const wallets = walletManager.getAllWallets();
    const evmAddresses = wallets.map(w => w.evmAddress);
    const uniqueEvmAddresses = new Set(evmAddresses);
    
    expect(uniqueEvmAddresses.size).toBe(evmAddresses.length);
    expect(evmAddresses.length).toBe(5);
  });
});
