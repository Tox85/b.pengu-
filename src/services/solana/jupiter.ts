import { Connection, PublicKey, Keypair, Transaction, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { logger } from '../../logger';

export interface JupiterConfig {
  rpcUrl: string;
  slippageBps: number;
  computeUnits: number;
  microLamports: number;
  dryRun: boolean;
}

export interface JupiterQuoteRequest {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
}

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: any;
  priceImpactPct: string;
  routePlan: any[];
}

export interface JupiterSwapRequest {
  quoteResponse: JupiterQuote;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
  useSharedAccounts?: boolean;
  feeAccount?: string;
  trackingAccount?: string;
  computeUnitPriceMicroLamports?: number;
}

export class JupiterService {
  private connection: Connection;
  private config: JupiterConfig;

  constructor(config: JupiterConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl);
  }

  async getQuote(request: JupiterQuoteRequest): Promise<JupiterQuote> {
    logger.info('🔄 Fetching Jupiter quote...', {
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amount,
      slippageBps: request.slippageBps
    });

    try {
      const response = await fetch('https://quote-api.jup.ag/v6/quote', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // @ts-ignore
        params: new URLSearchParams({
          inputMint: request.inputMint,
          outputMint: request.outputMint,
          amount: request.amount,
          slippageBps: request.slippageBps.toString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status} ${response.statusText}`);
      }

      const quote = await response.json();
      
      logger.info('✅ Jupiter quote fetched successfully');
      logger.info(`   Input: ${quote.inAmount} (${request.inputMint})`);
      logger.info(`   Output: ${quote.outAmount} (${request.outputMint})`);
      logger.info(`   Price Impact: ${quote.priceImpactPct}%`);
      logger.info(`   Slippage: ${quote.slippageBps} BPS`);
      
      return quote;
    } catch (error: any) {
      logger.error('❌ Failed to get Jupiter quote:', error.message);
      throw new Error(`Jupiter quote failed: ${error.message}`);
    }
  }

  async getSwapTransaction(request: JupiterSwapRequest): Promise<Transaction> {
    logger.info('🔨 Building Jupiter swap transaction...');

    try {
      const response = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse: request.quoteResponse,
          userPublicKey: request.userPublicKey,
          wrapAndUnwrapSol: request.wrapAndUnwrapSol ?? true,
          useSharedAccounts: request.useSharedAccounts ?? true,
          computeUnitPriceMicroLamports: request.computeUnitPriceMicroLamports ?? this.config.microLamports,
        }),
      });

      if (!response.ok) {
        throw new Error(`Jupiter swap API error: ${response.status} ${response.statusText}`);
      }

      const { swapTransaction } = await response.json();
      
      // Désérialiser la transaction
      const transactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = Transaction.from(transactionBuf);
      
      logger.info('✅ Jupiter swap transaction built successfully');
      logger.info(`   Compute Units: ${this.config.computeUnits}`);
      logger.info(`   Priority Fee: ${this.config.microLamports} micro lamports`);
      
      return transaction;
    } catch (error: any) {
      logger.error('❌ Failed to build Jupiter swap transaction:', error.message);
      throw new Error(`Jupiter swap transaction failed: ${error.message}`);
    }
  }

  async swap(
    keypair: Keypair,
    quote: JupiterQuote
  ): Promise<{ signature: string; transaction: Transaction }> {
    const isDryRun = this.config.dryRun;
    logger.info(`🔄 Executing Jupiter swap (Dry Run: ${isDryRun})`);

    if (isDryRun) {
      logger.info('🔍 DRY RUN: Would execute Jupiter swap');
      logger.info(`   Input: ${quote.inAmount} (${quote.inputMint})`);
      logger.info(`   Output: ${quote.outAmount} (${quote.outputMint})`);
      logger.info(`   Slippage: ${quote.slippageBps} BPS`);
      
      // Simuler la transaction
      const mockTransaction = new Transaction();
      return {
        signature: 'dry_run_' + Date.now(),
        transaction: mockTransaction
      };
    }

    // Mode LIVE
    logger.info('🔥 LIVE MODE: Executing Jupiter swap...');
    
    try {
      // Construire la transaction de swap
      const swapRequest: JupiterSwapRequest = {
        quoteResponse: quote,
        userPublicKey: keypair.publicKey.toString(),
        wrapAndUnwrapSol: true,
        useSharedAccounts: true,
        computeUnitPriceMicroLamports: this.config.microLamports,
      };

      const transaction = await this.getSwapTransaction(swapRequest);
      
      // Ajouter le compute budget
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: this.config.computeUnits,
      });
      
      const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: this.config.microLamports,
      });

      transaction.add(computeBudgetIx);
      transaction.add(priorityFeeIx);
      
      // Signer la transaction
      transaction.sign(keypair);
      
      logger.info('📤 Sending Jupiter swap transaction...');
      
      // Envoyer la transaction
      const signature = await this.connection.sendTransaction(transaction, [keypair], {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      
      logger.info(`✅ Jupiter swap transaction sent: ${signature}`);
      
      // Attendre la confirmation
      logger.info('⏳ Waiting for confirmation...');
      const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }
      
      logger.info(`✅ Jupiter swap confirmed: ${signature}`);
      
      return { signature, transaction };
      
    } catch (error: any) {
      logger.error(`❌ Jupiter swap failed: ${error.message}`);
      throw error;
    }
  }

  async getTokenBalance(owner: PublicKey, mint: PublicKey): Promise<bigint> {
    try {
      const { getAssociatedTokenAddress } = await import('@solana/spl-token');
      const ata = await getAssociatedTokenAddress(mint, owner);
      
      const balance = await this.connection.getTokenAccountBalance(ata);
      return BigInt(balance.value.amount);
    } catch (error: any) {
      logger.warn(`Failed to get token balance: ${error.message}`);
      return 0n;
    }
  }

  async ensureTokenAccount(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
    try {
      const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
      const { Transaction } = await import('@solana/web3.js');
      
      const ata = await getAssociatedTokenAddress(mint, owner);
      
      // Vérifier si l'ATA existe
      const accountInfo = await this.connection.getAccountInfo(ata);
      
      if (!accountInfo) {
        logger.info(`Creating ATA for mint ${mint.toString()}`);
        
        const createAtaIx = createAssociatedTokenAccountInstruction(
          owner, // payer
          ata,   // ata
          owner, // owner
          mint    // mint
        );
        
        const transaction = new Transaction().add(createAtaIx);
        const signature = await this.connection.sendTransaction(transaction, []);
        await this.connection.confirmTransaction(signature);
        
        logger.info(`✅ ATA created: ${ata.toString()}`);
      }
      
      return ata;
    } catch (error: any) {
      logger.error(`Failed to ensure token account: ${error.message}`);
      throw error;
    }
  }
}

export function createJupiterService(config: JupiterConfig): JupiterService {
  return new JupiterService(config);
}