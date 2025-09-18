import { config } from './config';
import { logger } from './logger';
import { WalletManager } from '../modules/wallets';
import { ExchangeManager } from '../modules/exchanges';
import { BridgeManager } from '../modules/bridge';
import { TradingManager } from '../modules/trading';
import { LiquidityManager } from '../modules/liquidity';
import { MonitorManager } from '../modules/monitor';

/**
 * Initialise tous les managers avec injection de dépendances
 */
function initializeManagers() {
  // Initialiser le WalletManager en premier
  const walletManager = new WalletManager();
  
  // Initialiser les autres managers avec injection de dépendances
  const exchangeManager = new ExchangeManager();
  const bridgeManager = new BridgeManager({ walletManager });
  const tradingManager = new TradingManager({ walletManager });
  const liquidityManager = new LiquidityManager({ walletManager });
  const monitorManager = new MonitorManager({ 
    exchangeManager, 
    bridgeManager, 
    tradingManager, 
    liquidityManager,
    walletManager 
  });

  return {
    walletManager,
    exchangeManager,
    bridgeManager,
    tradingManager,
    liquidityManager,
    monitorManager
  };
}

/**
 * Bot Multi-Wallet PENGU
 * 
 * Ce bot gère 100 wallets dérivés d'une mnemonic, effectue des retraits aléatoires
 * via Bybit, utilise Li.Fi pour brider vers Solana, trade du PENGU via Jupiter,
 * fournit de la liquidité concentrée via Orca, surveille et rééquilibre les balances.
 */

class PenguBot {
  private isRunning: boolean = false;
  private startTime: Date = new Date();
  private managers: ReturnType<typeof initializeManagers>;

  constructor() {
    this.managers = initializeManagers();
    this.setupGracefulShutdown();
  }

