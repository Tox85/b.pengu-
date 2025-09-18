import { MonitorManager } from '../modules/monitor';
import { makeMonitorManager, fakeBotState } from './helpers/factories';

// Mock de la configuration
vi.mock('../src/config', () => ({
  config: {
    mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    monitoring: {
      intervalMs: 1000,
      rebalanceThresholdPct: 5,
      rechargeThresholdUsdc: 50,
    },
    amounts: {
      minSolBalance: 0.01,
      minUsdcBalance: 10,
    },
    bot: {
      totalWallets: 5,
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
    liquidity: {
      lowerPct: 10,
      upperPct: 20,
      positionSizeUsdc: 100,
    },
    logging: {
      level: 'info',
    },
  },
}));

describe('MonitorManager', () => {
  let monitorManager: MonitorManager;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    
    // Utiliser l'injection de dépendances avec botState initialisé
    monitorManager = makeMonitorManager(MonitorManager, {
      botState: fakeBotState(5)
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('start', () => {
    it('devrait démarrer le monitoring', async () => {
      await monitorManager.start();
      expect((monitorManager as any).isRunning).toBe(true);
    });

    it('devrait ne pas redémarrer si déjà en cours', async () => {
      await monitorManager.start();
      const startSpy = vi.spyOn(monitorManager, 'start');
      await monitorManager.start();
      expect(startSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('devrait arrêter le monitoring', async () => {
      await monitorManager.start();
      await monitorManager.stop();
      expect((monitorManager as any).isRunning).toBe(false);
    });
  });

  describe('getMetrics', () => {
    it('devrait récupérer les métriques de monitoring', async () => {
      const metrics = await monitorManager.getMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.totalWallets).toBe(5);
      expect(metrics.activeWallets).toBe(5);
      expect(metrics.totalSolBalance).toBe(0);
      expect(metrics.totalUsdcBalance).toBe(0);
    });

    it('devrait gérer les erreurs lors de la récupération des métriques', async () => {
      // Mock d'une erreur dans getWalletStats
      const mockWalletManager = (monitorManager as any).walletManager;
      mockWalletManager.getWalletStats.mockRejectedValue(new Error('Database error'));

      const metrics = await monitorManager.getMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.totalWallets).toBe(0);
    });
  });

  describe('sendAlert', () => {
    it('devrait envoyer une alerte', async () => {
      const sendAlert = (monitorManager as any).sendAlert.bind(monitorManager);
      
      // Vérifier que l'alerte est ajoutée à l'historique
      const alertKey = 'test_info_Test alert';
      expect((monitorManager as any).alertHistory.has(alertKey)).toBe(false);
      
      await sendAlert('test', 'info', 'Test alert', { data: 'test' });
      
      // Vérifier que l'alerte a été ajoutée à l'historique
      expect((monitorManager as any).alertHistory.has(alertKey)).toBe(true);
    });

    it('devrait éviter le spam d\'alertes', async () => {
      const sendAlert = (monitorManager as any).sendAlert.bind(monitorManager);
      
      // Vider l'historique des alertes
      (monitorManager as any).alertHistory.clear();
      
      const alertKey = 'spam_warn_Spam alert';
      
      // Envoyer la même alerte plusieurs fois
      await sendAlert('spam', 'warn', 'Spam alert');
      await sendAlert('spam', 'warn', 'Spam alert'); // Deuxième appel rapide

      // Vérifier que l'alerte n'a été ajoutée qu'une seule fois à l'historique
      expect((monitorManager as any).alertHistory.has(alertKey)).toBe(true);
      expect((monitorManager as any).alertHistory.size).toBe(1);
    });
  });

  describe('handleError', () => {
    it('devrait gérer les erreurs avec compteur', () => {
      const sendAlertSpy = vi.spyOn(monitorManager as any, 'sendAlert');
      const handleError = (monitorManager as any).handleError.bind(monitorManager);

      // Première erreur
      handleError('test_operation', new Error('Test error'));
      expect(sendAlertSpy).toHaveBeenCalledWith('error', 'warn', 'Erreur dans test_operation', expect.any(Object));

      // Erreurs répétées
      handleError('test_operation', new Error('Test error'));
      handleError('test_operation', new Error('Test error'));

      // Vérifier que le compteur augmente
      const errorCount = (monitorManager as any).consecutiveErrors.get('test_operation');
      expect(errorCount).toBe(3);
    });
  });

  describe('checkSystemHealth', () => {
    it('devrait vérifier la santé du système', async () => {
      // Mocker les méthodes checkConnectivity
      const exchangeConnectivitySpy = vi.spyOn((monitorManager as any).exchangeManager, 'checkConnectivity').mockResolvedValue(true);
      const bridgeConnectivitySpy = vi.spyOn((monitorManager as any).bridgeManager, 'checkConnectivity').mockResolvedValue(true);
      const tradingConnectivitySpy = vi.spyOn((monitorManager as any).tradingManager, 'checkConnectivity').mockResolvedValue(true);
      const liquidityConnectivitySpy = vi.spyOn((monitorManager as any).liquidityManager, 'checkConnectivity').mockResolvedValue(true);
      
      const checkSystemHealth = (monitorManager as any).checkSystemHealth.bind(monitorManager);
      
      await checkSystemHealth();
      
      // Vérifier que les méthodes de connectivité ont été appelées
      expect(exchangeConnectivitySpy).toHaveBeenCalled();
      expect(bridgeConnectivitySpy).toHaveBeenCalled();
      expect(tradingConnectivitySpy).toHaveBeenCalled();
      expect(liquidityConnectivitySpy).toHaveBeenCalled();
    });

    it('devrait alerter en cas de problème de connectivité', async () => {
      const sendAlertSpy = vi.spyOn(monitorManager as any, 'sendAlert');
      
      // Mocker les méthodes checkConnectivity avec des échecs
      vi.spyOn((monitorManager as any).exchangeManager, 'checkConnectivity').mockResolvedValue(false);
      vi.spyOn((monitorManager as any).bridgeManager, 'checkConnectivity').mockResolvedValue(false);
      vi.spyOn((monitorManager as any).tradingManager, 'checkConnectivity').mockResolvedValue(false);
      vi.spyOn((monitorManager as any).liquidityManager, 'checkConnectivity').mockResolvedValue(false);
      
      const checkSystemHealth = (monitorManager as any).checkSystemHealth.bind(monitorManager);
      await checkSystemHealth();
      
      expect(sendAlertSpy).toHaveBeenCalledTimes(4); // 4 alertes envoyées
      expect(sendAlertSpy.mock.calls).toContainEqual(['connectivity', 'error', 'Exchange API non accessible']);
    });
  });

  describe('monitorPerformance', () => {
    it('devrait surveiller les performances', async () => {
      const monitorPerformance = (monitorManager as any).monitorPerformance.bind(monitorManager);
      
      await monitorPerformance();
      
      // Vérifier que les métriques ont été récupérées
      expect((monitorManager as any).walletManager.getWalletStats).toHaveBeenCalled();
    });
  });

  describe('monitorRisks', () => {
    it('devrait surveiller les risques', async () => {
      const sendAlertSpy = vi.spyOn(monitorManager as any, 'sendAlert');
      
      // Configurer des balances élevées pour déclencher une alerte de risque
      const mockBalances = new Map();
      mockBalances.set(0, { sol: 100, usdc: 10000, pengu: 1000 });
      (monitorManager as any).botState.balances = mockBalances;
      
      const monitorRisks = (monitorManager as any).monitorRisks.bind(monitorManager);
      await monitorRisks();

      expect(sendAlertSpy).toHaveBeenCalledWith(
        'risk',
        'warn',
        'Wallet 0 a une valeur élevée',
        expect.any(Object)
      );
    });
  });

  describe('getBotState', () => {
    it('devrait retourner l\'état du bot', () => {
      const botState = (monitorManager as any).getBotState();
      
      expect(botState).toBeDefined();
      expect(botState.wallets).toHaveLength(5);
      expect(botState.isRunning).toBe(false);
    });
  });
});
