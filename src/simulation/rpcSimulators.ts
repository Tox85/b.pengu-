/**
 * Simulateurs RPC pour les tests et SIGN_ONLY
 */

import { SIM } from '../sim/simConstants';

export interface SimulationResult {
  success: boolean;
  logs: string[];
  error?: string;
  gasUsed?: number;
  returnData?: string;
  txHash?: string;
}

export interface SimulationValidation {
  success: boolean;
  details: string;
  warnings: string[];
}

// Utilise les constantes centralisées

/**
 * Simule une transaction de bridge
 */
export async function simulateBridgeTransaction(
  connection: any,
  transactionData: any,
  chainType: 'solana' | 'evm'
): Promise<SimulationResult> {
  try {
    // Simuler un délai de réseau
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    if (chainType === 'solana') {
      return simulateSolanaTransaction(connection, transactionData);
    } else {
      return simulateEvmTransaction(connection, transactionData);
    }
  } catch (error) {
    return {
      success: false,
      logs: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Simule une transaction de trading
 */
export async function simulateTradingTransaction(
  connection: any,
  transactionData: any,
  chainType: 'solana' | 'evm'
): Promise<SimulationResult> {
  try {
    // Simuler un délai de réseau
    await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 300));

    if (chainType === 'solana') {
      return simulateSolanaTransaction(connection, transactionData);
    } else {
      return simulateEvmTransaction(connection, transactionData);
    }
  } catch (error) {
    return {
      success: false,
      logs: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Simule une transaction de liquidité
 */
export async function simulateLiquidityTransaction(
  connection: any,
  transactionData: any,
  chainType: 'solana' | 'evm'
): Promise<SimulationResult> {
  try {
    // Simuler un délai de réseau
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 400));

    if (chainType === 'solana') {
      return simulateSolanaTransaction(connection, transactionData);
    } else {
      return simulateEvmTransaction(connection, transactionData);
    }
  } catch (error) {
    return {
      success: false,
      logs: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Simule une transaction Solana
 */
function simulateSolanaTransaction(_connection: any, _transactionData: any): SimulationResult {
  // Simuler une transaction Solana réussie
  return {
    success: true,
    logs: [
      'Program log: Simulated Solana transaction',
      'Program log: Transaction executed successfully',
    ],
    gasUsed: 5000,
    returnData: '0x0000000000000000000000000000000000000000000000000000000000000001',
    txHash: SIM.TX_HASH,
  };
}

/**
 * Simule une transaction EVM
 */
function simulateEvmTransaction(_connection: any, _transactionData: any): SimulationResult {
  // Simuler une transaction EVM réussie
  return {
    success: true,
    logs: [
      'Simulated EVM transaction',
      'Transaction executed successfully',
    ],
    gasUsed: 21000,
    returnData: '0x0000000000000000000000000000000000000000000000000000000000000001',
    txHash: SIM.TX_HASH,
  };
}

/**
 * Valide le résultat d'une simulation
 */
export function validateSimulationResult(
  result: SimulationResult,
  operationType: 'bridge' | 'trading' | 'liquidity'
): SimulationValidation {
  const warnings: string[] = [];
  let details = '';

  if (!result.success) {
    return {
      success: false,
      details: `Simulation failed: ${result.error}`,
      warnings: [result.error || 'Unknown error'],
    };
  }

  // Vérifier les logs pour des avertissements
  if (result.logs.some(log => log.includes('warning') || log.includes('WARN'))) {
    warnings.push('Warnings detected in simulation logs');
  }

  // Vérifier l'utilisation de gas
  if (result.gasUsed && result.gasUsed > 100000) {
    warnings.push(`High gas usage: ${result.gasUsed}`);
  }

  // Vérifier le type d'opération
  switch (operationType) {
    case 'bridge':
      details = 'Bridge transaction simulated successfully';
      break;
    case 'trading':
      details = 'Trading transaction simulated successfully';
      break;
    case 'liquidity':
      details = 'Liquidity transaction simulated successfully';
      break;
    default:
      details = 'Transaction simulated successfully';
  }

  return {
    success: true,
    details,
    warnings,
  };
}

/**
 * Simule une erreur de réseau
 */
export function simulateNetworkError(): SimulationResult {
  return {
    success: false,
    logs: [],
    error: 'Network timeout',
  };
}

/**
 * Simule une erreur de solde insuffisant
 */
export function simulateInsufficientBalanceError(): SimulationResult {
  return {
    success: false,
    logs: [],
    error: 'Insufficient balance',
  };
}

/**
 * Simule une erreur de slippage
 */
export function simulateSlippageError(): SimulationResult {
  return {
    success: false,
    logs: [],
    error: 'Slippage too high',
  };
}