import { vi } from 'vitest';
import nock from 'nock';
import { setupTestHarness, cleanupTestHarness } from './helpers/testHarness';
import dotenv from 'dotenv';

// Charger la configuration de test
dotenv.config({ path: '.env.test' });

// Configuration globale Vitest
beforeAll(() => {
  // Désactiver les connexions réseau réelles pour tous les tests
  nock.disableNetConnect(); // bloque tout HTTP réel
  // Ne pas autoriser localhost pour forcer l'utilisation des mocks
  
  // Setup du test harness déterministe
  setupTestHarness();
});

beforeEach(() => {
  // Définir NODE_ENV=test pour tous les tests
  process.env.NODE_ENV = 'test';
  process.env.DRY_RUN = 'true';
  process.env.SIGN_ONLY = 'true';
  process.env.ENABLE_CEX = 'false';
  process.env.USE_SIMULATION_RPC = 'true';
  
  vi.clearAllMocks(); // Réinitialise les compteurs d'appels des mocks
  vi.restoreAllMocks(); // Restaure les implémentations originales
});

afterEach(() => {
  vi.clearAllMocks(); // remet les mocks au propre
  vi.restoreAllMocks();
  nock.cleanAll(); // Nettoie tous les mocks nock après chaque test
});

afterAll(() => {
  // Cleanup du test harness
  cleanupTestHarness();
  
  // Réactiver les connexions réseau après tous les tests
  nock.enableNetConnect();
});

// Mock des modules qui peuvent causer des problèmes
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
  config: vi.fn(),
}));

// Mock global de la configuration
vi.mock('../src/config', () => ({
  config: {
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
  },
}));

// Mock de la configuration d'environnement
vi.mock('../src/config/env', () => ({
  env: {
    MNEMONIC: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    LIFI_API_KEY: 'test-key',
    ETHEREUM_RPC_URL: 'https://eth-mainnet.g.alchemy.com/v2/test',
    POLYGON_RPC_URL: 'https://polygon-mainnet.g.alchemy.com/v2/test',
    ABSTRACT_RPC_URL: 'https://api.abstract.xyz/v1',
    SOLANA_RPC_URL: 'https://api.mainnet-beta.solana.com',
    ENABLE_CEX: false,
    DRY_RUN: true,
    SIGN_ONLY: false,
    USE_SIMULATION_RPC: true,
    BYBIT_API_KEY: '',
    BYBIT_API_SECRET: '',
    BINANCE_API_KEY: '',
    BINANCE_API_SECRET: '',
    LOG_LEVEL: 'error',
    NODE_ENV: 'test',
  },
  ENABLE_CEX: false,
  DRY_RUN: true,
  SIGN_ONLY: false,
  USE_SIMULATION_RPC: true,
  config: {
    rpc: {
      solana: 'https://api.mainnet-beta.solana.com',
      ethereum: 'https://eth-mainnet.g.alchemy.com/v2/test',
      polygon: 'https://polygon-mainnet.g.alchemy.com/v2/test',
      abstract: 'https://api.abstract.xyz/v1',
    },
    flags: {
      ENABLE_CEX: false,
      DRY_RUN: true,
      SIGN_ONLY: false,
      USE_SIMULATION_RPC: true,
    },
    lifiApiKey: 'test-key',
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
  },
}));

// Mock global de ccxt supprimé - utilise les mocks locaux dans tests/mocks/ccxt.ts

// Mock global d'ethers - utiliser le mock externe
vi.mock('ethers', () => {
  const mockProvider = { 
    getNetwork: vi.fn().mockResolvedValue({ chainId: 1 }),
    getBalance: vi.fn().mockResolvedValue('1000000000000000000'),
    getTransactionCount: vi.fn().mockResolvedValue(0),
    sendTransaction: vi.fn().mockResolvedValue({ hash: '0x123' }),
    waitForTransaction: vi.fn().mockResolvedValue({ status: 1 }),
    broadcastTransaction: vi.fn().mockResolvedValue('0x1234567890abcdef'),
  };

  const mockWallet = { 
    address: '0xWALLET',
    signTransaction: vi.fn().mockResolvedValue('signed-tx'),
    sendTransaction: vi.fn().mockResolvedValue({ hash: '0x123' }),
  };

  return {
    ethers: {
      JsonRpcProvider: vi.fn().mockImplementation(() => mockProvider),
      Wallet: vi.fn().mockImplementation((privateKey, provider) => {
        console.log('Mock Wallet created:', mockWallet);
        return mockWallet;
      }),
    },
    JsonRpcProvider: vi.fn().mockImplementation(() => mockProvider),
    providers: {
      JsonRpcProvider: vi.fn().mockImplementation(() => mockProvider),
    },
    Wallet: vi.fn().mockImplementation(() => mockWallet),
    HDNodeWallet: {
      fromPhrase: vi.fn().mockImplementation((mnemonic, path) => {
        // Extraire l'index du chemin pour générer des adresses uniques
        const pathMatch = path.match(/m\/44'\/60'\/(\d+)'/);
        const index = pathMatch ? parseInt(pathMatch[1]) : 0;
        return {
          address: `0x${index.toString().padStart(40, '0')}`,
          privateKey: `0xPRIVATEKEY${index}`,
          publicKey: `0xPUBLICKEY${index}`,
          mnemonic: { phrase: mnemonic },
          path: path,
        };
      }),
    },
    Contract: vi.fn().mockImplementation(() => ({
      balanceOf: vi.fn().mockResolvedValue('1000000000000000000'),
      transfer: vi.fn().mockResolvedValue({ hash: '0x123' }),
      approve: vi.fn().mockResolvedValue({ hash: '0x123' }),
    })),
    utils: {
      parseUnits: vi.fn((v) => v),
      formatUnits: vi.fn((v) => v),
      parseEther: vi.fn((v) => v),
      formatEther: vi.fn((v) => v),
    },
  };
});


// Mock VersionedTransaction pour Solana
vi.mock('@solana/web3.js', () => {
  const originalModule = vi.importActual('@solana/web3.js');
  return {
    ...originalModule,
    PublicKey: vi.fn().mockImplementation((address) => ({
      toString: () => address,
    })),
    VersionedTransaction: {
      deserialize: vi.fn().mockReturnValue({
        message: {
          instructions: [],
          recentBlockhash: 'mock-blockhash',
        },
        signatures: ['mock-signature'],
      }),
    },
    Connection: vi.fn().mockImplementation(() => ({
      getLatestBlockhash: vi.fn().mockResolvedValue({ 
        blockhash: 'mock-blockhash', 
        lastValidBlockHeight: 1000 
      }),
      sendRawTransaction: vi.fn().mockResolvedValue('transaction-signature'),
      sendTransaction: vi.fn().mockResolvedValue('transaction-signature'),
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
      getParsedTokenAccountsByOwner: vi.fn().mockResolvedValue({
        context: { slot: 0 },
        value: [{
          pubkey: { toString: () => '11111111111111111111111111111111' },
          account: {
            data: {
              parsed: {
                info: {
                  tokenAmount: {
                    amount: '1000000',
                    decimals: 6,
                    uiAmount: 1,
                    uiAmountString: '1'
                  }
                }
              }
            }
          }
        }]
      }),
      getSignatureStatuses: vi.fn().mockResolvedValue({ 
        value: [{ confirmationStatus: 'finalized' }] 
      }),
      simulateTransaction: vi.fn().mockResolvedValue({ 
        value: { err: null, logs: [] } 
      }),
    })),
  };
});

// Configuration des timeouts
// Vitest gère les timeouts via la config
