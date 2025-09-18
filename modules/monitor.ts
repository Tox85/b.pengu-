import * as cron from 'node-cron';
import { config } from '../src/config';
import { monitorLogger } from '../src/logger';
import { 
  BotState, 
  MonitoringMetrics, 
  RebalanceAction, 
  WalletBalance,
  AlertType,
  AlertLevel,
  // LiquidityPosition 
} from '../src/types';
// import { walletManager } from './wallets'; // Remplacé par injection de dépendances
// import { exchangeManager } from './exchanges'; // Remplacé par injection de dépendances
// import { bridgeManager } from './bridge'; // Remplacé par injection de dépendances
// import { tradingManager } from './trading'; // Remplacé par injection de dépendances
// import { liquidityManager } from './liquidity'; // Remplacé par injection de dépendances

export interface MonitorDependencies {
  walletManager?: any;
  exchangeManager?: any;
  bridgeManager?: any;
  tradingManager?: any;
  liquidityManager?: any;
  botState?: BotState;
}

export class MonitorManager {
  private botState: BotState;
  private isRunning: boolean = false;
  private monitoringInterval?: NodeJS.Timeout;
  private walletManager?: any;
  private exchangeManager?: any;
  private bridgeManager?: any;
  private tradingManager?: any;
  private liquidityManager?: any;
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private alertHistory: Map<string, Date> = new Map();
  private consecutiveErrors: Map<string, number> = new Map();

  constructor(deps?: MonitorDependencies) {
    const deps_ = deps || {
      walletManager: undefined,
      exchangeManager: undefined,
      bridgeManager: undefined,
      tradingManager: undefined,
      liquidityManager: undefined,
    };
    this.walletManager = deps_.walletManager;
    this.exchangeManager = deps_.exchangeManager;
    this.bridgeManager = deps_.bridgeManager;
    this.tradingManager = deps_.tradingManager;
    this.liquidityManager = deps_.liquidityManager;
    this.botState = deps_.botState || {
      wallets: [],
      balances: new Map(),
      positions: new Map(),
      lastWithdrawal: new Map(),
      lastRebalance: new Map(),
      totalFeesCollected: 0,
      totalVolume: 0,
      startTime: new Date(),
      isRunning: false,
    };
  }

