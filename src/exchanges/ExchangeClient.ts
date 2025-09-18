/**
 * Interface stable pour les clients d'exchange
 */

export interface ExchangeClient {
  /**
   * Vérifie la connectivité de l'exchange
   */
  ping(): Promise<boolean>;
  
  /**
   * Effectue un retrait
   */
  withdraw(params: WithdrawParams): Promise<WithdrawResult>;
  
  /**
   * Vérifie le solde disponible
   */
  getBalance(currency: string): Promise<number>;
  
  /**
   * Obtient les paramètres de retrait
   */
  getWithdrawalSettings(currency: string): Promise<WithdrawalSettings>;
  
  /**
   * Obtient le nom de l'exchange
   */
  getName(): string;
}

export interface WithdrawParams {
  currency: string;
  amount: string;
  address: string;
  network?: string;
  tag?: string;
}

export interface WithdrawResult {
  success: boolean;
  txId?: string;
  amount?: number;
  error?: string;
  exchangeUsed?: string;
  selectedWallet?: any;
}

export interface WithdrawalSettings {
  minAmount: number;
  maxAmount: number;
  fee: number;
  enabled: boolean;
  networks: string[];
}

export interface ExchangeHealth {
  exchange: string;
  healthy: boolean;
  lastCheck: Date;
  error?: string;
}

export interface ExchangeBalance {
  exchange: string;
  currency: string;
  balance: number;
  sufficient: boolean;
  lastUpdated: Date;
}
