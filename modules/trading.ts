import axios, { AxiosInstance } from 'axios';
import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import { config } from '../src/config/env';
import { tradingLogger } from '../src/logger';
import { SwapQuote, TOKEN_ADDRESSES } from '../src/types';
import { JupiterSimConnector } from '../src/simulation/JupiterSimConnector';
import { simulateTradingTransaction, validateSimulationResult } from '../src/simulation/rpcSimulators';
// import { walletManager } from './wallets'; // Remplacé par injection de dépendances

export interface TradingDependencies {
  jupiterApi?: AxiosInstance | JupiterSimConnector;
  tokensApi?: AxiosInstance;
  connection?: Connection;
  walletManager?: any;
  config?: any;
  logger?: any;
}

export class TradingManager {
  private jupiterApi?: AxiosInstance | JupiterSimConnector;
  private tokensApi?: AxiosInstance;
  private connection?: Connection;
  private walletManager?: any;
  private config: any;
  // private tokenCache: Map<string, any> = new Map();
  // private cacheExpiry: Map<string, number> = new Map();
  // private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private rateLimitCache: Map<string, { count: number; resetTime: number }> = new Map();
  private initialized = false;

  constructor(deps?: TradingDependencies) {
    this.jupiterApi = deps?.jupiterApi;
    this.tokensApi = deps?.tokensApi;
    this.connection = deps?.connection ?? new Connection(config.rpc.solana, 'confirmed');
    this.walletManager = deps?.walletManager;
    this.config = deps?.config || config;
  }

