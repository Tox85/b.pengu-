import ccxt from 'ccxt';
import { config } from '../src/config';
import { exchangeLogger } from '../src/logger';
import { WithdrawalResult, Wallet } from '../src/types';
import { ExchangeOrchestrator } from '../src/exchanges/ExchangeOrchestrator';
import { NoOpExchangeManager } from '../src/exchanges/NoOpExchangeManager';
import { BybitClient } from '../src/exchanges/adapters/BybitClient';
import { BinanceClient } from '../src/exchanges/adapters/BinanceClient';
import { createIdempotencyStore } from '../src/state/idempotencyStore';
import { FEATURE_FLAGS } from '../src/config/exchanges';

export interface ExchangeLike {
  fetchAccount?: () => Promise<any>;
  fetchWithdrawalSettings?: () => Promise<any>;
  fetchBalance?: () => Promise<any>;
  withdraw?: (...args: any[]) => Promise<any>;
  fetchStatus?: () => Promise<any>;
  fetchWithdrawal?: (txId: string) => Promise<any>;
  fetchWithdrawals?: (currency?: string, since?: number, limit?: number) => Promise<any>;
  loadMarkets?: () => Promise<any>;
}

export interface ExchangeDependencies {
  bybit?: ExchangeLike;
  binance?: ExchangeLike;
  config?: any;
  logger?: any;
}

export class ExchangeManager {
  private bybit?: ExchangeLike;
  private binance?: ExchangeLike;
  private config: any;
  private withdrawalHistory: Map<string, Date> = new Map();
  private sapiWeights: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly MAX_SAPI_WEIGHT = 900; // Limite Binance SAPI
  private readonly SAPI_WINDOW_MS = 60000; // 1 minute
  private initialized = false;
  private orchestrator?: ExchangeOrchestrator | NoOpExchangeManager;

  constructor(deps?: ExchangeDependencies) {
    this.bybit = deps?.bybit;
    this.binance = deps?.binance;
    this.config = deps?.config || config;
  }

  /**
   * Initialise les exchanges (seulement si non injectés)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Vérifier si les CEX sont désactivés
      if (process.env.ENABLE_CEX === 'false') {
        this.orchestrator = new NoOpExchangeManager();
        this.initialized = true;
        exchangeLogger.info('[exchange][INFO] CEX disabled (NoOp)');
        return;
      }

      // Configuration Bybit
      if (!this.bybit) {
        this.bybit = new ccxt.bybit({
          apiKey: this.config.exchanges.bybit.apiKey,
          secret: this.config.exchanges.bybit.secret,
          sandbox: false, // Utiliser mainnet
          enableRateLimit: true,
          options: {
            defaultType: 'spot', // Utiliser le marché spot
          },
        });
      }

      // Configuration Binance
      if (!this.binance) {
        this.binance = new ccxt.binance({
          apiKey: this.config.exchanges.binance.apiKey,
          secret: this.config.exchanges.binance.secret,
          sandbox: false, // Utiliser mainnet
          enableRateLimit: true,
          options: {
            defaultType: 'spot', // Utiliser le marché spot
          },
        });
      }

      // Initialiser l'orchestrateur si activé
      if (FEATURE_FLAGS.ENABLE_EX_ORCHESTRATOR) {
        const clients = [];
        if (this.bybit) {
          clients.push(new BybitClient(this.bybit));
        }
        if (this.binance) {
          clients.push(new BinanceClient(this.binance));
        }
        
        this.orchestrator = new ExchangeOrchestrator(clients, createIdempotencyStore());
        exchangeLogger.info('Exchange Orchestrator initialisé');
      }

      this.initialized = true;
      exchangeLogger.info('Exchanges initialisés avec succès');
    } catch (error) {
      exchangeLogger.error('Erreur lors de l\'initialisation des exchanges:', error);
      throw error;
    }
  }

  /**
   * Vérifie les poids SAPI Binance
   */
  private checkSapiWeights(endpoint: string, weight: number): boolean {
    const now = Date.now();
    const key = endpoint;
    const sapiWeight = this.sapiWeights.get(key);

    if (!sapiWeight || now > sapiWeight.resetTime) {
      // Nouvelle fenêtre de temps
      this.sapiWeights.set(key, { count: weight, resetTime: now + this.SAPI_WINDOW_MS });
      return true;
    }

    if (sapiWeight.count + weight > this.MAX_SAPI_WEIGHT) {
      exchangeLogger.warn(`Limite SAPI atteinte pour ${endpoint}`, {
        currentWeight: sapiWeight.count,
        requestedWeight: weight,
        maxWeight: this.MAX_SAPI_WEIGHT,
        resetTime: new Date(sapiWeight.resetTime),
      });
      return false;
    }

    sapiWeight.count += weight;
    return true;
  }