  /**
   * Démarre le bot
   */
  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        logger.warn('Le bot est déjà en cours d\'exécution');
        return;
      }

      logger.info('🚀 Démarrage du bot PENGU', {
        totalWallets: config.bot.totalWallets,
        batchSize: config.bot.batchSize,
        monitoringInterval: config.monitoring.intervalMs,
      });

      // Vérifier la connectivité des services
      await this.checkConnectivity();

      // Initialiser les wallets
      await this.initializeWallets();

      // Démarrer le monitoring
      await this.managers.monitorManager.start();

      this.isRunning = true;
      this.startTime = new Date();

      logger.info('✅ Bot PENGU démarré avec succès');

      // Exécuter la séquence initiale
      await this.executeInitialSequence();

    } catch (error) {
      logger.error('❌ Erreur lors du démarrage du bot:', error);
      throw error;
    }
  }

  /**
   * Arrête le bot
   */
  async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        logger.warn('Le bot n\'est pas en cours d\'exécution');
        return;
      }

      logger.info('🛑 Arrêt du bot PENGU');

      // Arrêter le monitoring
      await this.managers.monitorManager.stop();

      this.isRunning = false;

      const uptime = Date.now() - this.startTime.getTime();
      logger.info('✅ Bot PENGU arrêté', {
        uptime: `${Math.floor(uptime / 1000)}s`,
      });
    } catch (error) {
      logger.error('❌ Erreur lors de l\'arrêt du bot:', error);
      throw error;
    }
  }

  /**
   * Vérifie la connectivité des services
   */
  private async checkConnectivity(): Promise<void> {
    logger.info('🔍 Vérification de la connectivité des services...');

    try {
      // Vérifier les exchanges (seulement si CEX activés)
      if (process.env.ENABLE_CEX !== 'false') {
        const exchangeConnectivity = await this.managers.exchangeManager.checkConnectivity();
        logger.info('Exchanges:', exchangeConnectivity);
      } else {
        logger.info('[exchange][INFO] CEX disabled - skipping connectivity check');
      }

      // Vérifier Li.Fi (toujours, même en DRY_RUN)
      const lifiConnected = await this.managers.bridgeManager.checkConnectivity();
      logger.info('Li.Fi:', { connected: lifiConnected });

      // Vérifier Jupiter (toujours, même en DRY_RUN)
      const jupiterConnected = await this.managers.tradingManager.checkConnectivity();
      logger.info('Jupiter:', { connected: jupiterConnected });

      // Vérifier Orca (via le monitoring des pools)
      const orcaConnected = true; // À implémenter
      logger.info('Orca:', { connected: orcaConnected });

    } catch (error) {
      logger.error('Erreur lors de la vérification de la connectivité:', error);
      throw error;
    }
  }

  /**
   * Initialise les wallets
   */
  private async initializeWallets(): Promise<void> {
    logger.info('🔑 Initialisation des wallets...');

    try {
      const wallets = this.managers.walletManager.getAllWallets();
      logger.info(`✅ ${wallets.length} wallets initialisés`);

      // Afficher quelques adresses pour vérification
      const sampleWallets = wallets.slice(0, 3);
      for (const wallet of sampleWallets) {
        logger.info(`Wallet ${wallet.index}:`, {
          solanaAddress: wallet.address,
          evmAddress: wallet.evmAddress,
        });
      }

    } catch (error) {
      logger.error('Erreur lors de l\'initialisation des wallets:', error);
      throw error;
    }
  }

  /**
   * Exécute la séquence initiale avec un petit nombre de wallets
   */
  private async executeInitialSequence(): Promise<void> {
    logger.info('🎯 Exécution de la séquence initiale...');

    try {
      // Utiliser seulement les 3 premiers wallets pour la séquence initiale
      const testWallets = this.managers.walletManager.getAllWallets().slice(0, 3);

      for (const wallet of testWallets) {
        await this.executeWalletSequence(wallet.index);
        
        // Délai aléatoire entre les wallets
        const delay = this.getRandomDelay();
        await this.sleep(delay);
      }

      logger.info('✅ Séquence initiale terminée');
    } catch (error) {
      logger.error('Erreur lors de la séquence initiale:', error);
    }
  }

  /**
   * Exécute la séquence complète pour un wallet
   */
  private async executeWalletSequence(walletIndex: number): Promise<void> {
    try {
      logger.info(`🔄 Exécution de la séquence pour le wallet ${walletIndex}`);

      // 1. Vérifier la balance SOL
      const hasEnoughSol = await this.managers.walletManager.hasEnoughSol(walletIndex);
      if (!hasEnoughSol) {
        logger.info(`Wallet ${walletIndex} a besoin de SOL, tentative de recharge...`);
        await this.rechargeWallet(walletIndex);
      }

      // 2. Récupérer les balances
      const balance = await this.managers.walletManager.getWalletBalance(walletIndex);
      logger.info(`Balances du wallet ${walletIndex}:`, {
        sol: balance.sol,
        usdc: balance.usdc,
        pengu: balance.pengu,
      });

      // 3. Si pas de USDC, essayer de retirer depuis Bybit (seulement si CEX activés)
      if (balance.usdc < config.amounts.minUsdcBalance) {
        if (process.env.ENABLE_CEX !== 'false') {
          logger.info(`Wallet ${walletIndex} a besoin de USDC, tentative de retrait...`);
          await this.withdrawAndBridge(walletIndex);
        } else {
          logger.info(`[exchange][INFO] skip CEX (flag off) - wallet ${walletIndex} needs USDC but CEX disabled`);
        }
      }

      // 4. Si pas de PENGU, acheter avec USDC
      if (balance.pengu < 1) {
        logger.info(`Wallet ${walletIndex} a besoin de PENGU, achat...`);
        await this.buyPengu(walletIndex, Math.min(balance.usdc * 0.5, 50));
      }

      // 5. Ouvrir une position de liquidité si possible
      if (balance.usdc > config.liquidity.positionSizeUsdc) {
        logger.info(`Wallet ${walletIndex} ouvre une position de liquidité...`);
        await this.openLiquidityPosition(walletIndex);
      }

      logger.info(`✅ Séquence terminée pour le wallet ${walletIndex}`);
    } catch (error) {
      logger.error(`Erreur lors de la séquence pour le wallet ${walletIndex}:`, error);
    }
  }

  /**
   * Recharge un wallet depuis les exchanges
   */
  private async rechargeWallet(walletIndex: number): Promise<void> {
    try {
      // Vérifier si les CEX sont activés
      if (process.env.ENABLE_CEX === 'false') {
        logger.info(`[exchange][INFO] skip CEX (flag off) - wallet ${walletIndex} recharge skipped`);
        return;
      }

      const wallet = this.managers.walletManager.getWallet(walletIndex);
      if (!wallet) return;

      // Essayer Bybit d'abord
      const bybitResult = await this.managers.exchangeManager.withdrawRandomAmount('bybit', wallet.evmAddress);
      
      if (bybitResult.success) {
        logger.info(`Retrait Bybit réussi pour le wallet ${walletIndex}: ${bybitResult.amount} USDT`);
        
        // Bridge vers Solana
        const bridgeResult = await this.managers.bridgeManager.bridgeUsdtToSolana(walletIndex, bybitResult.amount.toString());
        
        if (bridgeResult.success) {
          logger.info(`Bridge réussi pour le wallet ${walletIndex}`);
        } else {
          logger.warn(`Bridge échoué pour le wallet ${walletIndex}: ${bridgeResult.error}`);
        }
      } else {
        // Essayer Binance si Bybit échoue
        const binanceResult = await this.managers.exchangeManager.withdrawRandomAmount('binance', wallet.evmAddress);
        
        if (binanceResult.success) {
          logger.info(`Retrait Binance réussi pour le wallet ${walletIndex}: ${binanceResult.amount} USDT`);
          
          // Bridge vers Solana
          const bridgeResult = await this.managers.bridgeManager.bridgeUsdtToSolana(walletIndex, binanceResult.amount.toString());
          
          if (bridgeResult.success) {
            logger.info(`Bridge réussi pour le wallet ${walletIndex}`);
          } else {
            logger.warn(`Bridge échoué pour le wallet ${walletIndex}: ${bridgeResult.error}`);
          }
        } else {
          logger.warn(`Aucun retrait possible pour le wallet ${walletIndex}`);
        }
      }
    } catch (error) {
      logger.error(`Erreur lors de la recharge du wallet ${walletIndex}:`, error);
    }
  }

  /**
   * Retire et bridge des fonds
   */
  private async withdrawAndBridge(walletIndex: number): Promise<void> {
    // Vérifier si les CEX sont activés
    if (process.env.ENABLE_CEX === 'false') {
      logger.info(`[exchange][INFO] skip CEX (flag off) - wallet ${walletIndex} withdraw and bridge skipped`);
      return;
    }
    
    await this.rechargeWallet(walletIndex);
  }

  /**
   * Achète du PENGU avec USDC
   */
  private async buyPengu(walletIndex: number, usdcAmount: number): Promise<void> {
    try {
      // Garde pour amount > 0
      if (usdcAmount <= 0) {
        logger.warn(`[trading][WARN] skip quote (amount=0) - wallet ${walletIndex} buyPengu skipped`);
        return;
      }

      const result = await this.managers.tradingManager.swapUsdcToPengu(walletIndex, usdcAmount);
      
      if (result.success) {
        logger.info(`Achat de PENGU réussi pour le wallet ${walletIndex}: ${usdcAmount} USDC`);
      } else {
        logger.warn(`Achat de PENGU échoué pour le wallet ${walletIndex}: ${result.error}`);
      }
    } catch (error) {
      logger.error(`Erreur lors de l'achat de PENGU pour le wallet ${walletIndex}:`, error);
    }
  }

  /**
   * Ouvre une position de liquidité
   */
  private async openLiquidityPosition(walletIndex: number): Promise<void> {
    try {
      // Garde pour amount > 0
      if (config.liquidity.positionSizeUsdc <= 0) {
        logger.warn(`[liquidity][WARN] skip position (amount=0) - wallet ${walletIndex} openLiquidityPosition skipped`);
        return;
      }

      const result = await this.managers.liquidityManager.openPosition(
        walletIndex,
        'PENGU_USDC_POOL_ID', // À remplacer par l'ID réel du pool
        config.liquidity.lowerPct,
        config.liquidity.upperPct,
        config.liquidity.positionSizeUsdc
      );

      if (result) {
        logger.info(`Position de liquidité ouverte pour le wallet ${walletIndex}: ${result}`);
      } else {
        logger.warn(`Ouverture de position échouée pour le wallet ${walletIndex}`);
      }
    } catch (error) {
      logger.error(`Erreur lors de l'ouverture de position pour le wallet ${walletIndex}:`, error);
    }
  }

  /**
   * Récupère un délai aléatoire
   */
  private getRandomDelay(): number {
    const min = config.bot.randomDelayMinMs;
    const max = config.bot.randomDelayMaxMs;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Pause l'exécution
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Configure l'arrêt gracieux
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Signal ${signal} reçu, arrêt du bot...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // Pour nodemon
  }

  /**
   * Récupère les métriques du bot
   */
  async getMetrics(): Promise<any> {
    try {
      const monitorMetrics = await this.managers.monitorManager.getMetrics();
      const botState = this.managers.monitorManager.getBotState();

      return {
        ...monitorMetrics,
        isRunning: this.isRunning,
        uptime: Date.now() - this.startTime.getTime(),
        botState: {
          totalWallets: botState.wallets.length,
          activeWallets: botState.balances.size,
          totalFeesCollected: botState.totalFeesCollected,
          totalVolume: botState.totalVolume,
        },
      };
    } catch (error) {
      logger.error('Erreur lors de la récupération des métriques:', error);
      return null;
    }
  }
}

// Fonction principale
async function main(): Promise<void> {
  try {
    const bot = new PenguBot();
    await bot.start();

    // Afficher les métriques toutes les 5 minutes
    setInterval(async () => {
      const metrics = await bot.getMetrics();
      if (metrics) {
        logger.info('📊 Métriques du bot:', metrics);
      }
    }, 5 * 60 * 1000);

  } catch (error) {
    logger.error('Erreur fatale:', error);
    process.exit(1);
  }
}

// Démarrer le bot si ce fichier est exécuté directement
if (require.main === module) {
  main().catch((error) => {
    console.error('Erreur fatale:', error);
    process.exit(1);
  });
}

export { PenguBot };