  /**
   * Initialise les connexions (appelé explicitement)
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    // Vérifier si on est en mode DRY_RUN
    if (process.env.DRY_RUN === 'true') {
      tradingLogger.info('[trading][INFO] DRY_RUN mode - using Jupiter simulator');
      this.jupiterApi = new JupiterSimConnector();
      this.initialized = true;
      return;
    }
    
    // Ne créer les clients que si non injectés
    if (!this.jupiterApi || !this.tokensApi) {
      this.initializeApi();
    }
    if (!this.connection) {
      this.connection = new Connection(this.config.rpc.solana, 'confirmed');
    }
    this.initialized = true;
  }

  /**
   * Initialise l'API Jupiter
   */
  private initializeApi(): void {
    this.jupiterApi = axios.create({
      baseURL: 'https://quote-api.jup.ag/v6',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.jupiter.apiKey && { 'Authorization': `Bearer ${this.config.jupiter.apiKey}` }),
      },
      timeout: 30000,
    });

    this.tokensApi = axios.create({
      baseURL: 'https://tokens.jup.ag/v2',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.jupiter.apiKey && { 'Authorization': `Bearer ${this.config.jupiter.apiKey}` }),
      },
      timeout: 30000,
    });

    tradingLogger.info('API Jupiter v6 + Token API v2 initialisée');
  }

  /**
   * Retry avec backoff exponentiel pour éviter les rate limits
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Si c'est une erreur 429 (rate limit), on attend plus longtemps
        if (error.response?.status === 429) {
          const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
          tradingLogger.warn(`Rate limit détecté, attente de ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries,
            status: error.response.status,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (error.response?.status >= 500) {
          // Erreur serveur, on retry avec un délai plus court
          const delay = baseDelay * (attempt + 1);
          tradingLogger.warn(`Erreur serveur, retry dans ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries,
            status: error.response.status,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Autre erreur, on ne retry pas
          throw error;
        }
      }
    }
    
    throw lastError!;
  }

  // /**
  //  * Récupère les métadonnées d'un token avec cache
  //  */
  // private async _getTokenMetadata(mintAddress: string): Promise<any> {
  //   const now = Date.now();
  //   const cached = this.tokenCache.get(mintAddress);
  //   const expiry = this.cacheExpiry.get(mintAddress);
  //   
  //   if (cached && expiry && now < expiry) {
  //     return cached;
  //   }
  //   
  //   try {
  //     const metadata = await this.retryWithBackoff(async () => {
  //       const response = await this.tokensApi.get(`/token/${mintAddress}`);
  //       return response.data;
  //     });
  //     
  //     this.tokenCache.set(mintAddress, metadata);
  //     this.cacheExpiry.set(mintAddress, now + this.CACHE_DURATION);
  //     
  //     return metadata;
  //   } catch (error) {
  //     tradingLogger.error('Erreur lors de la récupération des métadonnées du token', {
  //       mintAddress,
  //       error: error instanceof Error ? error.message : 'Unknown error',
  //     });
  //     throw error;
  //   }
  // }

  /**
   * Vérifie et gère les rate limits
   */
  private checkRateLimit(endpoint: string, maxRequests: number = 100, windowMs: number = 60000): boolean {
    const now = Date.now();
    const key = endpoint;
    const rateLimit = this.rateLimitCache.get(key);

    if (!rateLimit || now > rateLimit.resetTime) {
      // Nouvelle fenêtre de temps
      this.rateLimitCache.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (rateLimit.count >= maxRequests) {
      tradingLogger.warn(`Rate limit atteint pour ${endpoint}`, {
        count: rateLimit.count,
        resetTime: new Date(rateLimit.resetTime),
      });
      return false;
    }

    rateLimit.count++;
    return true;
  }

  /**
   * Récupère un devis de swap
   */
  async getSwapQuote(
    inputMint: string,
    outputMint: string,
    amount: string,
    slippageBps: number = config.amounts.defaultSlippageBps
  ): Promise<SwapQuote | null> {
    await this.init();
    
    if (!this.jupiterApi) {
      throw new Error('Jupiter API not initialized');
    }
    
    try {
      // Vérifier les rate limits
      if (!this.checkRateLimit('quote', 50, 60000)) {
        tradingLogger.warn('Rate limit atteint pour getSwapQuote, attente...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const response = await this.retryWithBackoff(async () => {
        // Utiliser le simulateur ou l'API réelle selon le type
        if (this.jupiterApi instanceof JupiterSimConnector) {
          return await this.jupiterApi.quote({
            inputMint,
            outputMint,
            amount,
            slippageBps,
          });
        } else {
          return await this.jupiterApi!.get('/quote', {
            params: {
              inputMint,
              outputMint,
              amount,
              slippageBps,
            },
          });
        }
      });

      // Gérer les deux types de réponse (API réelle vs simulateur)
      const quoteData = 'data' in response ? response.data : response;
      
      if (quoteData) {
        tradingLogger.info('Devis de swap récupéré', {
          inputMint,
          outputMint,
          amount,
          outputAmount: quoteData.outAmount,
          priceImpact: quoteData.priceImpactPct,
        });
        return quoteData;
      }

      return null;
    } catch (error) {
      tradingLogger.error('Erreur lors de la récupération du devis de swap:', error);
      return null;
    }
  }

  /**
   * Échange USDC vers PENGU avec contrôle des soldes et gestion des slippages
   */
  async swapUsdcToPengu(
    walletIndex: number,
    usdcAmount: number,
    slippageBps?: number
  ): Promise<{ success: boolean; txSignature?: string; error?: string; actualSlippage?: number; simulated?: boolean }> {
    await this.init();
    
    // Garde pour amount > 0
    if (usdcAmount <= 0) {
      tradingLogger.warn(`[trading][WARN] skip quote (amount=0)`);
      return { success: false, error: 'INSUFFICIENT_USDC' };
    }
    
    // Gardes pour éviter les undefined
    if (!this.walletManager) throw new Error('WalletManager not initialized');
    if (!this.jupiterApi) throw new Error('Jupiter API not initialized');
    
    try {
      const wallet = this.walletManager.getWallet(walletIndex);
      if (!wallet) {
        throw new Error(`Wallet ${walletIndex} non trouvé`);
      }

      const slippage = slippageBps || this.config.amounts.defaultSlippageBps;
      const amount = Math.floor(usdcAmount * 1e6); // Convertir en micro-USDC

      tradingLogger.info(`Tentative de swap USDC vers PENGU`, {
        walletIndex,
        amount: usdcAmount,
        slippageBps: slippage,
      });

      // Vérifier le solde USDC avant le swap
      const usdcBalance = await this.getTokenBalance(wallet.address, TOKEN_ADDRESSES.USDC);
      if (usdcBalance < usdcAmount) {
        return {
          success: false,
          error: `Solde USDC insuffisant: ${usdcBalance} < ${usdcAmount}`,
        };
      }

      // Récupérer le devis
      const quote = await this.getSwapQuote(
        TOKEN_ADDRESSES.USDC,
        this.config.jupiter.penguMint,
        amount.toString(),
        slippage
      );

      if (!quote) {
        return {
          success: false,
          error: 'Aucun devis de swap disponible',
        };
      }

      // Vérifier le slippage réel
      const expectedOutput = parseFloat(quote.outAmount) / 1e6; // Convertir en PENGU
      const actualSlippage = this.calculateActualSlippage(usdcAmount, expectedOutput, quote);
      
      if (actualSlippage > slippage) {
        tradingLogger.warn(`Slippage réel (${actualSlippage}bps) supérieur au slippage maximum (${slippage}bps)`, {
          walletIndex,
          expectedOutput,
          actualSlippage,
          maxSlippage: slippage,
        });
        
        return {
          success: false,
          error: `Slippage trop élevé: ${actualSlippage}bps > ${slippage}bps`,
          actualSlippage,
        };
      }

      // Mode DRY_RUN : simuler sans broadcaster
      if (process.env.DRY_RUN === 'true') {
        tradingLogger.info('[trading][SIM] DRY_RUN mode - simulating swap transaction');
        
        // En mode DRY_RUN, on simule directement le succès
        // sans avoir besoin de construire la transaction
        return {
          success: true,
          txSignature: 'simulated-swap-signature',
          actualSlippage,
          simulated: true,
        };
      }

      // Construire la transaction (mode réel uniquement)
      const transaction = await this.buildSwapTransaction(walletIndex, quote);

      if (!transaction) {
        return {
          success: false,
          error: 'Impossible de construire la transaction de swap',
        };
      }

      // Mode normal : exécuter réellement
      // Signer et envoyer la transaction
      const signedTransaction = await this.walletManager?.signSolanaTransaction(walletIndex, transaction);
      const signature = await this.connection!.sendTransaction(signedTransaction as any);

      // Attendre la confirmation
      await this.connection!.confirmTransaction(signature, 'confirmed');

      // Vérifier le solde après le swap
      const newPenguBalance = await this.getTokenBalance(wallet.address, TOKEN_ADDRESSES.PENGU);
      const newUsdcBalance = await this.getTokenBalance(wallet.address, TOKEN_ADDRESSES.USDC);

      tradingLogger.info(`Swap USDC vers PENGU réussi`, {
        walletIndex,
        signature,
        inputAmount: usdcAmount,
        outputAmount: expectedOutput,
        actualSlippage,
        newPenguBalance,
        newUsdcBalance,
      });

      return {
        success: true,
        txSignature: signature,
        actualSlippage,
      };
    } catch (error) {
      tradingLogger.error(`Erreur lors du swap USDC vers PENGU pour le wallet ${walletIndex}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      };
    }
  }

  /**
   * Échange PENGU vers USDC avec contrôle des soldes et gestion des slippages
   */
  async swapPenguToUsdc(
    walletIndex: number,
    penguAmount: number,
    slippageBps?: number
  ): Promise<{ success: boolean; txSignature?: string; error?: string; actualSlippage?: number; simulated?: boolean }> {
    await this.init();
    
    // Garde pour amount > 0
    if (penguAmount <= 0) {
      tradingLogger.warn(`[trading][WARN] skip quote (amount=0)`);
      return { success: false, error: 'INSUFFICIENT_PENGU' };
    }
    
    try {
      const wallet = this.walletManager?.getWallet(walletIndex);
      if (!wallet) {
        throw new Error(`Wallet ${walletIndex} non trouvé`);
      }

      const slippage = slippageBps || config.amounts.defaultSlippageBps;
      const amount = Math.floor(penguAmount * 1e6); // Supposons que PENGU a 6 décimales

      tradingLogger.info(`Tentative de swap PENGU vers USDC`, {
        walletIndex,
        amount: penguAmount,
        slippageBps: slippage,
      });

      // Vérifier le solde PENGU avant le swap
      const penguBalance = await this.getTokenBalance(wallet.address, this.config.jupiter.penguMint);
      if (penguBalance < penguAmount) {
        return {
          success: false,
          error: `Solde PENGU insuffisant: ${penguBalance} < ${penguAmount}`,
        };
      }

      // Récupérer le devis
      const quote = await this.getSwapQuote(
        this.config.jupiter.penguMint,
        TOKEN_ADDRESSES.USDC,
        amount.toString(),
        slippage
      );

      if (!quote) {
        return {
          success: false,
          error: 'Aucun devis de swap disponible',
        };
      }

      // Vérifier le slippage réel
      const expectedOutput = parseFloat(quote.outAmount) / 1e6; // Convertir en USDC
      const actualSlippage = this.calculateActualSlippage(penguAmount, expectedOutput, quote);
      
      if (actualSlippage > slippage) {
        tradingLogger.warn(`Slippage réel (${actualSlippage}bps) supérieur au slippage maximum (${slippage}bps)`, {
          walletIndex,
          expectedOutput,
          actualSlippage,
          maxSlippage: slippage,
        });
        
        return {
          success: false,
          error: `Slippage trop élevé: ${actualSlippage}bps > ${slippage}bps`,
          actualSlippage,
        };
      }

      // Mode DRY_RUN : simuler sans broadcaster
      if (process.env.DRY_RUN === 'true') {
        tradingLogger.info('[trading][SIM] DRY_RUN mode - simulating swap transaction');
        
        // En mode DRY_RUN, on simule directement le succès
        // sans avoir besoin de construire la transaction
        return {
          success: true,
          txSignature: 'simulated-swap-signature',
          actualSlippage,
          simulated: true,
        };
      }

      // Construire la transaction (mode réel uniquement)
      const transaction = await this.buildSwapTransaction(walletIndex, quote);

      if (!transaction) {
        return {
          success: false,
          error: 'Impossible de construire la transaction de swap',
        };
      }

      // Mode normal : exécuter réellement
      // Signer et envoyer la transaction
      const signedTransaction = await this.walletManager?.signSolanaTransaction(walletIndex, transaction);
      const signature = await this.connection!.sendTransaction(signedTransaction as any);

      // Attendre la confirmation
      await this.connection!.confirmTransaction(signature, 'confirmed');

      // Vérifier le solde après le swap
      const newPenguBalance = await this.getTokenBalance(wallet.address, TOKEN_ADDRESSES.PENGU);
      const newUsdcBalance = await this.getTokenBalance(wallet.address, TOKEN_ADDRESSES.USDC);

      tradingLogger.info(`Swap PENGU vers USDC réussi`, {
        walletIndex,
        signature,
        inputAmount: penguAmount,
        outputAmount: expectedOutput,
        actualSlippage,
        newPenguBalance,
        newUsdcBalance,
      });

      return {
        success: true,
        txSignature: signature,
        actualSlippage,
      };
    } catch (error) {
      tradingLogger.error(`Erreur lors du swap PENGU vers USDC pour le wallet ${walletIndex}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      };
    }
  }

  /**
   * Construit une transaction de swap
   */
  private async buildSwapTransaction(
    walletIndex: number,
    quote: SwapQuote
  ): Promise<Transaction | null> {
    try {
      const wallet = this.walletManager?.getWallet(walletIndex);
      if (!wallet) {
        throw new Error(`Wallet ${walletIndex} non trouvé`);
      }

      // Récupérer la transaction depuis Jupiter (ou simulateur)
      const response = await this.retryWithBackoff(async () => {
        if (this.jupiterApi instanceof JupiterSimConnector) {
          return await this.jupiterApi.swap({
            quoteResponse: quote,
            userPublicKey: wallet.address,
            wrapAndUnwrapSol: true,
          });
        } else {
          return await this.jupiterApi!.post('/swap', {
            quoteResponse: quote,
            userPublicKey: wallet.address,
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: 'auto',
          });
        }
      });

      // Gérer les deux types de réponse (API réelle vs simulateur)
      const swapData = 'data' in response ? response.data : response;
      
      if (!swapData || !swapData.swapTransaction) {
        throw new Error('Réponse invalide de Jupiter');
      }

      // Désérialiser la transaction
      const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      // Retourner la transaction versionnée directement
      // Les VersionedTransaction sont supportées par Solana Web3.js
      return transaction as any;
    } catch (error) {
      tradingLogger.error('Erreur lors de la construction de la transaction de swap:', error);
      return null;
    }
  }

  /**
   * Récupère le prix actuel de PENGU en USDC
   */
  async getPenguPrice(): Promise<number | null> {
    try {
      const quote = await this.getSwapQuote(
        TOKEN_ADDRESSES.USDC,
        TOKEN_ADDRESSES.PENGU,
        '1000000', // 1 USDC
        100 // 1% de slippage pour le prix
      );

      if (quote) {
        const price = 1000000 / parseFloat(quote.outAmount);
        tradingLogger.info(`Prix PENGU récupéré: ${price} USDC`);
        return price;
      }

      return null;
    } catch (error) {
      tradingLogger.error('Erreur lors de la récupération du prix PENGU:', error);
      return null;
    }
  }

  /**
   * Récupère les tokens supportés par Jupiter
   */
  async getSupportedTokens(): Promise<any[]> {
    try {
      // Si on utilise le simulateur, retourner des tokens simulés
      if (this.jupiterApi instanceof JupiterSimConnector) {
        return [
          {
            address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
            symbol: 'USDC',
            decimals: 6,
          },
          {
            address: 'simulated-pengu-mint',
            symbol: 'PENGU',
            decimals: 9,
          },
        ];
      }
      
      const response = await this.jupiterApi!.get('/tokens');
      return response.data || [];
    } catch (error) {
      tradingLogger.error('Erreur lors de la récupération des tokens supportés:', error);
      return [];
    }
  }

  /**
   * Récupère les paires de trading disponibles
   */
  async getTradingPairs(): Promise<any[]> {
    try {
      // Si on utilise le simulateur, retourner des paires simulées
      if (this.jupiterApi instanceof JupiterSimConnector) {
        return [
          {
            inputMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
            outputMint: 'simulated-pengu-mint',
            symbol: 'USDC/PENGU',
          },
        ];
      }
      
      const response = await this.jupiterApi!.get('/indexed-route-map');
      return response.data || [];
    } catch (error) {
      tradingLogger.error('Erreur lors de la récupération des paires de trading:', error);
      return [];
    }
  }

  /**
   * Vérifie la connectivité de l'API Jupiter
   */
  async checkConnectivity(): Promise<boolean> {
    try {
      // Si on utilise le simulateur, retourner true directement
      if (this.jupiterApi instanceof JupiterSimConnector) {
        const result = await this.jupiterApi.checkConnectivity();
        return result.connected;
      }
      
      // Utiliser la nouvelle API v2 lite-api.jup.ag
      const response = await this.tokensApi!.get('/tokens/v2/search?query=PENGU');
      return response.status === 200;
    } catch (error) {
      tradingLogger.error('Erreur de connectivité Jupiter:', error);
      return false;
    }
  }

  /**
   * Récupère le solde d'un token pour une adresse
   */
  async getTokenBalance(address: string, mintAddress: string): Promise<number> {
    try {
      const { PublicKey } = await import('@solana/web3.js');
      const publicKey = new PublicKey(address);
      const mint = new PublicKey(mintAddress);
      
      
      const tokenAccounts = await this.connection!.getParsedTokenAccountsByOwner(publicKey, {
        mint: mint,
      });

      if (tokenAccounts.value.length > 0) {
        const tokenAccount = tokenAccounts.value[0];
        const amount = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
        return amount || 0;
      }

      return 0;
    } catch (error) {
      tradingLogger.error(`Erreur lors de la récupération du solde du token ${mintAddress} pour ${address}:`, error);
      return 0;
    }
  }

  /**
   * Signe une transaction localement sans la broadcaster (pour SIGN_ONLY)
   */
  private async signTransactionLocal(_wallet: any, transaction: any): Promise<string> {
    try {
      // Simuler la signature pour SIGN_ONLY mode
      const mockSignedTx = {
        ...transaction,
        signature: 'mock-signature-' + Date.now(),
        serialized: Buffer.from(JSON.stringify(transaction)).toString('base64')
      };
      
      return mockSignedTx.serialized;
    } catch (error) {
      tradingLogger.error('Erreur lors de la signature locale:', error);
      throw error;
    }
  }

  /**
   * Calcule le slippage réel d'un swap
   */
  private calculateActualSlippage(
    _inputAmount: number,
    outputAmount: number,
    quote: SwapQuote
  ): number {
    try {
      // Utiliser le prix impact du devis si disponible
      if (quote.priceImpactPct) {
        return parseFloat(quote.priceImpactPct) * 100; // Convertir en bps
      }

      // Calculer le slippage basé sur la différence entre le montant attendu et le montant réel
      const expectedOutput = parseFloat(quote.outAmount) / 1e6;
      const slippage = Math.abs((expectedOutput - outputAmount) / expectedOutput) * 10000; // Convertir en bps
      
      return Math.round(slippage);
    } catch (error) {
      tradingLogger.error('Erreur lors du calcul du slippage réel:', error);
      return 0;
    }
  }

  /**
   * Vérifie si un swap est viable avant de l'exécuter
   */
  async validateSwap(
    inputMint: string,
    outputMint: string,
    amount: string,
    maxSlippageBps: number
  ): Promise<{ viable: boolean; reason?: string; quote?: SwapQuote }> {
    try {
      const quote = await this.getSwapQuote(inputMint, outputMint, amount, maxSlippageBps);
      
      if (!quote) {
        return {
          viable: false,
          reason: 'Aucun devis disponible',
        };
      }

      // Vérifier le slippage
      const actualSlippage = parseFloat(quote.priceImpactPct) * 100;
      if (actualSlippage > maxSlippageBps) {
        return {
          viable: false,
          reason: `Slippage trop élevé: ${actualSlippage.toFixed(2)}bps > ${maxSlippageBps}bps`,
          quote,
        };
      }

      // Vérifier la liquidité (montant de sortie minimum)
      const outputAmount = parseFloat(quote.outAmount);
      const inputAmount = parseFloat(amount);
      const minOutputRatio = 0.95; // 95% minimum du montant d'entrée
      
      if (outputAmount < inputAmount * minOutputRatio) {
        return {
          viable: false,
          reason: `Perte trop importante: ${((1 - outputAmount / inputAmount) * 100).toFixed(2)}%`,
          quote,
        };
      }

      return {
        viable: true,
        quote,
      };
    } catch (error) {
      tradingLogger.error('Erreur lors de la validation du swap:', error);
      return {
        viable: false,
        reason: 'Erreur lors de la validation',
      };
    }
  }

  /**
   * Effectue un swap avec retry en cas d'échec
   */
  async swapWithRetry(
    walletIndex: number,
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = config.amounts.defaultSlippageBps,
    maxRetries: number = 3
  ): Promise<{ success: boolean; txSignature?: string; error?: string; attempts: number }> {
    let lastError: string = '';
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        tradingLogger.info(`Tentative de swap ${attempt}/${maxRetries}`, {
          walletIndex,
          inputMint,
          outputMint,
          amount,
          slippageBps,
        });

        let result;
        if (inputMint === TOKEN_ADDRESSES.USDC && outputMint === this.config.jupiter.penguMint) {
          result = await this.swapUsdcToPengu(walletIndex, amount, slippageBps);
        } else if (inputMint === this.config.jupiter.penguMint && outputMint === TOKEN_ADDRESSES.USDC) {
          result = await this.swapPenguToUsdc(walletIndex, amount, slippageBps);
        } else {
          throw new Error('Paire de tokens non supportée');
        }

        if (result.success) {
          tradingLogger.info(`Swap réussi à la tentative ${attempt}`, {
            walletIndex,
            signature: result.txSignature,
            actualSlippage: result.actualSlippage,
          });
          
          return {
            ...result,
            attempts: attempt,
          };
        }

        lastError = result.error || 'Erreur inconnue';
        tradingLogger.warn(`Tentative ${attempt} échouée: ${lastError}`);

        // Attendre avant la prochaine tentative
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }

      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Erreur inconnue';
        tradingLogger.error(`Erreur lors de la tentative ${attempt}:`, error);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    }

    return {
      success: false,
      error: `Toutes les tentatives ont échoué après ${maxRetries} essais. Dernière erreur: ${lastError}`,
      attempts: maxRetries,
    };
  }

  /**
   * Récupère les statistiques de trading pour un wallet
   */
  async getTradingStats(walletIndex: number): Promise<{
    totalSwaps: number;
    totalVolumeUsdc: number;
    averageSlippage: number;
    lastSwapTime?: Date;
  }> {
    try {
      // Cette méthode devrait être implémentée avec une base de données
      // Pour l'instant, nous retournons des valeurs par défaut
      return {
        totalSwaps: 0,
        totalVolumeUsdc: 0,
        averageSlippage: 0,
      };
    } catch (error) {
      tradingLogger.error(`Erreur lors de la récupération des statistiques de trading pour le wallet ${walletIndex}:`, error);
      return {
        totalSwaps: 0,
        totalVolumeUsdc: 0,
        averageSlippage: 0,
      };
    }
  }
}

// L'instance singleton sera créée par les modules qui en ont besoin