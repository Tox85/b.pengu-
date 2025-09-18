import { 
  ComputeBudgetProgram, 
  Transaction, 
  VersionedTransaction 
} from '@solana/web3.js';
import { logger } from '../logger';

export interface ComputeBudgetConfig {
  computeUnits: number;
  microLamports: number;
}

export class ComputeBudgetService {
  private config: ComputeBudgetConfig;

  constructor(config: ComputeBudgetConfig) {
    this.config = config;
  }

  addComputeBudgetInstructions(transaction: Transaction | VersionedTransaction): void {
    if (transaction instanceof VersionedTransaction) {
      // Pour les VersionedTransaction, on ne peut pas ajouter d'instructions
      // Les paramètres doivent être passés lors de l'envoi
      logger.warn('Cannot add compute budget instructions to VersionedTransaction');
      return;
    }

    // Ajouter les instructions de compute budget
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: this.config.computeUnits,
      })
    );

    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: this.config.microLamports,
      })
    );

    logger.info(`Added compute budget: ${this.config.computeUnits} units, ${this.config.microLamports} microLamports`);
  }

  getComputeBudgetParams(): {
    computeUnitLimit?: number;
    computeUnitPrice?: number;
  } {
    return {
      computeUnitLimit: this.config.computeUnits,
      computeUnitPrice: this.config.microLamports,
    };
  }

  static fromEnv(): ComputeBudgetService {
    const config: ComputeBudgetConfig = {
      computeUnits: parseInt(process.env.SOL_COMPUTE_UNITS || '1200000'),
      microLamports: parseInt(process.env.SOL_MICRO_LAMPORTS || '1000'),
    };

    return new ComputeBudgetService(config);
  }
}

// Singleton instance
let computeBudgetService: ComputeBudgetService | null = null;

export function getComputeBudgetService(): ComputeBudgetService {
  if (!computeBudgetService) {
    computeBudgetService = ComputeBudgetService.fromEnv();
  }
  return computeBudgetService;
}
