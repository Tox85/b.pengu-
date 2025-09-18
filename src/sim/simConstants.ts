/**
 * Constantes de simulation stables pour PENGU Bot
 * Garantit la reproductibilité des tests
 */

export const SIM = {
  // Identifiants stables
  ROUTE_ID: 'route-sim-001',
  QUOTE_ID: 'quote-sim-001',
  TX_HASH: '0xsimulateddeadbeef1234567890abcdef',
  SIGNATURE: 'transactionSignature123',
  POSITION_ID: 'simulated-position-001',
  
  // Montants stables
  GAS_USD: '1.23',
  FEE_USD: '0.45',
  SLIPPAGE_BPS: 50,
  PRICE_IMPACT: '0.01',
  
  // Chaînes
  FROM_CHAIN_ID: 1,
  TO_CHAIN_ID: 137,
  FROM_CHAIN: 'ethereum',
  TO_CHAIN: 'solana',
  
  // Tokens
  USDC_AMOUNT: '1000000',
  PENGU_AMOUNT: '2000000',
  USDC_DECIMALS: 6,
  PENGU_DECIMALS: 6,
  
  // Ticks de liquidité
  TICK_LOWER: -70144,
  TICK_UPPER: -68160,
  
  // Adresses simulées
  USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  PENGU_MINT: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
  USDT_MINT: '0xA0b86a33E6c0b6c0b6c0b6c0b6c0b6c0b6c0b6c0',
  
  // Statuts
  STATUS_DONE: 'DONE',
  STATUS_PENDING: 'PENDING',
  STATUS_FAILED: 'FAILED',
  
  // Erreurs simulées
  ERROR_INSUFFICIENT_BALANCE: 'Solde insuffisant',
  ERROR_SLIPPAGE_TOO_HIGH: 'Slippage trop élevé',
  ERROR_NETWORK: 'Erreur réseau simulée',
  ERROR_TRANSACTION_FAILED: 'Transaction échouée',
} as const;

/**
 * Helper pour créer des réponses de simulation cohérentes
 */
export function createSimResponse(type: 'bridge' | 'swap' | 'liquidity' | 'cex', overrides: any = {}) {
  const base = {
    success: true,
    simulated: true,
    timestamp: Date.now(),
  };

  switch (type) {
    case 'bridge':
      return {
        ...base,
        txHash: SIM.TX_HASH,
        route: 'cctp',
        fromChain: SIM.FROM_CHAIN,
        toChain: SIM.TO_CHAIN,
        amount: SIM.USDC_AMOUNT,
        fees: '0.00042 ETH (2.1%)',
        routeId: SIM.ROUTE_ID,
        ...overrides,
      };
    
    case 'swap':
      return {
        ...base,
        txSignature: SIM.SIGNATURE,
        inputAmount: '10 USDC',
        outputAmount: '1000 PENGU',
        actualSlippage: SIM.SLIPPAGE_BPS,
        priceImpact: SIM.PRICE_IMPACT,
        ...overrides,
      };
    
    case 'liquidity':
      return {
        ...base,
        positionId: SIM.POSITION_ID,
        signature: SIM.SIGNATURE,
        ticks: { 
          lower: SIM.TICK_LOWER, 
          upper: SIM.TICK_UPPER 
        },
        tokenAAmount: '25 USDC',
        tokenBAmount: '50 PENGU',
        range: '10%',
        ...overrides,
      };
    
    case 'cex':
      return {
        ...base,
        txId: 'noop-withdraw-001',
        amount: 100,
        currency: 'USDC',
        status: SIM.STATUS_DONE,
        exchangeUsed: 'NoOp',
        ...overrides,
      };
    
    default:
      return { ...base, ...overrides };
  }
}

/**
 * Helper pour créer des erreurs simulées
 */
export function createSimError(type: 'balance' | 'slippage' | 'network' | 'transaction', overrides: any = {}) {
  const base = {
    success: false,
    simulated: true,
    timestamp: Date.now(),
  };

  switch (type) {
    case 'balance':
      return {
        ...base,
        error: SIM.ERROR_INSUFFICIENT_BALANCE,
        ...overrides,
      };
    
    case 'slippage':
      return {
        ...base,
        error: SIM.ERROR_SLIPPAGE_TOO_HIGH,
        ...overrides,
      };
    
    case 'network':
      return {
        ...base,
        error: SIM.ERROR_NETWORK,
        ...overrides,
      };
    
    case 'transaction':
      return {
        ...base,
        error: SIM.ERROR_TRANSACTION_FAILED,
        ...overrides,
      };
    
    default:
      return { ...base, error: 'Erreur simulée', ...overrides };
  }
}
