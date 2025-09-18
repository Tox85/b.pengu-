/**
 * Factory pour les clients d'exchange avec lazy loading
 */

import { ENABLE_CEX } from '../config/env';
import { NoOpExchangeManager } from './NoOpExchangeManager';

export interface ExchangeClient {
  getBalance(symbol: string): Promise<number>;
  withdraw(symbol: string, amount: number, address: string): Promise<string>;
  isConnected(): Promise<boolean>;
}

let exchangeClient: ExchangeClient | null = null;

/**
 * Obtient le client d'exchange (lazy loading)
 * Retourne NoOpExchangeManager si ENABLE_CEX=false
 */
export async function getExchangeClient(): Promise<ExchangeClient> {
  if (exchangeClient) {
    return exchangeClient;
  }

  if (!ENABLE_CEX) {
    console.log('🔧 Mode sans CEX activé - utilisation de NoOpExchangeManager');
    exchangeClient = new NoOpExchangeManager();
    return exchangeClient;
  }

  try {
    // Lazy import des clients CEX
    const { BybitClient } = await import('./adapters/BybitClient');
    const { BinanceClient } = await import('./adapters/BinanceClient');
    
    // Pour l'instant, on utilise Bybit par défaut
    // TODO: Implémenter un orchestrateur pour choisir le meilleur exchange
    exchangeClient = new BybitClient(
      process.env.BYBIT_API_KEY!,
      process.env.BYBIT_API_SECRET!
    );
    
    console.log('🔧 Client CEX chargé (Bybit)');
    return exchangeClient;
  } catch (error) {
    console.warn('⚠️  Erreur lors du chargement du client CEX, utilisation de NoOp:', error);
    exchangeClient = new NoOpExchangeManager();
    return exchangeClient;
  }
}

/**
 * Reset du client (utile pour les tests)
 */
export function resetExchangeClient(): void {
  exchangeClient = null;
}