  /**
   * Démarre le monitoring
   */
  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        monitorLogger.warn('Le monitoring est déjà en cours');
        return;
      }

      this.isRunning = true;
      this.botState.isRunning = true;
      this.botState.startTime = new Date();

      // Initialiser les wallets
      this.botState.wallets = this.walletManager?.getAllWallets() || [];

      monitorLogger.info('Démarrage du monitoring du bot PENGU', {
        totalWallets: this.botState.wallets.length,
        monitoringInterval: config.monitoring.intervalMs,
      });

      // Démarrer le monitoring principal
      this.startMainMonitoring();

      // Démarrer les tâches cron
      this.startCronJobs();

      monitorLogger.info('Monitoring démarré avec succès');
    } catch (error) {
      monitorLogger.error('Erreur lors du démarrage du monitoring:', error);
      throw error;
    }
  }

  /**
   * Arrête le monitoring
   */
  async stop(): Promise<void> {
    try {
      this.isRunning = false;
      this.botState.isRunning = false;

      // Arrêter le monitoring principal
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = undefined;
      }

      // Arrêter les tâches cron
      this.cronJobs.forEach((job) => job.stop());
      this.cronJobs.clear();

      monitorLogger.info('Monitoring arrêté');
    } catch (error) {
      monitorLogger.error('Erreur lors de l\'arrêt du monitoring:', error);
      throw error;
    }
  }

  /**
   * Démarre le monitoring principal
   */
  private startMainMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.monitoringCycle();
      } catch (error) {
        monitorLogger.error('Erreur lors du cycle de monitoring:', error);
      }
    }, config.monitoring.intervalMs);
  }

  /**
   * Cycle de monitoring principal
   */
  private async monitoringCycle(): Promise<void> {
    try {
      monitorLogger.debug('Début du cycle de monitoring');

      // Mettre à jour les balances
      await this.updateBalances();

      // Vérifier les positions de liquidité
      await this.checkLiquidityPositions();

      // Déclencher les rééquilibrages si nécessaire
      await this.triggerRebalancing();

      // Vérifier les besoins de recharge
      await this.checkRechargeNeeds();

      // Vérifier la santé du système
      await this.checkSystemHealth();

      // Surveiller les performances
      await this.monitorPerformance();

      // Surveiller les risques
      await this.monitorRisks();

      monitorLogger.debug('Fin du cycle de monitoring');
    } catch (error) {
      this.handleError('monitoring_cycle', error);
    }
  }

  /**
   * Met à jour les balances de tous les wallets
   */
  private async updateBalances(): Promise<void> {
    try {
      const balances = await this.walletManager?.getAllBalances() || new Map();
      
      for (const balance of balances) {
        this.botState.balances.set(balance.walletIndex, balance);
      }

      monitorLogger.debug('Balances mises à jour', {
        totalWallets: balances.length,
        activeWallets: balances.filter((b: any) => b.sol > 0 || b.usdc > 0 || b.pengu > 0).length,
      });
    } catch (error) {
      monitorLogger.error('Erreur lors de la mise à jour des balances:', error);
    }
  }

  /**
   * Vérifie les positions de liquidité
   */
  private async checkLiquidityPositions(): Promise<void> {
    try {
      for (let i = 0; i < this.botState.wallets.length; i++) {
        const positions = await this.liquidityManager?.getAllPositions(i) || [];
        this.botState.positions.set(i, positions);

        // Vérifier si les positions sont dans la fourchette
        for (const _position of positions) {
          // const isInRange = await liquidityManager.isPositionInRange(position.positionId);
          
          // if (!isInRange) {
          //   monitorLogger.warn(`Position hors fourchette détectée`, {
          //     walletIndex: i,
          //     positionId: position.positionId,
          //   });
          // }
        }
      }
    } catch (error) {
      monitorLogger.error('Erreur lors de la vérification des positions de liquidité:', error);
    }
  }

  /**
   * Déclenche les rééquilibrages si nécessaire
   */
  private async triggerRebalancing(): Promise<void> {
    try {
      const rebalanceActions: RebalanceAction[] = [];

      for (let i = 0; i < this.botState.wallets.length; i++) {
        const balance = this.botState.balances.get(i);
        if (!balance) continue;

        // Vérifier si le wallet a besoin d'un rééquilibrage
        const actions = await this.analyzeWalletRebalancing(i, balance);
        rebalanceActions.push(...actions);
      }

      // Exécuter les actions de rééquilibrage
      for (const action of rebalanceActions) {
        await this.executeRebalanceAction(action);
      }

      if (rebalanceActions.length > 0) {
        monitorLogger.info(`Actions de rééquilibrage exécutées`, {
          count: rebalanceActions.length,
          actions: rebalanceActions.map(a => a.type),
        });
      }
    } catch (error) {
      monitorLogger.error('Erreur lors du déclenchement des rééquilibrages:', error);
    }
  }

  /**
   * Analyse les besoins de rééquilibrage d'un wallet
   */
  private async analyzeWalletRebalancing(
    walletIndex: number,
    balance: WalletBalance
  ): Promise<RebalanceAction[]> {
    const actions: RebalanceAction[] = [];

    try {
      // Vérifier si le wallet a suffisamment de SOL
      if (balance.sol < config.amounts.minSolBalance) {
        actions.push({
          type: 'swap',
          walletIndex,
          amount: config.amounts.minSolBalance - balance.sol,
          tokenA: 'USDC',
          tokenB: 'SOL',
          reason: 'Balance SOL insuffisante',
        });
      }

      // Vérifier si le wallet a trop de PENGU par rapport à USDC
      const totalValue = balance.usdc + (balance.pengu * 0.1); // Prix approximatif
      const penguRatio = (balance.pengu * 0.1) / totalValue;
      
      if (penguRatio > 0.7) {
        actions.push({
          type: 'swap',
          walletIndex,
          amount: balance.pengu * 0.3, // Vendre 30% des PENGU
          tokenA: 'PENGU',
          tokenB: 'USDC',
          reason: 'Ratio PENGU trop élevé',
        });
      }

      // Vérifier si le wallet a trop de USDC par rapport à PENGU
      if (penguRatio < 0.3 && balance.usdc > 50) {
        actions.push({
          type: 'swap',
          walletIndex,
          amount: balance.usdc * 0.3, // Acheter des PENGU avec 30% des USDC
          tokenA: 'USDC',
          tokenB: 'PENGU',
          reason: 'Ratio USDC trop élevé',
        });
      }

      // Vérifier les positions de liquidité
      const positions = this.botState.positions.get(walletIndex) || [];
      for (const _position of positions) {
        // const isInRange = await liquidityManager.isPositionInRange(position.positionId);
        
        // if (!isInRange) {
        //   actions.push({
        //     type: 'remove_liquidity',
        //     walletIndex,
        //     reason: 'Position hors fourchette',
        //   });
        // }
      }

      return actions;
    } catch (error) {
      monitorLogger.error(`Erreur lors de l'analyse du rééquilibrage pour le wallet ${walletIndex}:`, error);
      return [];
    }
  }

  /**
   * Exécute une action de rééquilibrage
   */
  private async executeRebalanceAction(action: RebalanceAction): Promise<void> {
    try {
      monitorLogger.info(`Exécution de l'action de rééquilibrage`, {
        walletIndex: action.walletIndex,
        type: action.type,
        reason: action.reason,
      });

      switch (action.type) {
        case 'swap':
          await this.executeSwap(action);
          break;
        case 'add_liquidity':
          await this.executeAddLiquidity(action);
          break;
        case 'remove_liquidity':
          await this.executeRemoveLiquidity(action);
          break;
        case 'collect_fees':
          await this.executeCollectFees(action);
          break;
      }

      // Mettre à jour la date du dernier rééquilibrage
      this.botState.lastRebalance.set(action.walletIndex, new Date());
    } catch (error) {
      monitorLogger.error(`Erreur lors de l'exécution de l'action de rééquilibrage:`, error);
    }
  }

  /**
   * Exécute un swap
   */
  private async executeSwap(action: RebalanceAction): Promise<void> {
    try {
      if (action.tokenA === 'USDC' && action.tokenB === 'PENGU') {
        await this.tradingManager?.swapUsdcToPengu(action.walletIndex, action.amount || 0);
      } else if (action.tokenA === 'PENGU' && action.tokenB === 'USDC') {
        await this.tradingManager?.swapPenguToUsdc(action.walletIndex, action.amount || 0);
      }
    } catch (error) {
      monitorLogger.error(`Erreur lors de l'exécution du swap:`, error);
    }
  }

  /**
   * Exécute l'ajout de liquidité
   */
  private async executeAddLiquidity(_action: RebalanceAction): Promise<void> {
    try {
      // Implémentation de l'ajout de liquidité
      monitorLogger.info('Ajout de liquidité non implémenté');
    } catch (error) {
      monitorLogger.error(`Erreur lors de l'ajout de liquidité:`, error);
    }
  }

  /**
   * Exécute le retrait de liquidité
   */
  private async executeRemoveLiquidity(action: RebalanceAction): Promise<void> {
    try {
      const positions = this.botState.positions.get(action.walletIndex) || [];
      
      for (const _position of positions) {
        // await liquidityManager.closePosition(action.walletIndex, _position.positionId);
      }
    } catch (error) {
      monitorLogger.error(`Erreur lors du retrait de liquidité:`, error);
    }
  }

  /**
   * Exécute la collecte des frais
   */
  private async executeCollectFees(action: RebalanceAction): Promise<void> {
    try {
      const positions = this.botState.positions.get(action.walletIndex) || [];
      
      for (const _position of positions) {
        // await liquidityManager.collectFees(action.walletIndex, position.positionId);
      }
    } catch (error) {
      monitorLogger.error(`Erreur lors de la collecte des frais:`, error);
    }
  }

  /**
   * Vérifie les besoins de recharge
   */
  private async checkRechargeNeeds(): Promise<void> {
    try {
      const lowBalanceWallets = await this.walletManager?.getWalletsWithLowBalance() || [];
      
      if (lowBalanceWallets.length > 0) {
        monitorLogger.info(`Wallets avec balance faible détectés`, {
          count: lowBalanceWallets.length,
          wallets: lowBalanceWallets,
        });

        // Recharger depuis les exchanges
        for (const walletIndex of lowBalanceWallets) {
          await this.rechargeWallet(walletIndex);
        }
      }
    } catch (error) {
      monitorLogger.error('Erreur lors de la vérification des besoins de recharge:', error);
    }
  }

  /**
   * Recharge un wallet depuis les exchanges
   */
  private async rechargeWallet(walletIndex: number): Promise<void> {
    try {
      // Vérifier si les CEX sont activés
      if (process.env.ENABLE_CEX === 'false') {
        monitorLogger.info(`[exchange][INFO] skip CEX (flag off) - wallet ${walletIndex} recharge skipped`);
        return;
      }

      const wallet = this.walletManager?.getWallet(walletIndex);
      if (!wallet) return;

      monitorLogger.info(`Recharge du wallet ${walletIndex}`);

      // Essayer Bybit d'abord
      const bybitResult = await this.exchangeManager?.withdrawRandomAmount('bybit', wallet.evmAddress);
      
      if (bybitResult.success) {
        // Bridge vers Solana
        await this.bridgeManager?.bridgeUsdtToSolana(walletIndex, bybitResult.amount.toString());
      } else {
        // Essayer Binance si Bybit échoue
        const binanceResult = await this.exchangeManager?.withdrawRandomAmount('binance', wallet.evmAddress);
        
        if (binanceResult.success) {
          // Bridge vers Solana
          await this.bridgeManager?.bridgeUsdtToSolana(walletIndex, binanceResult.amount.toString());
        }
      }
    } catch (error) {
      monitorLogger.error(`Erreur lors de la recharge du wallet ${walletIndex}:`, error);
    }
  }

  /**
   * Démarre les tâches cron
   */
  private startCronJobs(): void {
    // Tâche de nettoyage quotidien à 2h du matin
    const cleanupJob = cron.schedule('0 2 * * *', async () => {
      try {
        await this.dailyCleanup();
      } catch (error) {
        monitorLogger.error('Erreur lors du nettoyage quotidien:', error);
      }
    });

    this.cronJobs.set('cleanup', cleanupJob);

    // Tâche de collecte des frais toutes les 6 heures
    const collectFeesJob = cron.schedule('0 */6 * * *', async () => {
      try {
        await this.collectAllFees();
      } catch (error) {
        monitorLogger.error('Erreur lors de la collecte des frais:', error);
      }
    });

    this.cronJobs.set('collectFees', collectFeesJob);
  }

  /**
   * Nettoyage quotidien
   */
  private async dailyCleanup(): Promise<void> {
    try {
      monitorLogger.info('Début du nettoyage quotidien');

      // Nettoyer l'historique des retraits
      this.exchangeManager?.cleanWithdrawalHistory();

      // Collecter les frais de toutes les positions
      await this.collectAllFees();

      monitorLogger.info('Nettoyage quotidien terminé');
    } catch (error) {
      monitorLogger.error('Erreur lors du nettoyage quotidien:', error);
    }
  }

  /**
   * Collecte les frais de toutes les positions
   */
  private async collectAllFees(): Promise<void> {
    try {
      let totalFeesCollected = 0;

      for (let i = 0; i < this.botState.wallets.length; i++) {
        const positions = this.botState.positions.get(i) || [];
        
        for (const _position of positions) {
          // const result = await liquidityManager.collectFees(i, position.positionId);
          
          // if (result.success && result.feesCollected) {
          //   totalFeesCollected += result.feesCollected.usdc + result.feesCollected.pengu;
          // }
        }
      }

      this.botState.totalFeesCollected += totalFeesCollected;

      if (totalFeesCollected > 0) {
        monitorLogger.info(`Frais collectés`, {
          totalFees: totalFeesCollected,
          cumulativeFees: this.botState.totalFeesCollected,
        });
      }
    } catch (error) {
      monitorLogger.error('Erreur lors de la collecte des frais:', error);
    }
  }

  /**
   * Récupère les métriques de monitoring
   */
  async getMetrics(): Promise<MonitoringMetrics> {
    try {
      const stats = await this.walletManager?.getWalletStats() || { totalWallets: 0, activeWallets: 0, totalBalance: 0 };
      const activePositions = Array.from(this.botState.positions.values())
        .flat()
        .filter(p => p.liquidity !== '0').length;

      return {
        totalWallets: stats.totalWallets,
        activeWallets: stats.activeWallets,
        totalSolBalance: stats.totalSolBalance,
        totalUsdcBalance: stats.totalUsdcBalance,
        totalPenguBalance: stats.totalPenguBalance,
        activePositions,
        totalFeesCollected: this.botState.totalFeesCollected,
        averagePositionValue: 0, // À calculer
        lastUpdate: new Date(),
      };
    } catch (error) {
      monitorLogger.error('Erreur lors de la récupération des métriques:', error);
      return {
        totalWallets: 0,
        activeWallets: 0,
        totalSolBalance: 0,
        totalUsdcBalance: 0,
        totalPenguBalance: 0,
        activePositions: 0,
        totalFeesCollected: 0,
        averagePositionValue: 0,
        lastUpdate: new Date(),
      };
    }
  }

  /**
   * Récupère l'état du bot
   */
  getBotState(): BotState {
    return { ...this.botState };
  }

  /**
   * Envoie une alerte
   */
  private async sendAlert(
    type: AlertType,
    level: AlertLevel,
    message: string,
    data?: any
  ): Promise<void> {
    try {
      const alertKey = `${type}_${level}_${message}`;
      const now = new Date();
      
      // Éviter le spam d'alertes (max 1 alerte par type par heure)
      const lastAlert = this.alertHistory.get(alertKey);
      if (lastAlert && (now.getTime() - lastAlert.getTime()) < 3600000) {
        return;
      }

      this.alertHistory.set(alertKey, now);

      // const alert = {
      //   type,
      //   level,
      //   message,
      //   data,
      //   timestamp: now,
      //   botState: this.getBotState(),
      // };

      // Logger l'alerte
      switch (level) {
        case 'info':
          monitorLogger.info(`[ALERTE ${type}] ${message}`, data);
          break;
        case 'warn':
          monitorLogger.warn(`[ALERTE ${type}] ${message}`, data);
          break;
        case 'error':
          monitorLogger.error(`[ALERTE ${type}] ${message}`, data);
          break;
        case 'critical':
          monitorLogger.error(`[ALERTE CRITIQUE ${type}] ${message}`, data);
          break;
      }

      // TODO: Envoyer l'alerte via webhook, email, etc.
      // await this.sendWebhookAlert(alert);
      
    } catch (error) {
      monitorLogger.error('Erreur lors de l\'envoi de l\'alerte:', error);
    }
  }

  /**
   * Gère les erreurs avec compteur de tentatives
   */
  private handleError(operation: string, error: any): void {
    const errorCount = this.consecutiveErrors.get(operation) || 0;
    this.consecutiveErrors.set(operation, errorCount + 1);

    if (errorCount >= 3) {
      this.sendAlert(
        'error',
        'critical',
        `Erreur répétée dans ${operation}`,
        { error: error.message, count: errorCount + 1 }
      );
    } else if (errorCount >= 0) {
      this.sendAlert(
        'error',
        'warn',
        `Erreur dans ${operation}`,
        { error: error.message, count: errorCount + 1 }
      );
    }
  }

  // /**
  //  * Réinitialise le compteur d'erreurs pour une opération
  //  */
  // private resetErrorCount(_operation: string): void {
  //   // this.consecutiveErrors.delete(operation);
  // }

  /**
   * Vérifie la santé du système
   */
  private async checkSystemHealth(): Promise<void> {
    try {
      // En mode DRY_RUN, ne pas déclencher d'alertes de connectivité
      if (process.env.DRY_RUN === 'true') {
        monitorLogger.info('[monitor][INFO] DRY_RUN mode - skipping connectivity alerts');
        return;
      }

      // Vérifier la connectivité des services
      const exchangeHealth = await this.exchangeManager?.checkConnectivity();
      const bridgeHealth = await this.bridgeManager?.checkConnectivity();
      const tradingHealth = await this.tradingManager?.checkConnectivity();
      const liquidityHealth = await this.liquidityManager?.checkConnectivity();

      if (!exchangeHealth) {
        await this.sendAlert('connectivity', 'error', 'Exchange API non accessible');
      }

      if (!bridgeHealth) {
        await this.sendAlert('connectivity', 'error', 'Bridge API non accessible');
      }

      if (!tradingHealth) {
        await this.sendAlert('connectivity', 'error', 'Trading API non accessible');
      }

      if (!liquidityHealth) {
        await this.sendAlert('connectivity', 'error', 'Liquidity API non accessible');
      }

      // Vérifier les balances globales
      const _metrics = await this.getMetrics();
      if (_metrics.totalUsdcBalance < 100) {
        await this.sendAlert(
          'balance',
          'warn',
          'Balance USDC globale faible',
          { totalUsdcBalance: _metrics.totalUsdcBalance }
        );
      }

      // Vérifier les positions de liquidité
      if (_metrics.activePositions === 0) {
        await this.sendAlert(
          'liquidity',
          'warn',
          'Aucune position de liquidité active'
        );
      }

    } catch (error) {
      this.handleError('health_check', error);
    }
  }

  /**
   * Surveille les performances du bot
   */
  private async monitorPerformance(): Promise<void> {
    try {
      await this.getMetrics();
      const uptime = Date.now() - this.botState.startTime.getTime();
      const uptimeHours = uptime / (1000 * 60 * 60);

      // Calculer les métriques de performance
      const feesPerHour = this.botState.totalFeesCollected / uptimeHours;
      const volumePerHour = this.botState.totalVolume / uptimeHours;

      // Alerter si les performances sont faibles
      if (uptimeHours > 24 && feesPerHour < 0.1) {
        await this.sendAlert(
          'performance',
          'warn',
          'Performance faible détectée',
          { feesPerHour, volumePerHour, uptimeHours }
        );
      }

      // Logger les métriques de performance
      monitorLogger.info('Métriques de performance', {
        uptimeHours: uptimeHours.toFixed(2),
        feesPerHour: feesPerHour.toFixed(4),
        volumePerHour: volumePerHour.toFixed(2),
        totalFees: this.botState.totalFeesCollected,
        totalVolume: this.botState.totalVolume,
      });

    } catch (error) {
      this.handleError('performance_monitoring', error);
    }
  }

  /**
   * Surveille les risques
   */
  private async monitorRisks(): Promise<void> {
    try {
      for (let i = 0; i < this.botState.wallets.length; i++) {
        const balance = this.botState.balances.get(i);
        if (!balance) continue;

        // Vérifier les risques de liquidité
        const totalValue = balance.usdc + (balance.pengu * 0.1); // Prix approximatif
        if (totalValue > 1000) {
          await this.sendAlert(
            'risk',
            'warn',
            `Wallet ${i} a une valeur élevée`,
            { walletIndex: i, totalValue, balance }
          );
        }

        // Vérifier les ratios de risque
        const penguRatio = (balance.pengu * 0.1) / totalValue;
        if (penguRatio > 0.9) {
          await this.sendAlert(
            'risk',
            'warn',
            `Wallet ${i} a un ratio PENGU très élevé`,
            { walletIndex: i, penguRatio, balance }
          );
        }
      }
    } catch (error) {
      this.handleError('risk_monitoring', error);
    }
  }
}

// Export d'une instance singleton
export const monitorManager = new MonitorManager();
