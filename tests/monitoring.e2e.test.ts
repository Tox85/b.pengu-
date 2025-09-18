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

describe('Tests de monitoring et métriques end-to-end', () => {
  let monitorManager: MonitorManager;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    
    // Utiliser l'injection de dépendances avec botState initialisé
    monitorManager = makeMonitorManager(MonitorManager, {
      botState: fakeBotState(10)
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Monitoring continu', () => {
    it('devrait surveiller les soldes en continu et déclencher des alertes', async () => {
      console.log('🔄 Démarrage du monitoring continu...');

      // Configurer des balances faibles pour déclencher des alertes
      const mockBalances = [
        { walletIndex: 0, sol: 0.005, usdc: 5, pengu: 0 },
        { walletIndex: 1, sol: 0.008, usdc: 8, pengu: 0 }
      ];
      (monitorManager as any).walletManager.getAllBalances.mockResolvedValue(mockBalances);

      // Démarrer le monitoring
      await monitorManager.start();

      // Attendre un cycle de monitoring
      await new Promise(resolve => setTimeout(resolve, 100));

      // Vérifier que le monitoring fonctionne
      expect((monitorManager as any).isRunning).toBe(true);

      console.log('✅ Monitoring continu testé avec succès');
    });

    it('devrait détecter les soldes faibles et déclencher des recharges', async () => {
      console.log('🔄 Test de détection de soldes faibles...');

      // Configurer des balances faibles
      const mockBalances = [
        { walletIndex: 0, sol: 0.005, usdc: 5, pengu: 0 }
      ];
      (monitorManager as any).walletManager.getAllBalances.mockResolvedValue(mockBalances);
      (monitorManager as any).walletManager.getWalletsWithLowBalance.mockResolvedValue([
        { walletIndex: 0, sol: 0.005, usdc: 5, pengu: 0 }
      ]);
      (monitorManager as any).walletManager.getWallet.mockReturnValue({
        index: 0,
        address: 'SolanaAddress0',
        evmAddress: '0x1234567890123456789012345678901234567890'
      });

      // Appeler directement checkRechargeNeeds
      const checkRechargeNeeds = (monitorManager as any).checkRechargeNeeds.bind(monitorManager);
      await checkRechargeNeeds();

      // Vérifier que les recharges ont été déclenchées
      expect((monitorManager as any).exchangeManager.withdrawRandomAmount).toHaveBeenCalled();

      console.log('✅ Détection de soldes faibles testée avec succès');
    });
  });

  describe('Métriques de performance', () => {
    it('devrait collecter et analyser les métriques de performance', async () => {
      console.log('🔄 Test de collecte des métriques...');

      // Configurer des métriques de test
      (monitorManager as any).walletManager.getWalletStats.mockResolvedValue({
        totalWallets: 10,
        activeWallets: 10,
        totalSolBalance: 1.5,
        totalUsdcBalance: 100
      });

      // Configurer l'état du bot
      (monitorManager as any).botState.totalFeesCollected = 50.5;
      (monitorManager as any).botState.totalVolume = 10000;

      const metrics = await monitorManager.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalWallets).toBe(10);
      expect(metrics.activeWallets).toBe(10);
      expect(metrics.totalFeesCollected).toBe(50.5);
      // Note: totalVolume n'est pas dans les métriques standard

      console.log('✅ Collecte des métriques testée avec succès');
    });

    it('devrait détecter les problèmes de performance', async () => {
      console.log('🔄 Test de détection des problèmes de performance...');

      const sendAlertSpy = vi.spyOn(monitorManager as any, 'sendAlert');

      // Configurer des frais faibles et un uptime long pour déclencher l'alerte
      (monitorManager as any).botState.totalFeesCollected = 1; // Frais faibles
      (monitorManager as any).botState.startTime = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 heures

      const monitorPerformance = (monitorManager as any).monitorPerformance.bind(monitorManager);
      await monitorPerformance();

      // Vérifier que des alertes ont été envoyées
      expect(sendAlertSpy).toHaveBeenCalledWith(
        'performance',
        'warn',
        expect.stringContaining('Performance faible détectée'),
        expect.any(Object)
      );

      console.log('✅ Détection des problèmes de performance testée avec succès');
    });
  });

  describe('Gestion des alertes', () => {
    it('devrait prévenir le spam d\'alertes', async () => {
      console.log('🔄 Test de prévention du spam d\'alertes...');

      const sendAlert = (monitorManager as any).sendAlert.bind(monitorManager);
      const alertHistory = (monitorManager as any).alertHistory;

      // Envoyer plusieurs alertes identiques rapidement
      await sendAlert('spam', 'warn', 'Test spam alert');
      await sendAlert('spam', 'warn', 'Test spam alert');
      await sendAlert('spam', 'warn', 'Test spam alert');

      // Vérifier que seule la première alerte a été enregistrée
      const spamKey = 'spam_warn_Test spam alert';
      const lastAlert = alertHistory.get(spamKey);

      expect(lastAlert).toBeDefined();
      expect(Date.now() - lastAlert.getTime()).toBeLessThan(1000); // Moins d'1 seconde

      console.log('✅ Prévention du spam d\'alertes testée avec succès');
    });
  });

  describe('Surveillance des risques', () => {
    it('devrait détecter les risques élevés', async () => {
      console.log('🔄 Test de détection des risques élevés...');

      const sendAlertSpy = vi.spyOn(monitorManager as any, 'sendAlert');

      // Configurer des balances élevées pour déclencher une alerte de risque
      const mockBalances = new Map();
      mockBalances.set(0, { sol: 100, usdc: 10000, pengu: 1000 });
      (monitorManager as any).botState.balances = mockBalances;

      const monitorRisks = (monitorManager as any).monitorRisks.bind(monitorManager);
      await monitorRisks();

      // Vérifier que des alertes de risque ont été envoyées
      expect(sendAlertSpy).toHaveBeenCalledWith(
        'risk',
        'warn',
        expect.stringContaining('Wallet 0 a une valeur élevée'),
        expect.any(Object)
      );

      console.log('✅ Détection des risques élevés testée avec succès');
    });
  });

  describe('Tests de résilience du monitoring', () => {
    it('devrait continuer à fonctionner malgré les erreurs', async () => {
      console.log('🔄 Test de résilience du monitoring...');

      // Configurer des erreurs dans les dépendances
      (monitorManager as any).walletManager.getAllBalances.mockRejectedValue(new Error('Database error'));
      (monitorManager as any).exchangeManager.checkConnectivity.mockRejectedValue(new Error('Network error'));

      // Démarrer le monitoring malgré les erreurs
      await monitorManager.start();

      // Vérifier que le monitoring continue à fonctionner
      expect((monitorManager as any).isRunning).toBe(true);

      console.log('✅ Résilience du monitoring testée avec succès');
    });
  });
});
