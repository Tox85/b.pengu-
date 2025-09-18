/**
 * Simulateur LI.FI pour les tests et DRY_RUN
 */

import { SIM, createSimResponse } from '../sim/simConstants';

export interface LifiQuoteParams {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
}

export interface LifiConnectivityResult {
  connected: boolean;
  error?: string;
}

export class LifiSimConnector {
  private readonly name = 'LifiSimConnector';
  private testMode: 'ok' | 'empty' | 'error' | 'flaky' = 'ok';
  
  // Utilise les constantes centralisées

  constructor(testMode: 'ok' | 'empty' | 'error' | 'flaky' = 'ok') {
    this.testMode = testMode;
    console.log('[lifi][SIM] LI.FI simulator initialized');
  }

  /**
   * Simule un devis de bridge
   */
  async get(params: LifiQuoteParams): Promise<any> {
    const { fromChain, toChain, fromToken, toToken, fromAmount } = params;
    
    // Simuler un délai de réseau
    await this.simulateDelay(200, 800);

    // Gérer différents modes de test
    if (this.testMode === 'empty') {
      return { data: [] };
    }
    
    if (this.testMode === 'error') {
      throw new Error('Simulated API error');
    }
    
    if (this.testMode === 'flaky') {
      // Simuler un échec aléatoire
      if (Math.random() < 0.5) {
        throw new Error('Simulated network error');
      }
    }

    // Simuler un devis basique
    const inputAmount = parseFloat(fromAmount);
    const outputAmount = inputAmount * 0.98; // 2% de frais simulés
    
    // S'assurer que outputAmount est au moins 1 pour éviter les pertes de 100%
    const finalOutputAmount = Math.max(outputAmount, 1);

    return {
      data: [
        {
          id: SIM.QUOTE_ID,
          fromChain,
          toChain,
          fromToken: {
            address: fromToken,
            symbol: 'USDT',
            decimals: 6,
            chainId: parseInt(fromChain),
          },
          toToken: {
            address: toToken,
            symbol: 'USDT',
            decimals: 6,
            chainId: parseInt(toChain),
          },
          fromAmount,
          toAmount: Math.floor(finalOutputAmount).toString(),
          tool: 'cctp',
          toolDetails: {
            key: 'cctp',
            name: 'Circle CCTP',
            logoURI: 'https://example.com/cctp-logo.png',
          },
          gasCosts: [
            {
              type: 'gas',
              price: '0.001',
              gasPrice: '20000000000',
              gasLimit: '100000',
              balance: '1.0',
              balanceUSD: '2000',
              token: {
                address: '0x0000000000000000000000000000000000000000',
                chainId: parseInt(fromChain),
                symbol: 'ETH',
                decimals: 18,
                logoURI: 'https://example.com/eth-logo.png',
              },
            },
          ],
          steps: [
            {
              type: 'bridge',
              tool: 'cctp',
              toolDetails: {
                key: 'cctp',
                name: 'Circle CCTP',
                logoURI: 'https://example.com/cctp-logo.png',
              },
              fromChain,
              toChain,
              fromToken,
              toToken,
              fromAmount,
              toAmount: Math.floor(finalOutputAmount).toString(),
              fromAddress: '0x0000000000000000000000000000000000000000',
              toAddress: '0x0000000000000000000000000000000000000000',
              gasCosts: [
                {
                  type: 'gas',
                  price: '0.001',
                  gasPrice: '20000000000',
                  gasLimit: '100000',
                  balance: '1.0',
                  balanceUSD: '2000',
                  token: {
                    address: '0x0000000000000000000000000000000000000000',
                    chainId: parseInt(fromChain),
                    symbol: 'ETH',
                    decimals: 18,
                    logoURI: 'https://example.com/eth-logo.png',
                  },
                },
              ],
            },
          ],
        },
      ],
    };
  }

  /**
   * Simule la vérification de connectivité
   */
  async checkConnectivity(): Promise<LifiConnectivityResult> {
    // Simuler un délai de réseau
    await this.simulateDelay(100, 300);

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