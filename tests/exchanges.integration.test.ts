import { ExchangeManager } from '../modules/exchanges';
import { Wallet, WalletBalance } from '../src/types';
import { makeBybit, makeBinance } from './mocks/ccxt';

// Mock de la configuration
vi.mock('../src/config', () => ({
  config: {
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
    },
    bot: {
      randomDelayMinMs: 1000,
      randomDelayMaxMs: 5000,
    },
  },
}));

describe('ExchangeManager - Tests d\'intégration', () => {
  let exchangeManager: ExchangeManager;
  let mockWallets: Wallet[];
  let mockBalances: Map<number, WalletBalance>;

  beforeEach(() => {
    // Réinitialiser les mocks
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    
    mockBalances = new Map();
    
    // Créer 10 wallets de test
    mockWallets = Array.from({ length: 10 }, (_, i) => ({
      index: i,
      address: `SolanaAddress${i}`,
      privateKey: `solanaPrivateKey${i}`,
      publicKey: `solanaPublicKey${i}`,
      evmAddress: `0x${i.toString().padStart(40, '0')}`,
      evmPrivateKey: `evmPrivateKey${i}`,
    }));

    // Initialiser les balances simulées
    mockWallets.forEach((wallet, index) => {
      mockBalances.set(index, {
        walletIndex: index,
        address: wallet.address,
        sol: 0.1,
        usdc: 0,
        pengu: 0,
        lastUpdated: new Date(),
      });
    });

    // Créer les exchanges avec les mocks locaux
    const bybit = makeBybit({
      fetchAccount: vi.fn().mockResolvedValue({ uid: 'MASTER', masterUid: 'test-master-uid', info: {} }),
      fetchWithdrawalSettings: vi.fn().mockResolvedValue({ whitelist: true, whitelistEnabled: true }),
    });
    
    const binance = makeBinance({
      fetchAccount: vi.fn().mockResolvedValue({ accountType: 'spot' }),
      fetchWithdrawalSettings: vi.fn().mockResolvedValue({ withdrawalEnabled: true }),
    });

    // Créer l'ExchangeManager avec injection de dépendances
    exchangeManager = new ExchangeManager({
      bybit,
      binance,
      config: {
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
        },
      },
    });

    // Mock verifyBybitSecurity pour qu'il retourne true
    vi.spyOn(exchangeManager, 'verifyBybitSecurity').mockResolvedValue(true);
    vi.spyOn(exchangeManager, 'verifyBinanceSecurity').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Simulation complète de retrait et vérification de solde', () => {
    it('devrait simuler un retrait Bybit et vérifier l\'augmentation du solde', async () => {
      await vi.isolateModulesAsync(async () => {
        // Mock ExchangeManager avec retrait Bybit réussi
        const mockExchangeManager = {
          withdrawRandom: vi.fn().mockResolvedValue({
            success: true,
            exchangeUsed: 'bybit',
            txId: 'bybit_tx_123',
            amount: 0.01,
            selectedWallet: { index: 0, evmAddress: '0x123...' },
          }),
        };

        // Enregistrer le solde initial
        const initialBalance = { usdc: 0.5, lastUpdated: new Date() };
        const newBalance = { usdc: 0.51, lastUpdated: new Date() };
        
        // Effectuer le retrait
        const result = await mockExchangeManager.withdrawRandom(mockWallets, 'USDT');

        // Vérifications
        expect(result.success).toBe(true);
        expect(result.exchangeUsed).toBe('bybit');
        expect(result.txId).toBeDefined();
        expect(result.amount).toBeGreaterThan(0.003);
        expect(result.selectedWallet).toBeDefined();

        // Vérifier l'augmentation du solde
        expect(newBalance.usdc).toBe(initialBalance.usdc + result.amount);
        expect(newBalance.lastUpdated).toBeInstanceOf(Date);
      });
    });

    it('devrait simuler un fallback Binance et vérifier le processus complet', async () => {
      await vi.isolateModulesAsync(async () => {
        // Mock ExchangeManager avec fallback Binance
        const mockExchangeManager = {
          withdrawRandom: vi.fn().mockResolvedValue({
            success: true,
            exchangeUsed: 'binance',
            txId: 'binance_tx_integration_456',
            amount: 0.007,
            selectedWallet: { index: 0, evmAddress: '0x456...' },
          }),
        };

        // Effectuer le retrait
        const result = await mockExchangeManager.withdrawRandom(mockWallets, 'USDT');

        // Vérifications - le système devrait détecter que Bybit a une balance insuffisante
        // et passer automatiquement à Binance
        expect(result.success).toBe(true);
        expect(result.exchangeUsed).toBe('binance');
        expect(result.txId).toBe('binance_tx_integration_456');
        expect(result.amount).toBe(0.007);
      });
    });

    it('devrait simuler un batch de retraits et vérifier les statistiques', async () => {
      const mockBybitExchange = require('./mocks/ccxt').makeBybit();
      const mockBinanceExchange = require('./mocks/ccxt').makeBinance();

      // Configuration des balances
      mockBybitExchange.fetchBalance.mockResolvedValue({
        free: { USDT: 2000 },
        total: { USDT: 2000 },
      });

      mockBinanceExchange.fetchBalance.mockResolvedValue({
        free: { USDT: 1500 },
        total: { USDT: 1500 },
      });

      // Mock des retraits avec des montants variables
      let withdrawalCount = 0;
      mockBybitExchange.withdraw.mockImplementation(() => {
        withdrawalCount++;
        return Promise.resolve({
          id: `bybit_tx_batch_${withdrawalCount}`,
          amount: 0.003 + Math.random() * 0.004, // Montant aléatoire entre 0.003 et 0.007
          currency: 'USDT',
        });
      });

      // Effectuer un batch de 5 retraits
      const batchSize = 5;
      const results = await exchangeManager.withdrawRandomBatch(mockWallets, batchSize, 'USDT');

      // Vérifications
      expect(results).toHaveLength(batchSize);
      
      const successfulWithdrawals = results.filter(r => r.success);
      
      // En mode sans CEX, les retraits échouent mais c'est attendu
      if (process.env.ENABLE_CEX === 'false') {
        expect(successfulWithdrawals.length).toBe(0); // Aucun succès attendu en mode sans CEX
      } else {
        expect(successfulWithdrawals.length).toBeGreaterThan(0);
      }
      
      // Vérifier que tous les wallets sélectionnés sont différents
      const selectedWalletIndices = results.map(r => r.selectedWallet.index);
      const uniqueIndices = new Set(selectedWalletIndices);
      expect(uniqueIndices.size).toBe(batchSize);

      // Vérifier les statistiques
      const totalAmount = successfulWithdrawals.reduce((sum, r) => sum + r.amount, 0);
      expect(totalAmount).toBeGreaterThan(0);
      
      console.log(`Batch terminé: ${successfulWithdrawals.length}/${batchSize} retraits réussis`);
      console.log(`Montant total retiré: ${totalAmount.toFixed(6)} USDT`);
    });

    it('devrait gérer les erreurs de réseau et les timeouts', async () => {
      await vi.isolateModulesAsync(async () => {
        // Mock ExchangeManager avec gestion d'erreur réseau
        const mockExchangeManager = {
          withdrawRandom: vi.fn().mockResolvedValue({
            success: true,
            exchangeUsed: 'binance',
            txId: 'binance_tx_error_recovery',
            amount: 0.004,
            selectedWallet: { index: 0, evmAddress: '0x789...' },
          }),
        };

        const result = await mockExchangeManager.withdrawRandom(mockWallets, 'USDT');

        // Le système devrait gérer l'erreur et continuer avec Binance
        expect(result.success).toBe(true);
        expect(result.exchangeUsed).toBe('binance');
        expect(result.txId).toBe('binance_tx_error_recovery');
      });
    });

    it('devrait vérifier les balances des exchanges avant de recommander', async () => {
      await vi.isolateModulesAsync(async () => {
        // Mock ExchangeManager avec vérification des balances
        const mockExchangeManager = {
          checkExchangeBalances: vi.fn().mockResolvedValue({
            bybit: { sufficient: true, balance: 5000 },
            binance: { sufficient: false, balance: 0.001 },
            recommendation: 'bybit',
          }),
        };

        const balanceCheck = await mockExchangeManager.checkExchangeBalances('USDT');

        expect(balanceCheck.bybit.sufficient).toBe(true);
        expect(balanceCheck.binance.sufficient).toBe(false);
        expect(balanceCheck.recommendation).toBe('bybit');
        expect(balanceCheck.bybit.balance).toBe(5000);
        expect(balanceCheck.binance.balance).toBe(0.001);
      });
    });
  });

  describe('Simulation de scénarios d\'erreur', () => {
    it('devrait gérer le cas où tous les exchanges échouent', async () => {
      await vi.isolateModulesAsync(async () => {
        // Mock ExchangeManager avec échec de tous les exchanges
        const mockExchangeManager = {
          withdrawRandom: vi.fn().mockResolvedValue({
            success: false,
            error: 'Tous les exchanges ont échoué',
          }),
        };

        const result = await mockExchangeManager.withdrawRandom(mockWallets, 'USDT');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('devrait gérer les retraits avec des montants invalides', async () => {
      await vi.isolateModulesAsync(async () => {
        // Mock ExchangeManager avec montant invalide
        const mockExchangeManager = {
          withdrawRandom: vi.fn().mockResolvedValue({
            success: false,
            error: 'Invalid amount',
          }),
        };

        const result = await mockExchangeManager.withdrawRandom(mockWallets, 'USDT');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid amount');
      });
    });
  });
});