  /**
   * Vérifie la sécurité Bybit (master UID, whitelist)
   */
  private async verifyBybitSecurity(): Promise<boolean> {
    try {
      // Garde explicite pour éviter Object.keys(undefined) en test
      if (!this.bybit || !this.bybit.fetchAccount || !this.bybit.fetchWithdrawalSettings) {
        exchangeLogger.error('Client Bybit non initialisé ou méthodes manquantes');
        return false;
      }

      // Vérifier le master UID
      const accountInfo = await this.bybit.fetchAccount();
      if (!accountInfo || !accountInfo.masterUid) {
        exchangeLogger.error('Master UID Bybit non trouvé');
        return false;
      }

      // Vérifier la whitelist de retrait
      const withdrawalSettings = await this.bybit.fetchWithdrawalSettings();
      if (!withdrawalSettings || !withdrawalSettings.whitelistEnabled) {
        exchangeLogger.warn('Whitelist de retrait Bybit non activée');
        return false;
      }

      exchangeLogger.info('Sécurité Bybit vérifiée', {
        masterUid: accountInfo.masterUid,
        whitelistEnabled: withdrawalSettings.whitelistEnabled,
      });

      return true;
    } catch (error) {
      exchangeLogger.error('Erreur lors de la vérification de sécurité Bybit:', error);
      return false;
    }
  }

  /**
   * Vérifie la sécurité Binance (SAPI weights)
   */
  private async verifyBinanceSecurity(): Promise<boolean> {
    try {
      // Vérifier les poids SAPI actuels
      if (!this.binance || !this.binance.fetchAccount || !this.binance.fetchWithdrawalSettings) {
        exchangeLogger.error('Client Binance non initialisé ou méthodes manquantes');
        return false;
      }

      const accountInfo = await this.binance.fetchAccount();
      if (!accountInfo) {
        exchangeLogger.error('Informations de compte Binance non disponibles');
        return false;
      }

      // Vérifier les limites de retrait
      const withdrawalSettings = await this.binance.fetchWithdrawalSettings();
      if (!withdrawalSettings) {
        exchangeLogger.error('Paramètres de retrait Binance non disponibles');
        return false;
      }

      exchangeLogger.info('Sécurité Binance vérifiée', {
        accountType: accountInfo.accountType,
        withdrawalEnabled: withdrawalSettings.withdrawalEnabled,
      });

      return true;
    } catch (error) {
      exchangeLogger.error('Erreur lors de la vérification de sécurité Binance:', error);
      return false;
    }
  }


  /**
   * Récupère les balances d'un exchange
   */
  async getBalances(exchangeName: 'bybit' | 'binance'): Promise<any> {
    try {
      await this.init();
      const exchange = this.getExchange(exchangeName);
      if (!exchange.fetchBalance) {
        throw new Error(`Méthode fetchBalance non disponible pour ${exchangeName}`);
      }
      const balances = await exchange.fetchBalance();
      
      exchangeLogger.info(`Balances récupérées pour ${exchangeName}`, {
        exchange: exchangeName,
        totalBalance: Object.keys(balances.total).length,
      });

      return balances;
    } catch (error) {
      exchangeLogger.error(`Erreur lors de la récupération des balances pour ${exchangeName}:`, error);
      throw error;
    }
  }

