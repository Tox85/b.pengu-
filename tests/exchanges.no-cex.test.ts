/**
 * Tests pour vérifier que le mode sans CEX fonctionne correctement
 */

import { getExchangeClient, resetExchangeClient } from '../src/exchanges/ExchangeFactory';
import { NoOpExchangeManager } from '../src/exchanges/NoOpExchangeManager';

describe('Mode sans CEX', () => {
  beforeEach(() => {
    // Reset du client avant chaque test
    resetExchangeClient();
  });

  afterEach(() => {
    // Reset du client après chaque test
    resetExchangeClient();
  });

  it('devrait utiliser NoOpExchangeManager quand ENABLE_CEX=false', async () => {
    // Forcer ENABLE_CEX=false
    process.env.ENABLE_CEX = 'false';
    
    const client = await getExchangeClient();
    
    expect(client).toBeInstanceOf(NoOpExchangeManager);
    expect(client.getName()).toBe('NoOpExchangeManager');
  });

  it('devrait retourner des valeurs simulées pour getBalance', async () => {
    process.env.ENABLE_CEX = 'false';
    
    const client = await getExchangeClient();
    const balances = await client.checkBalances('USDT');
    
    expect(balances[0].balance).toBe(1000); // Valeur simulée de NoOpExchangeManager
  });

  it('devrait simuler un withdraw sans erreur', async () => {
    process.env.ENABLE_CEX = 'false';
    
    const client = await getExchangeClient();
    const result = await client.withdrawWithFallback({
      currency: 'USDT',
      amount: 100,
      address: '0x1234567890abcdef'
    });
    
    expect(result.success).toBe(true);
    expect(result.txId).toBe('noop-withdraw-001');
  });

  it('devrait ne pas importer les modules CEX', async () => {
    process.env.ENABLE_CEX = 'false';
    
    // Espionner les imports
    const importSpy = vi.spyOn(require, 'resolve');
    
    await getExchangeClient();
    
    // Vérifier qu'aucun import de module CEX n'a été fait
    expect(importSpy).not.toHaveBeenCalledWith('./adapters/BybitClient');
    expect(importSpy).not.toHaveBeenCalledWith('./adapters/BinanceClient');
    
    importSpy.mockRestore();
  });

  it('devrait fonctionner même sans clés API CEX', async () => {
    process.env.ENABLE_CEX = 'false';
    delete process.env.BYBIT_API_KEY;
    delete process.env.BYBIT_API_SECRET;
    delete process.env.BINANCE_API_KEY;
    delete process.env.BINANCE_API_SECRET;
    
    const client = await getExchangeClient();
    
    expect(client).toBeInstanceOf(NoOpExchangeManager);
    expect(client.getName()).toBe('NoOpExchangeManager');
  });
});
