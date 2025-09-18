import { Keypair } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { logger } from '../logger';

export interface SolanaKeypairConfig {
  keypairPath?: string;
  privateKeyB64?: string;
}

export class SolanaKeypairLoader {
  private config: SolanaKeypairConfig;

  constructor(config: SolanaKeypairConfig) {
    this.config = config;
  }

  loadKeypair(): Keypair {
    // Priorité 1: SOLANA_PRIVATE_KEY_B64
    if (this.config.privateKeyB64) {
      try {
        const privateKeyBytes = Buffer.from(this.config.privateKeyB64, 'base64');
        const keypair = Keypair.fromSecretKey(privateKeyBytes);
        logger.info(`Solana keypair loaded from SOLANA_PRIVATE_KEY_B64`);
        return keypair;
      } catch (error: any) {
        logger.error('Failed to load keypair from SOLANA_PRIVATE_KEY_B64:', error.message);
        throw new Error(`Invalid SOLANA_PRIVATE_KEY_B64: ${error.message}`);
      }
    }

    // Priorité 2: SOLANA_KEYPAIR_PATH
    if (this.config.keypairPath) {
      try {
        const keypairData = JSON.parse(readFileSync(this.config.keypairPath, 'utf8'));
        const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
        logger.info(`Solana keypair loaded from ${this.config.keypairPath}`);
        return keypair;
      } catch (error: any) {
        logger.error(`Failed to load keypair from ${this.config.keypairPath}:`, error.message);
        throw new Error(`Failed to load keypair from file: ${error.message}`);
      }
    }

    throw new Error('No Solana keypair configuration found. Set SOLANA_PRIVATE_KEY_B64 or SOLANA_KEYPAIR_PATH');
  }

  static fromEnv(): SolanaKeypairLoader {
    const config: SolanaKeypairConfig = {
      keypairPath: process.env.SOLANA_KEYPAIR_PATH,
      privateKeyB64: process.env.SOLANA_PRIVATE_KEY_B64,
    };

    return new SolanaKeypairLoader(config);
  }
}

// Singleton instance
let keypairLoader: SolanaKeypairLoader | null = null;

export function getSolanaKeypair(): Keypair {
  if (!keypairLoader) {
    keypairLoader = SolanaKeypairLoader.fromEnv();
  }
  return keypairLoader.loadKeypair();
}

export function createSolanaKeypair(): Keypair {
  const keypair = Keypair.generate();
  logger.info(`Generated new Solana keypair: ${keypair.publicKey.toString()}`);
  return keypair;
}