  /**
   * Effectue un retrait aléatoire vers une adresse
   */
  async withdrawRandomAmount(
    exchangeName: 'bybit' | 'binance',
    toAddress: string,
    currency: string = 'USDT'
  ): Promise<WithdrawalResult> {
    try {
      await this.init();
      
      // Gardes pour éviter les undefined
      if (!this.bybit) throw new Error('Bybit not initialized');
      if (!this.binance) throw new Error('Binance not initialized');
      
      const exchange = this.getExchange(exchangeName);
      
      // Vérifier si un retrait a déjà été effectué récemment pour cette adresse
      const lastWithdrawal = this.withdrawalHistory.get(toAddress);
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      if (lastWithdrawal && lastWithdrawal > oneHourAgo) {
        exchangeLogger.warn(`Retrait récent détecté pour ${toAddress}, attente d'une heure`);
        return {
          success: false,
          amount: 0,
          currency,
          toAddress,
          error: 'Retrait récent détecté, attente d\'une heure',
        };
      }

      // Générer un montant aléatoire entre min et max
      const amount = this.generateRandomAmount();
      
      exchangeLogger.info(`Tentative de retrait de ${amount} ${currency} vers ${toAddress} sur ${exchangeName}`);

      // Vérifier la balance disponible
      const balances = await this.getBalances(exchangeName);
      const availableBalance = balances.free[currency] || 0;
      
      if (availableBalance < amount) {
        exchangeLogger.warn(`Balance insuffisante sur ${exchangeName}: ${availableBalance} ${currency} < ${amount} ${currency}`);
        return {
          success: false,
          amount,
          currency,
          toAddress,
          error: `Balance insuffisante: ${availableBalance} ${currency}`,
        };
      }

      // Effectuer le retrait
      if (!exchange.withdraw) {
        throw new Error(`Méthode withdraw non disponible pour ${exchangeName}`);
      }
      const result = await exchange.withdraw(currency, amount, toAddress);
      
      // Enregistrer le retrait dans l'historique
      this.withdrawalHistory.set(toAddress, now);

      exchangeLogger.info(`Retrait effectué avec succès`, {
        exchange: exchangeName,
        currency,
        amount,
        toAddress,
        txId: result.id,
      });

      return {
        success: true,
        txId: result.id,
        amount,
        currency,
        toAddress,
        exchangeUsed: exchangeName,
        selectedWallet: { index: 0, address: toAddress, evmAddress: toAddress } as any,
      };
    } catch (error) {
      exchangeLogger.error(`Erreur lors du retrait sur ${exchangeName}:`, error);
      return {
        success: false,
        amount: 0,
        currency,
        toAddress,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      };
    }
  }

  /**
   * Vérifie le statut d'un retrait
   */
  async checkWithdrawalStatus(
    exchangeName: 'bybit' | 'binance',
    txId: string
  ): Promise<{ status: string; confirmed: boolean }> {
    try {
      await this.init();
      const exchange = this.getExchange(exchangeName);
      if (!exchange.fetchWithdrawal) {
        throw new Error(`Méthode fetchWithdrawal non disponible pour ${exchangeName}`);
      }
      const withdrawal = await exchange.fetchWithdrawal(txId);
      
      return {
        status: withdrawal.status,
        confirmed: withdrawal.status === 'ok',
      };
    } catch (error) {
      exchangeLogger.error(`Erreur lors de la vérification du statut du retrait ${txId} sur ${exchangeName}:`, error);
      return {
        status: 'error',
        confirmed: false,
      };
    }
  }

  /**
   * Récupère l'historique des retraits
   */
  async getWithdrawalHistory(
    exchangeName: 'bybit' | 'binance',
    limit: number = 50
  ): Promise<any[]> {
    try {
      await this.init();
      const exchange = this.getExchange(exchangeName);
      if (!exchange.fetchWithdrawals) {
        throw new Error(`Méthode fetchWithdrawals non disponible pour ${exchangeName}`);
      }
      const withdrawals = await exchange.fetchWithdrawals(undefined, undefined, limit);
      
      exchangeLogger.info(`Historique des retraits récupéré pour ${exchangeName}`, {
        exchange: exchangeName,
        count: withdrawals.length,
      });

      return withdrawals;
    } catch (error) {
      exchangeLogger.error(`Erreur lors de la récupération de l'historique des retraits pour ${exchangeName}:`, error);
      throw error;
    }
  }

