import { jest } from 'vitest';
import { ExchangeLike } from '../../modules/exchanges';

/**
 * Factory pour créer un mock Bybit conforme au format ccxt
 */
export const makeBybit = (over: Partial<any> = {}): ExchangeLike => ({
  id: 'bybit',
  fetchStatus: vi.fn().mockResolvedValue({ status: 'ok' }),
  fetchBalance: vi.fn().mockResolvedValue({
    total: { USDC: 1000, USDT: 1000 }, 
    free: { USDC: 1000, USDT: 1000 }, 
    used: { USDC: 0, USDT: 0 },
  }), // ccxt renvoie {free, used, total} – aligne tes asserts
  fetchAccount: vi.fn().mockResolvedValue({ uid: 'MASTER', masterUid: 'test-master-uid', info: {} }),
  fetchWithdrawalSettings: vi.fn().mockResolvedValue({ whitelist: true, whitelistEnabled: true }),
  withdraw: vi.fn().mockResolvedValue({ 
    id: 'mock-withdraw-bybit', 
    amount: 0.01, 
    currency: 'USDC', 
    address: '0x123', 
    status: 'ok' 
  }),
  fetchWithdrawal: vi.fn().mockResolvedValue({ status: 'ok' }),
  fetchWithdrawals: vi.fn().mockResolvedValue([]),
  loadMarkets: vi.fn().mockResolvedValue({
    'USDC/USDC': {
      fees: { trading: { maker: 0.001 } },
      limits: { amount: { min: 0.001 } }
    }
  }),
  ...over,
} as any);

/**
 * Factory pour créer un mock Binance conforme au format ccxt
 */
export const makeBinance = (over: Partial<any> = {}): ExchangeLike => ({
  id: 'binance',
  fetchStatus: vi.fn().mockResolvedValue({ status: 'ok' }),
  fetchBalance: vi.fn().mockResolvedValue({
    total: { USDC: 1000, USDT: 1000 }, 
    free: { USDC: 1000, USDT: 1000 }, 
    used: { USDC: 0, USDT: 0 },
  }),
  fetchAccount: vi.fn().mockResolvedValue({ accountType: 'spot' }),
  fetchWithdrawalSettings: vi.fn().mockResolvedValue({ withdrawalEnabled: true }),
  withdraw: vi.fn().mockResolvedValue({ 
    id: 'mock-withdraw-binance', 
    amount: 0.01, 
    currency: 'USDC', 
    address: '0x123', 
    status: 'ok' 
  }),
  fetchWithdrawal: vi.fn().mockResolvedValue({ status: 'ok' }),
  fetchWithdrawals: vi.fn().mockResolvedValue([]),
  loadMarkets: vi.fn().mockResolvedValue({
    'USDC/USDC': {
      fees: { trading: { maker: 0.001 } },
      limits: { amount: { min: 0.001 } }
    }
  }),
  ...over,
} as any);

/**
 * Factory pour créer un mock Bybit qui échoue
 */
export const makeBybitFailing = (over: Partial<any> = {}): ExchangeLike => {
  const mock = makeBybit();
  (mock.withdraw as any).mockRejectedValue(new Error('Bybit withdrawal failed'));
  return { ...mock, ...over };
};

/**
 * Factory pour créer un mock Binance qui échoue
 */
export const makeBinanceFailing = (over: Partial<any> = {}): ExchangeLike => {
  const mock = makeBinance();
  (mock.withdraw as any).mockRejectedValue(new Error('Binance withdrawal failed'));
  return { ...mock, ...over };
};
