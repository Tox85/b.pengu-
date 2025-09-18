/**
 * Orchestrateur d'exchanges avec retry, circuit breaker et idempotence
 */

import { ExchangeClient, WithdrawParams, WithdrawResult, ExchangeHealth, ExchangeBalance } from './ExchangeClient';
import { retry, RetryOptions } from '../lib/retry';
import { CircuitBreaker } from '../lib/circuitBreaker';
import { IdempotencyStore, generateIdempotencyKey } from '../state/idempotencyStore';
import { isRetryableError, isDeterministicError } from '../errors';
import { getExchangeConfig, getEnabledExchanges, FEATURE_FLAGS } from '../config/exchanges';

export class ExchangeOrchestrator {
  private clients: Map<string, ExchangeClient> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private idempotencyStore: IdempotencyStore;
  
  constructor(
    clients: ExchangeClient[],
    idempotencyStore: IdempotencyStore
  ) {
    // Enregistrer les clients
    for (const client of clients) {
      this.clients.set(client.getName(), client);
      
      // Créer le circuit breaker pour ce client
      const config = getExchangeConfig(client.getName());
      this.circuitBreakers.set(client.getName(), new CircuitBreaker({
        failureThreshold: config.circuitBreaker.failureThreshold,
        openMs: config.circuitBreaker.openMs,
        halfOpenMaxCalls: config.circuitBreaker.halfOpenMaxCalls,
      }));
    }
    
    this.idempotencyStore = idempotencyStore;
  }
  
  /**
   * Effectue un retrait avec fallback automatique
   */
  async withdrawWithFallback(params: WithdrawParams): Promise<WithdrawResult> {
    // Vérifier l'idempotence si activée
    if (FEATURE_FLAGS.ENABLE_IDEMPOTENCY) {
      const idempotencyKey = generateIdempotencyKey(
        params.currency,
        params.amount,
        params.address,
        params.network || 'ethereum'
      );
      
      const existing = await this.idempotencyStore.get(idempotencyKey);
      if (existing) {
        return existing;
      }
    }
    
    // Obtenir les exchanges activés par ordre de priorité
    const enabledExchanges = getEnabledExchanges();
    
    for (const exchangeName of enabledExchanges) {
      const client = this.clients.get(exchangeName);
      if (!client) continue;
      
      // Vérifier le circuit breaker
      const circuitBreaker = this.circuitBreakers.get(exchangeName);
      if (circuitBreaker && !circuitBreaker.allow()) {
        console.log(`Circuit breaker OPEN pour ${exchangeName}, passage au suivant`);
        continue;
      }
      
      try {
        // Ping rapide pour vérifier la connectivité
        const isHealthy = await client.ping();
        if (!isHealthy) {
          console.log(`${exchangeName} non disponible, passage au suivant`);
          continue;
        }
        
        // Effectuer le retrait avec retry
        const result = await this.withdrawWithRetry(client, params);
        
        if (result.success) {
          // Stocker le résultat pour l'idempotence
          if (FEATURE_FLAGS.ENABLE_IDEMPOTENCY) {
            const idempotencyKey = generateIdempotencyKey(
              params.currency,
              params.amount,
              params.address,
              params.network || 'ethereum'
            );
            await this.idempotencyStore.set(
              idempotencyKey,
              result,
              getExchangeConfig(exchangeName).idempotency.ttlMs
            );
          }
          
          return result;
        }
        
        // Si c'est une erreur déterministe, ne pas essayer les autres exchanges
        if (result.error && isDeterministicError(new Error(result.error))) {
          console.log(`Erreur déterministe pour ${exchangeName}: ${result.error}`);
          break;
        }
        
      } catch (error) {
        console.log(`Erreur avec ${exchangeName}:`, error);
        continue;
      }
    }
    
    // Aucun exchange n'a réussi
    return {
      success: false,
      error: 'Tous les exchanges ont échoué',
    };
  }
  
  /**
   * Effectue un retrait avec retry
   */
  private async withdrawWithRetry(
    client: ExchangeClient,
    params: WithdrawParams
  ): Promise<WithdrawResult> {
    const config = getExchangeConfig(client.getName());
    const retryOptions: RetryOptions = {
      tries: config.retryConfig.maxRetries,
      baseMs: config.retryConfig.baseMs,
      maxMs: config.retryConfig.maxMs,
      isRetryable: (error) => isRetryableError(error),
    };
    
    const result = await retry(async () => {
      return await client.withdraw(params);
    }, retryOptions);
    
    if (result.success) {
      return result.result!;
    } else {
      return {
        success: false,
        error: result.error?.message || 'Erreur inconnue',
        exchangeUsed: client.getName(),
      };
    }
  }
  
  /**
   * Vérifie la santé de tous les exchanges
   */
  async checkHealth(): Promise<ExchangeHealth[]> {
    const results: ExchangeHealth[] = [];
    
    for (const [name, client] of this.clients) {
      try {
        const isHealthy = await client.ping();
        results.push({
          exchange: name,
          healthy: isHealthy,
          lastCheck: new Date(),
        });
      } catch (error) {
        results.push({
          exchange: name,
          healthy: false,
          lastCheck: new Date(),
          error: (error as Error).message,
        });
      }
    }
    
    return results;
  }
  
  /**
   * Vérifie les balances de tous les exchanges
   */
  async checkBalances(currency: string): Promise<ExchangeBalance[]> {
    const results: ExchangeBalance[] = [];
    
    for (const [name, client] of this.clients) {
      try {
        const balance = await client.getBalance(currency);
        const settings = await client.getWithdrawalSettings(currency);
        const minRequired = settings.minAmount || 0;
        
        results.push({
          exchange: name,
          currency,
          balance,
          sufficient: balance >= minRequired,
          lastUpdated: new Date(),
        });
      } catch (error) {
        results.push({
          exchange: name,
          currency,
          balance: 0,
          sufficient: false,
          lastUpdated: new Date(),
        });
      }
    }
    
    return results;
  }
  
  /**
   * Obtient la recommandation d'exchange basée sur les balances
   */
  async getRecommendation(currency: string): Promise<string | null> {
    const balances = await this.checkBalances(currency);
    const sufficient = balances.filter(b => b.sufficient);
    
    if (sufficient.length === 0) {
      return null;
    }
    
    // Retourner l'exchange avec la plus haute priorité qui a un solde suffisant
    const enabledExchanges = getEnabledExchanges();
    for (const exchangeName of enabledExchanges) {
      const balance = balances.find(b => b.exchange === exchangeName);
      if (balance && balance.sufficient) {
        return exchangeName;
      }
    }
    
    return null;
  }
}