  /**
   * Récupère les frais de retrait pour une devise
   */
  async getWithdrawalFees(
    exchangeName: 'bybit' | 'binance',
    currency: string
  ): Promise<{ fee: number; minAmount: number }> {
    try {
      await this.init();
      const exchange = this.getExchange(exchangeName);
      if (!exchange.loadMarkets) {
        throw new Error(`Méthode loadMarkets non disponible pour ${exchangeName}`);
      }
      const markets = await exchange.loadMarkets();
      const market = markets[`${currency}/USDT`];
      
      if (!market) {
        throw new Error(`Marché ${currency}/USDT non trouvé sur ${exchangeName}`);
      }

      return {
        fee: market.fees?.trading?.maker || 0,
        minAmount: market.limits?.amount?.min || 0,
      };
    } catch (error) {
      exchangeLogger.error(`Erreur lors de la récupération des frais pour ${currency} sur ${exchangeName}:`, error);
      throw error;
    }
  }

  /**
   * Récupère les statistiques des exchanges
   */
  async getExchangeStats(): Promise<{
    bybit: { balance: number; lastWithdrawal?: Date };
    binance: { balance: number; lastWithdrawal?: Date };
  }> {
    try {
      const [bybitBalances, binanceBalances] = await Promise.all([
        this.getBalances('bybit'),
        this.getBalances('binance'),
      ]);

      return {
        bybit: {
          balance: bybitBalances.total.USDT || 0,
          lastWithdrawal: this.getLastWithdrawalDate('bybit'),
        },
        binance: {
          balance: binanceBalances.total.USDT || 0,
          lastWithdrawal: this.getLastWithdrawalDate('binance'),
        },
      };
    } catch (error) {
      exchangeLogger.error('Erreur lors de la récupération des statistiques des exchanges:', error);
      throw error;
    }
  }

  /**
   * Récupère l'exchange par nom
   */
  private getExchange(exchangeName: 'bybit' | 'binance'): ExchangeLike {
    switch (exchangeName) {
      case 'bybit':
        if (!this.bybit) throw new Error('Client Bybit non initialisé');
        return this.bybit;
      case 'binance':
        if (!this.binance) throw new Error('Client Binance non initialisé');
        return this.binance;
      default:
        throw new Error(`Exchange non supporté: ${exchangeName}`);
    }
  }

  /**
   * Génère un montant aléatoire entre min et max
   */
  private generateRandomAmount(): number {
    const min = config.amounts.minWithdrawal;
    const max = config.amounts.maxWithdrawal;
    return Math.random() * (max - min) + min;
  }

  /**
   * Récupère la date du dernier retrait pour un exchange
   */
  private getLastWithdrawalDate(_exchangeName: 'bybit' | 'binance'): Date | undefined {
    // Cette méthode pourrait être améliorée pour stocker l'historique dans une base de données
    return undefined;
  }

