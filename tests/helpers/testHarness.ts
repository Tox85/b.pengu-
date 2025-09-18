/**
 * Test Harness déterministe pour PENGU Bot
 * Fournit des helpers pour des tests stables et reproductibles
 */

import { vi } from 'vitest';

// Variables pour figer le temps et l'aléatoire
let frozenTime: number | null = null;
let frozenRandom: number | null = null;

/**
 * Exécute un test avec des variables d'environnement temporaires
 */
export function withEnv(envVars: Record<string, string>, testFn: () => void | Promise<void>) {
  return async () => {
    const originalEnv = { ...process.env };
    
    try {
      // Appliquer les variables d'environnement temporaires
      Object.assign(process.env, envVars);
      
      // Exécuter le test
      await testFn();
    } finally {
      // Restaurer l'environnement original
      process.env = originalEnv;
    }
  };
}

/**
 * Fige Date.now() pour des tests déterministes
 */
export function freezeTime(timestamp: number = 1640995200000) { // 2022-01-01 00:00:00 UTC
  frozenTime = timestamp;
  
  vi.spyOn(Date, 'now').mockImplementation(() => frozenTime!);
  vi.spyOn(Date.prototype, 'getTime').mockImplementation(function() {
    return frozenTime!;
  });
}

/**
 * Restaure Date.now() à son comportement normal
 */
export function unfreezeTime() {
  frozenTime = null;
  vi.restoreAllMocks();
}

/**
 * Fige Math.random() pour des tests déterministes
 */
export function freezeRandom(value: number = 0.5) {
  frozenRandom = value;
  vi.spyOn(Math, 'random').mockImplementation(() => frozenRandom!);
}

/**
 * Restaure Math.random() à son comportement normal
 */
export function unfreezeRandom() {
  frozenRandom = null;
  vi.restoreAllMocks();
}

/**
 * Custom matcher pour comparer des objets partiels
 * Évite les échecs sur des champs volatiles
 */
export function toMatchSubset(received: any, expected: any) {
  const pass = this.equals(received, expect.objectContaining(expected));
  
  if (pass) {
    return {
      message: () => `Expected ${this.utils.printReceived(received)} not to match subset ${this.utils.printExpected(expected)}`,
      pass: true,
    };
  } else {
    return {
      message: () => `Expected ${this.utils.printReceived(received)} to match subset ${this.utils.printExpected(expected)}`,
      pass: false,
    };
  }
}

/**
 * Helper pour créer des constantes de simulation stables
 */
export const SIM_CONSTANTS = {
  ROUTE_ID: 'route-sim-001',
  TX_HASH: '0xsimulateddeadbeef1234567890abcdef',
  GAS_USD: '1.23',
  FEE_USD: '0.45',
  FROM_CHAIN_ID: 1,
  TO_CHAIN_ID: 137,
  SLIPPAGE_BPS: 50,
  PRICE_IMPACT: '0.01',
  POSITION_ID: 'simulated-position-001',
  SIGNATURE: 'simulated-signature-123',
} as const;

/**
 * Helper pour créer des réponses de simulation cohérentes
 */
export function createSimResponse(type: 'bridge' | 'swap' | 'liquidity', overrides: any = {}) {
  const base = {
    success: true,
    simulated: true,
    timestamp: frozenTime || Date.now(),
  };

  switch (type) {
    case 'bridge':
      return {
        ...base,
        txHash: SIM_CONSTANTS.TX_HASH,
        route: 'cctp',
        fromChain: 'ethereum',
        toChain: 'solana',
        amount: '1000000',
        fees: '0.00042 ETH (2.1%)',
        ...overrides,
      };
    
    case 'swap':
      return {
        ...base,
        txSignature: SIM_CONSTANTS.SIGNATURE,
        inputAmount: '10 USDC',
        outputAmount: '1000 PENGU',
        actualSlippage: SIM_CONSTANTS.SLIPPAGE_BPS,
        priceImpact: SIM_CONSTANTS.PRICE_IMPACT,
        ...overrides,
      };
    
    case 'liquidity':
      return {
        ...base,
        positionId: SIM_CONSTANTS.POSITION_ID,
        signature: SIM_CONSTANTS.SIGNATURE,
        ticks: { lower: -70144, upper: -68160 },
        tokenAAmount: '25 USDC',
        tokenBAmount: '50 PENGU',
        range: '10%',
        ...overrides,
      };
    
    default:
      return { ...base, ...overrides };
  }
}

/**
 * Setup global pour tous les tests
 */
export function setupTestHarness() {
  // Figer le temps et l'aléatoire par défaut
  freezeTime();
  freezeRandom();
  
  // Ajouter le custom matcher
  expect.extend({
    toMatchSubset,
  });
}

/**
 * Cleanup global pour tous les tests
 */
export function cleanupTestHarness() {
  unfreezeTime();
  unfreezeRandom();
}
