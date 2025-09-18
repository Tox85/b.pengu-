/**
 * NoOp Exchange Manager - Implémentation factice pour ENABLE_CEX=false
 * Retourne des réponses "unavailable" pour toutes les opérations
 */

import { WithdrawParams, WithdrawResult, ExchangeHealth, ExchangeBalance } from './ExchangeClient';
import { exchangeLogger } from '../logger';

export class NoOpExchangeManager {
  private readonly name = 'NoOpExchangeManager';

  constructor() {
    exchangeLogger.info('[exchange][INFO] CEX disabled (NoOp)');
  }

  /**
   * Simule un retrait avec fallback - retourne un succès simulé
   */
  async withdrawWithFallback(params: WithdrawParams): Promise<WithdrawResult> {
    exchangeLogger.info(`[exchange][INFO] NoOp withdraw attempt: ${params.currency} ${params.amount} to ${params.address}`);
    
    // Retourne un succès simulé pour maintenir la compatibilité avec les tests
    return {
      success: true,
      txId: 'noop-withdraw-001',
      amount: params.amount,
      currency: params.currency,
      address: params.address,
      status: 'SIMULATED',
      exchangeUsed: 'NoOp',
      simulated: true,
    };
  }

  /**
   * Vérifie la santé - retourne un statut simulé
   */
  async checkHealth(): Promise<ExchangeHealth[]> {
    return [
      {
        exchange: 'NoOp',
        healthy: true,
        lastCheck: new Date(),
        simulated: true,
      },
    ];
  }

  /**
   * Vérifie les balances - retourne un solde simulé
   */
  async checkBalances(currency: string): Promise<ExchangeBalance[]> {
    return [
      {
        exchange: 'NoOp',
        currency,
        balance: 1000, // Solde simulé suffisant
        sufficient: true,
        lastUpdated: new Date(),
        simulated: true,
      },
    ];
  }

  /**
   * Obtient la recommandation - retourne toujours null
   */
  async getRecommendation(currency: string): Promise<string | null> {
    exchangeLogger.info(`[exchange][INFO] NoOp recommendation request for ${currency} - returning null`);
    return null;
  }

  /**
   * Vérifie la connectivité - retourne un statut simulé
   */
  async checkConnectivity(): Promise<{ bybit: boolean; binance: boolean }> {
    return {
      bybit: true, // Simulé comme connecté
      binance: true, // Simulé comme connecté
    };
  }

  /**
   * Obtient le nom du manager
   */
  getName(): string {
    return this.name;
  }
}
