/**
 * Simulateur Jupiter pour les tests et DRY_RUN
 */

import { SIM, createSimResponse } from '../sim/simConstants';

export interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
}

export interface JupiterSwapParams {
  quoteResponse: any;
  userPublicKey: string;
  wrapAndUnwrapSol: boolean;
}

export interface JupiterConnectivityResult {
  connected: boolean;
  error?: string;
}

export class JupiterSimConnector {
  private readonly name = 'JupiterSimConnector';
  
  // Utilise les constantes centralisées

  constructor() {
    console.log('[jupiter][SIM] Jupiter simulator initialized');
  }

  /**
   * Simule un devis de swap
   */
  async quote(params: JupiterQuoteParams): Promise<any> {
    const { inputMint, outputMint, amount, slippageBps } = params;
    
    // Simuler un délai de réseau
    await this.simulateDelay(100, 500);

    // Simuler un devis basique
    const inputAmount = parseFloat(amount);
    const outputAmount = inputAmount * 2000000; // 1 USDC = 2M PENGU simulé

    return {
      inputMint,
      outputMint,
      inAmount: amount,
      outAmount: Math.floor(outputAmount).toString(),
      otherAmountThreshold: Math.floor(outputAmount * (1 - slippageBps / 10000)).toString(),
      swapMode: 'ExactIn',
      slippageBps: SIM.SLIPPAGE_BPS,
      priceImpactPct: '0.05',
      routePlan: [
        {
          swapInfo: {
            ammKey: 'simulated-amm',
            label: 'Simulated AMM',
            inputMint,
            inAmount: amount,
            outputMint,
            outAmount: Math.floor(outputAmount).toString(),
            notEnoughLiquidity: false,
            minInAmount: amount,
            minOutAmount: Math.floor(outputAmount * (1 - slippageBps / 10000)).toString(),
            priceImpactPct: '0.05',
            lpFee: {
              amount: '0',
              mint: inputMint,
              pct: 0.25,
            },
            platformFee: {
              amount: '0',
              mint: inputMint,
              pct: 0,
            },
          },
          percent: 100,
        },
      ],
    };
  }

  /**
   * Simule un swap
   */
  async swap(params: JupiterSwapParams): Promise<any> {
    const { userPublicKey } = params;
    
    // Simuler un délai de réseau
    await this.simulateDelay(200, 800);

    // Simuler une transaction avec des données binaires valides
    // Créer une transaction Solana simulée basique
    const mockTransactionData = new Uint8Array([
      // Version (1 byte) - Version 0
      0x00,
      // Number of signatures (1 byte)
      0x01,
      // Signature (64 bytes) - rempli de zéros pour simulation
      ...new Array(64).fill(0x00),
      // Message header (3 bytes)
      0x01, 0x00, 0x01,
      // Number of account keys (1 byte)
      0x02,
      // Account keys (32 bytes each)
      ...new Array(32).fill(0x11), // Compte 1 simulé
      ...new Array(32).fill(0x22), // Compte 2 simulé
      // Recent blockhash (32 bytes)
      ...new Array(32).fill(0x33),
      // Number of instructions (1 byte)
      0x01,
      // Instruction (program id index, accounts length, accounts, data length, data)
      0x00, 0x01, 0x01, 0x04, 0x01, 0x02, 0x03, 0x04
    ]);

    const mockTransaction = {
      swapTransaction: Buffer.from(mockTransactionData).toString('base64'),
      txHash: SIM.TX_HASH,
    };

    return mockTransaction;
  }

  /**
   * Simule la vérification de connectivité
   */
  async checkConnectivity(): Promise<JupiterConnectivityResult> {
    // Simuler un délai de réseau
    await this.simulateDelay(50, 200);

    return {
      connected: true,
    };
  }

  /**
   * Simule un délai de réseau
   */
  private async simulateDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Obtient le nom du connecteur
   */
  getName(): string {
    return this.name;
  }
}