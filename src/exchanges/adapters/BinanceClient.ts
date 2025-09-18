/**
 * Adapter Binance pour ExchangeClient
 */

import { ExchangeClient, WithdrawParams, WithdrawResult, WithdrawalSettings } from '../ExchangeClient';
import { mapExchangeError } from '../../errors';

export class BinanceClient implements ExchangeClient {
  private binance: any;
  
  constructor(binance: any) {
    this.binance = binance;
  }
  
  async ping(): Promise<boolean> {
    try {
      await this.binance.fetchAccount();
      return true;
    } catch (error) {
      return false;
    }
  }
  
  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    try {
      const result = await this.binance.withdraw(
        params.currency,
        params.amount,
        params.address,
        params.tag
      );
      
      return {
        success: true,
        txId: result.id,
        amount: parseFloat(params.amount),
        exchangeUsed: 'binance',
      };
    } catch (error) {
      const mappedError = mapExchangeError(error, 'binance');
      return {
        success: false,
        error: mappedError.message,
        exchangeUsed: 'binance',
      };
    }
  }
  
  async getBalance(currency: string): Promise<number> {
    try {
      const balance = await this.binance.fetchBalance();
      return balance[currency]?.free || 0;
    } catch (error) {
      return 0;
    }
  }
  
  async getWithdrawalSettings(currency: string): Promise<WithdrawalSettings> {
    try {
      const settings = await this.binance.fetchWithdrawalSettings(currency);
      return {
        minAmount: settings.minAmount || 0,
        maxAmount: settings.maxAmount || 1000000,
        fee: settings.fee || 0,
        enabled: settings.enabled !== false,
        networks: settings.networks || ['ethereum', 'bsc'],
      };
    } catch (error) {
      return {
        minAmount: 0,
        maxAmount: 1000000,
        fee: 0,
        enabled: false,
        networks: [],
      };
    }
  }
  
  getName(): string {
    return 'binance';
  }
}