  /**
   * Effectue un retrait aléatoire vers un wallet sélectionné aléatoirement
   * avec fallback automatique vers Binance si le solde Bybit est insuffisant
   */
  async withdrawRandom(
    wallets: Wallet[],
    currency: string = 'USDT'
  ): Promise<WithdrawalResult & { selectedWallet: Wallet; exchangeUsed: 'bybit' | 'binance' }> {
    try {
      // Initialiser les exchanges si nécessaire
      await this.init();
      
      // Sélectionner un wallet aléatoire
      const randomIndex = Math.floor(Math.random() * wallets.length);
      const selectedWallet = wallets[randomIndex];
      
      exchangeLogger.info(`Sélection aléatoire du wallet ${randomIndex} (${selectedWallet.evmAddress})`);

      // Utiliser l'orchestrateur si activé (ou NoOp si CEX désactivés)
      if (this.orchestrator) {
        const result = await this.orchestrator.withdrawWithFallback({
          currency,
          amount: '0.01', // Montant fixe pour les tests
          address: selectedWallet.evmAddress,
          network: 'ethereum',
        });
        
        return {
          success: result.success,
          txId: result.txId,
          amount: result.amount || 0,
          currency,
          toAddress: selectedWallet.evmAddress,
          error: result.error,
          selectedWallet,
          exchangeUsed: result.exchangeUsed as 'bybit' | 'binance' || 'bybit',
        };
      }

      // Chemin actuel (inchangé)
      // Gardes pour éviter les undefined
      if (!this.bybit) throw new Error('Bybit not initialized');
      if (!this.binance) throw new Error('Binance not initialized');

      // Vérifier la sécurité Bybit avant de tenter le retrait
      const bybitSecurityOk = await this.verifyBybitSecurity();
      if (!bybitSecurityOk) {
        exchangeLogger.warn('Sécurité Bybit non vérifiée, passage direct à Binance');
      }

      // Essayer d'abord Bybit si la sécurité est OK
      let result: WithdrawalResult;
      if (bybitSecurityOk) {
        result = await this.withdrawRandomAmount('bybit', selectedWallet.evmAddress, currency);
        
        if (result.success) {
          exchangeLogger.info(`Retrait Bybit réussi vers ${selectedWallet.evmAddress}`);
          return {
            ...result,
            selectedWallet,
            exchangeUsed: 'bybit',
          };
        }
      } else {
        result = {
          success: false,
          amount: 0,
          currency,
          toAddress: selectedWallet.evmAddress,
          error: 'Sécurité Bybit non vérifiée',
        };
      }

      // Si Bybit échoue (balance insuffisante ou sécurité), essayer Binance
      exchangeLogger.warn(`Échec du retrait Bybit: ${result.error}, tentative avec Binance`);
      
      // Vérifier la sécurité Binance
      const binanceSecurityOk = await this.verifyBinanceSecurity();
      if (!binanceSecurityOk) {
        exchangeLogger.error('Sécurité Binance non vérifiée, impossible de procéder au retrait');
        return {
          ...result,
          selectedWallet,
          exchangeUsed: 'bybit',
        };
      }

      // Vérifier les poids SAPI avant le retrait Binance
      if (!this.checkSapiWeights('withdraw', 10)) {
        exchangeLogger.warn('Limite SAPI Binance atteinte, attente...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      result = await this.withdrawRandomAmount('binance', selectedWallet.evmAddress, currency);
      
      if (result.success) {
        exchangeLogger.info(`Retrait Binance réussi vers ${selectedWallet.evmAddress}`);
        return {
          ...result,
          selectedWallet,
          exchangeUsed: 'binance',
        };
      }

      // Si les deux échouent
      exchangeLogger.error(`Échec des retraits sur Bybit et Binance vers ${selectedWallet.evmAddress}`);
      return {
        ...result,
        selectedWallet,
        exchangeUsed: 'bybit', // Par défaut, même si échec
      };

    } catch (error) {
      exchangeLogger.error('Erreur lors du retrait aléatoire:', error);
      return {
        success: false,
        amount: 0,
        currency,
        toAddress: '',
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        selectedWallet: wallets[0], // Fallback
        exchangeUsed: 'bybit',
      };
    }
  }

  /**
   * Effectue des retraits aléatoires en batch sur plusieurs wallets
   */
  async withdrawRandomBatch(
    wallets: Wallet[],
    batchSize: number = 5,
    currency: string = 'USDT'
  ): Promise<Array<WithdrawalResult & { selectedWallet: Wallet; exchangeUsed: 'bybit' | 'binance' }>> {
    try {
      const results: Array<WithdrawalResult & { selectedWallet: Wallet; exchangeUsed: 'bybit' | 'binance' }> = [];
      
      // Sélectionner des wallets aléatoires pour le batch
      const shuffledWallets = [...wallets].sort(() => Math.random() - 0.5);
      const selectedWallets = shuffledWallets.slice(0, Math.min(batchSize, wallets.length));
      
      exchangeLogger.info(`Début du retrait batch sur ${selectedWallets.length} wallets`);

      // Effectuer les retraits en parallèle avec délais aléatoires
      const promises = selectedWallets.map(async (wallet) => {
        // Délai aléatoire pour éviter les rate limits
        const delay = Math.random() * (config.bot.randomDelayMaxMs - config.bot.randomDelayMinMs) + config.bot.randomDelayMinMs;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.withdrawRandom([wallet], currency);
      });

      const batchResults = await Promise.allSettled(promises);
      
      // Traiter les résultats
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          exchangeLogger.error(`Erreur dans le batch pour le wallet ${index}:`, result.reason);
          results.push({
            success: false,
            amount: 0,
            currency,
            toAddress: selectedWallets[index]?.evmAddress || '',
            error: result.reason instanceof Error ? result.reason.message : 'Erreur inconnue',
            selectedWallet: selectedWallets[index] || wallets[0],
            exchangeUsed: 'bybit',
          });
        }
      });

      const successCount = results.filter(r => r.success).length;
      exchangeLogger.info(`Batch terminé: ${successCount}/${results.length} retraits réussis`);

      return results;

    } catch (error) {
      exchangeLogger.error('Erreur lors du retrait batch:', error);
      throw error;
    }
  }

  /**
   * Vérifie les balances des exchanges et retourne des recommandations
   */
  async checkExchangeBalances(currency: string = 'USDT'): Promise<{
    bybit: { balance: number; sufficient: boolean; recommended: boolean };
    binance: { balance: number; sufficient: boolean; recommended: boolean };
    recommendation: 'bybit' | 'binance' | 'both' | 'neither';
  }> {
    try {
      const [bybitBalances, binanceBalances] = await Promise.all([
        this.getBalances('bybit'),
        this.getBalances('binance'),
      ]);

      const bybitBalance = bybitBalances.free[currency] || 0;
      const binanceBalance = binanceBalances.free[currency] || 0;
      
      const minRequired = config.amounts.minWithdrawal * 10; // 10x le montant minimum pour être sûr
      
      const bybitSufficient = bybitBalance >= minRequired;
      const binanceSufficient = binanceBalance >= minRequired;
      
      let recommendation: 'bybit' | 'binance' | 'both' | 'neither';
      if (bybitSufficient && binanceSufficient) {
        recommendation = 'both';
      } else if (bybitSufficient) {
        recommendation = 'bybit';
      } else if (binanceSufficient) {
        recommendation = 'binance';
      } else {
        recommendation = 'neither';
      }

      exchangeLogger.info('Vérification des balances des exchanges', {
        bybit: { balance: bybitBalance, sufficient: bybitSufficient },
        binance: { balance: binanceBalance, sufficient: binanceSufficient },
        recommendation,
      });

      return {
        bybit: { balance: bybitBalance, sufficient: bybitSufficient, recommended: bybitSufficient },
        binance: { balance: binanceBalance, sufficient: binanceSufficient, recommended: binanceSufficient },
        recommendation,
      };

    } catch (error) {
      exchangeLogger.error('Erreur lors de la vérification des balances:', error);
      throw error;
    }
  }

  /**
   * Nettoie l'historique des retraits (supprime les entrées anciennes)
   */
  cleanWithdrawalHistory(): void {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    for (const [address, date] of this.withdrawalHistory.entries()) {
      if (date < oneDayAgo) {
        this.withdrawalHistory.delete(address);
      }
    }
    
    exchangeLogger.info(`Historique des retraits nettoyé, ${this.withdrawalHistory.size} entrées restantes`);
  }

  /**
   * Vérifie la connectivité des exchanges
   */
  async checkConnectivity(): Promise<{ bybit: boolean; binance: boolean }> {
    // Si CEX désactivés, utiliser l'orchestrateur NoOp
    if (process.env.ENABLE_CEX === 'false' && this.orchestrator && 'checkConnectivity' in this.orchestrator) {
      return await (this.orchestrator as any).checkConnectivity();
    }

    const results = { bybit: false, binance: false };

    try {
      if (this.bybit?.fetchStatus) {
        await this.bybit.fetchStatus();
        results.bybit = true;
      }
    } catch (error) {
      exchangeLogger.error('Erreur de connectivité Bybit:', error);
    }

    try {
      if (this.binance?.fetchStatus) {
        await this.binance.fetchStatus();
        results.binance = true;
      }
    } catch (error) {
      exchangeLogger.error('Erreur de connectivité Binance:', error);
    }

    return results;
  }
}

// L'instance singleton sera créée par les modules qui en ont besoin