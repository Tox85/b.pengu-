// Mock de la configuration AVANT les imports
vi.mock('../src/config', () => ({
  config: {
    mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
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
    amounts: {
      minWithdrawal: 0.001,
      maxWithdrawal: 0.01,
      defaultSlippageBps: 300,
      minSolBalance: 0.01,
      minUsdcBalance: 1.0,
    },
    bot: {
      randomDelayMinMs: 1000,
      randomDelayMaxMs: 5000,
      totalWallets: 5,
    },
    rpc: {
      solana: 'https://api.devnet.solana.com',
      ethereum: 'https://mainnet.infura.io/v3/test',
      bsc: 'https://bsc-dataseed.binance.org',
      arbitrum: 'https://arb1.arbitrum.io/rpc',
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
    logging: {
      level: 'info',
    },
  },
}));

import { ExchangeManager } from '../modules/exchanges';
import { Wallet } from '../src/types';
import { makeBybit, makeBinance } from './mocks/ccxt';
import { makeExchangeManager, fakeWallets } from './helpers/factories';

describe('ExchangeManager', () => {
  let exchangeManager: ExchangeManager;
  let mockWallets: Wallet[];

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    
    // Utiliser l'injection de dépendances avec les mocks
    exchangeManager = makeExchangeManager(ExchangeManager);
    
    // Créer des wallets de test
    mockWallets = fakeWallets(3);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('withdrawRandom', () => {
    it('devrait sélectionner un wallet aléatoire et effectuer un retrait Bybit', async () => {
      // Forcer l'activation des CEX pour ce test
      process.env.ENABLE_CEX = 'true';
      
      // Créer les mocks pour ce test
      const mockBybit = makeBybit();
      const mockBinance = makeBinance();
      
      // Créer un nouveau manager avec CEX activé
      const testExchangeManager = new ExchangeManager({
        bybit: mockBybit,
        binance: mockBinance
      });

      // Moquer verifyBybitSecurity pour éviter les faux négatifs
      vi.spyOn(testExchangeManager as any, 'verifyBybitSecurity').mockResolvedValue(true);

      const result = await testExchangeManager.withdrawRandom(mockWallets, 'USDC');

      expect(result.success).toBe(true);
      expect(result.exchangeUsed).toBe('bybit');
      expect(result.selectedWallet).toBeDefined();
      expect(result.txId).toBe('mock-withdraw-bybit');
      expect(result.amount).toBeGreaterThan(0);
    });

    it('devrait fallback vers Binance si Bybit échoue', async () => {
      // Forcer l'activation des CEX pour ce test
      process.env.ENABLE_CEX = 'true';
      
      // Créer de nouveaux mocks pour ce test spécifique
      const mockBybit = makeBybit({ 
        withdraw: vi.fn().mockRejectedValue(new Error('Bybit down'))
      });
      const mockBinance = makeBinance();
      
      // Créer un nouveau manager avec ces mocks
      const testExchangeManager = new ExchangeManager({
        bybit: mockBybit,
        binance: mockBinance
      });

      // Moquer les vérifications de sécurité
      vi.spyOn(testExchangeManager as any, 'verifyBybitSecurity').mockResolvedValue(true);
      vi.spyOn(testExchangeManager as any, 'verifyBinanceSecurity').mockResolvedValue(true);

      const result = await testExchangeManager.withdrawRandom(mockWallets, 'USDC');

      expect(result.success).toBe(true);
      expect(result.exchangeUsed).toBe('binance');
      expect(result.txId).toBe('mock-withdraw-binance');
    });

    it('devrait échouer si les deux exchanges ont des balances insuffisantes', async () => {
      // Forcer l'activation des CEX pour ce test
      process.env.ENABLE_CEX = 'true';
      
      // Créer de nouveaux mocks pour ce test spécifique
      const mockBybit = makeBybit();
      const mockBinance = makeBinance();
      
      // Configurer les deux exchanges pour avoir des balances insuffisantes
      (mockBybit.fetchBalance as any).mockResolvedValue({
        free: { USDC: 0.0001 },
        total: { USDC: 0.0001 },
      });
      
      (mockBinance.fetchBalance as any).mockResolvedValue({
        free: { USDC: 0.0001 },
        total: { USDC: 0.0001 },
      });
      
      // Créer un nouveau manager avec ces mocks
      const testExchangeManager = new ExchangeManager({
        bybit: mockBybit,
        binance: mockBinance
      });

      // Moquer les vérifications de sécurité
      vi.spyOn(testExchangeManager as any, 'verifyBybitSecurity').mockResolvedValue(true);
      vi.spyOn(testExchangeManager as any, 'verifyBinanceSecurity').mockResolvedValue(true);

      const result = await testExchangeManager.withdrawRandom(mockWallets, 'USDC');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Balance insuffisante');
    });

    it('devrait gérer les erreurs de réseau', async () => {
      // Forcer l'activation des CEX pour ce test
      process.env.ENABLE_CEX = 'true';
      
      // Créer de nouveaux mocks pour ce test spécifique
      const mockBybit = makeBybit();
      const mockBinance = makeBinance();
      
      // Configurer Bybit pour échouer avec une erreur réseau
      (mockBybit.fetchBalance as any).mockRejectedValue(new Error('Network error'));
      
      // Configurer Binance pour réussir
      (mockBinance.fetchBalance as any).mockResolvedValue({
        free: { USDC: 1000 },
        total: { USDC: 1000 },
      });
      
      // Créer un nouveau manager avec ces mocks
      const testExchangeManager = new ExchangeManager({
        bybit: mockBybit,
        binance: mockBinance
      });

      // Moquer les vérifications de sécurité
      vi.spyOn(testExchangeManager as any, 'verifyBybitSecurity').mockResolvedValue(true);
      vi.spyOn(testExchangeManager as any, 'verifyBinanceSecurity').mockResolvedValue(true);

      const result = await testExchangeManager.withdrawRandom(mockWallets, 'USDC');

      // Le système devrait gérer l'erreur et continuer avec Binance
      expect(result.success).toBe(true);
      expect(result.exchangeUsed).toBe('binance');
    });
  });

  describe('withdrawRandomBatch', () => {
    it('devrait effectuer des retraits en batch sur plusieurs wallets', async () => {
      // Les mocks sont déjà configurés via l'injection de dépendances
      // Moquer verifyBybitSecurity pour éviter les faux négatifs
      vi.spyOn(exchangeManager as any, 'verifyBybitSecurity').mockResolvedValue(true);
      vi.spyOn(exchangeManager as any, 'verifyBinanceSecurity').mockResolvedValue(true);

      const results = await exchangeManager.withdrawRandomBatch(mockWallets, 2, 'USDC');

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('checkExchangeBalances', () => {
    it('devrait recommander Bybit si seul Bybit a une balance suffisante', async () => {
      // Créer de nouveaux mocks pour ce test spécifique
      const mockBybit = makeBybit();
      const mockBinance = makeBinance();
      
      // Configurer Bybit avec balance suffisante
      (mockBybit.fetchBalance as any).mockResolvedValue({
        free: { USDC: 1000 },
        total: { USDC: 1000 },
      });
      
      // Configurer Binance avec balance insuffisante
      (mockBinance.fetchBalance as any).mockResolvedValue({
        free: { USDC: 0.001 },
        total: { USDC: 0.001 },
      });
      
      // Créer un nouveau manager avec ces mocks
      const testExchangeManager = new ExchangeManager({
        bybit: mockBybit,
        binance: mockBinance
      });

      const result = await testExchangeManager.checkExchangeBalances('USDC');

      expect(result.recommendation).toBe('bybit');
      expect(result.bybit.sufficient).toBe(true);
      expect(result.binance.sufficient).toBe(false);
    });

    it('devrait recommander les deux si les deux ont des balances suffisantes', async () => {
      // Créer de nouveaux mocks pour ce test spécifique
      const mockBybit = makeBybit();
      const mockBinance = makeBinance();
      
      // Configurer les deux exchanges avec des balances suffisantes
      (mockBybit.fetchBalance as any).mockResolvedValue({
        free: { USDC: 1000 },
        total: { USDC: 1000 },
      });
      
      (mockBinance.fetchBalance as any).mockResolvedValue({
        free: { USDC: 1000 },
        total: { USDC: 1000 },
      });
      
      // Créer un nouveau manager avec ces mocks
      const testExchangeManager = new ExchangeManager({
        bybit: mockBybit,
        binance: mockBinance
      });

      const result = await testExchangeManager.checkExchangeBalances('USDC');

      expect(result.recommendation).toBe('both');
      expect(result.bybit.sufficient).toBe(true);
      expect(result.binance.sufficient).toBe(true);
    });
  });

  describe('checkConnectivity', () => {
    it('devrait vérifier la connectivité des deux exchanges', async () => {
      // Les mocks sont déjà configurés via l'injection de dépendances

      const result = await exchangeManager.checkConnectivity();

      expect(result.bybit).toBe(true);
      expect(result.binance).toBe(true);
    });

    it('devrait détecter les problèmes de connectivité', async () => {
      // Créer de nouveaux mocks pour ce test spécifique
      const mockBybit = makeBybit();
      const mockBinance = makeBinance();
      
      // Configurer Bybit pour échouer
      (mockBybit.fetchStatus as any).mockRejectedValue(new Error('Connection failed'));
      
      // Configurer Binance pour réussir
      (mockBinance.fetchStatus as any).mockResolvedValue({ status: 'ok' });
      
      // Créer un nouveau manager avec ces mocks
      const testExchangeManager = new ExchangeManager({
        bybit: mockBybit,
        binance: mockBinance
      });

      const result = await testExchangeManager.checkConnectivity();

      expect(result.bybit).toBe(false);
      expect(result.binance).toBe(true);
    });
  });
});
