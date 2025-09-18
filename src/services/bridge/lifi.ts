import axios from 'axios';
import { ethers } from 'ethers';
import { logger } from '../../logger';
import { getE2EDatabase } from '../../lib/sql';

export interface LiFiBridgeConfig {
  apiKey: string;
  rpcUrl: string;
  slippageBps: number;
  timeoutMs: number;
  dryRun: boolean;
}

export interface LiFiRouteRequest {
  srcChainId: number;
  dstChainId: number;
  srcToken: string;
  dstToken: string;
  amount: string;
  fromAddress: string;
}

export interface LiFiRoute {
  id: string;
  fromAmount: string;
  toAmount: string;
  gasCosts: Array<{ amount: string; token: { symbol: string } }>;
  steps: Array<{
    type: string;
    tool: string;
    action: {
      fromToken: { address: string; symbol: string };
      toToken: { address: string; symbol: string };
      fromAmount: string;
      toAmount: string;
    };
    transactionRequest: {
      to: string;
      data: string;
      value: string;
      gasLimit?: string;
      gasPrice?: string;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
    };
  }>;
}

export class LiFiBridgeService {
  private api: any;
  private config: LiFiBridgeConfig;
  private db = getE2EDatabase();

  constructor(config: LiFiBridgeConfig) {
    this.config = config;
    this.api = axios.create({
      baseURL: 'https://li.quest/v1',
      headers: {
        'X-LIFI-API-KEY': config.apiKey,
      },
    });
  }

  async getRoute(request: LiFiRouteRequest): Promise<LiFiRoute> {
    logger.info('🌉 Fetching Li.Fi route...', request);
    
    try {
      const response = await this.api.post('/quote/contractCall', {
        fromChain: request.srcChainId,
        toChain: request.dstChainId,
        fromToken: request.srcToken,
        toToken: request.dstToken,
        fromAmount: request.amount,
        fromAddress: request.fromAddress,
        slippage: this.config.slippageBps / 10000, // Convert BPS to percentage
      });

      if (!response.data.steps || response.data.steps.length === 0) {
        throw new Error('No steps found in Li.Fi route');
      }

      logger.info('✅ Li.Fi route fetched successfully');
      logger.info(`   Steps: ${response.data.steps.length}`);
      logger.info(`   From: ${request.srcChainId} → ${request.dstChainId}`);
      logger.info(`   Amount: ${request.amount} ${request.srcToken}`);
      
      return response.data as LiFiRoute;
    } catch (error: any) {
      logger.error('❌ Failed to get Li.Fi route:', error.message);
      throw new Error(`Li.Fi route failed: ${error.message}`);
    }
  }

  buildTx(route: LiFiRoute): ethers.TransactionRequest {
    logger.info('🔨 Building Li.Fi transaction from route...');
    
    if (!route.steps || route.steps.length === 0) {
      throw new Error('No steps found in route');
    }

    const firstStep = route.steps[0];
    const tx = firstStep.transactionRequest;
    
    const transactionRequest: ethers.TransactionRequest = {
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value),
      gasLimit: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
      gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : undefined,
      maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) : undefined,
    };

    logger.info('✅ Transaction built successfully');
    logger.info(`   To: ${transactionRequest.to}`);
    logger.info(`   Value: ${transactionRequest.value} wei`);
    logger.info(`   Gas Limit: ${transactionRequest.gasLimit}`);
    
    return transactionRequest;
  }

  async sendAndPoll(
    wallet: ethers.Wallet,
    txData: ethers.TransactionRequest,
    jobId: string,
    options: { confirmations: number; timeoutMs: number }
  ): Promise<{ srcTxHash: string; destTxHash?: string }> {
    const isDryRun = this.config.dryRun;
    logger.info(`🚀 Sending Li.Fi transaction (Dry Run: ${isDryRun})`);

    if (isDryRun) {
      logger.info('🔍 DRY RUN: Would send bridge transaction');
      logger.info(`   From: ${wallet.address}`);
      logger.info(`   To: ${txData.to}`);
      logger.info(`   Value: ${txData.value} wei`);
      
      // Simuler l'estimation de gas
      try {
        const estimatedGas = await wallet.estimateGas(txData);
        logger.info(`   Estimated Gas: ${estimatedGas}`);
      } catch (error: any) {
        logger.warn(`   Gas estimation failed: ${error.message}`);
      }
      
      return { srcTxHash: 'dry_run_' + Date.now() };
    }

    // Mode LIVE
    logger.info('🔥 LIVE MODE: Sending bridge transaction...');
    
    try {
      // Envoyer la transaction
      const txResponse = await wallet.sendTransaction(txData);
      logger.info(`📤 Transaction sent: ${txResponse.hash}`);
      
      // Mettre à jour le job
      this.db.updateJob(jobId, {
        srcTxHash: txResponse.hash,
        status: 'in_progress',
        step: 'bridge_sent'
      });
      
      // Attendre la confirmation
      logger.info(`⏳ Waiting for confirmation (${options.confirmations} confirmations)...`);
      const receipt = await txResponse.wait(options.confirmations);
      
      if (!receipt) {
        throw new Error('Transaction receipt not found');
      }
      
      logger.info(`✅ Transaction confirmed: ${receipt.hash}`);
      
      // Mettre à jour le job
      this.db.updateJob(jobId, {
        status: 'in_progress',
        step: 'bridge_confirmed'
      });
      
      // Polling pour la transaction de destination
      logger.info('🔍 Polling for destination transaction...');
      const destTxHash = await this.pollDestinationTx(txResponse.hash, options.timeoutMs);
      
      if (destTxHash) {
        logger.info(`✅ Destination transaction found: ${destTxHash}`);
        this.db.updateJob(jobId, {
          destTxHash,
          status: 'completed',
          step: 'bridge_completed'
        });
        
        return { srcTxHash: txResponse.hash, destTxHash };
      } else {
        logger.warn('⚠️ Destination transaction not found within timeout');
        this.db.updateJob(jobId, {
          status: 'timeout',
          step: 'bridge_timeout'
        });
        
        return { srcTxHash: txResponse.hash };
      }
      
    } catch (error: any) {
      logger.error(`❌ Bridge transaction failed: ${error.message}`);
      this.db.updateJob(jobId, {
        status: 'failed',
        step: 'bridge_failed',
        metadata: error.message
      });
      throw error;
    }
  }

  private async pollDestinationTx(srcTxHash: string, timeoutMs: number): Promise<string | null> {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 secondes
    let attempt = 0;
    
    while (Date.now() - startTime < timeoutMs) {
      attempt++;
      logger.info(`🔍 Polling attempt ${attempt} for destination transaction...`);
      
      try {
        // Utiliser l'API Li.Fi pour vérifier le statut
        const response = await this.api.get(`/status/${srcTxHash}`);
        
        if (response.data && response.data.status === 'DONE') {
          const destTxHash = response.data.destinationTransactionHash;
          if (destTxHash) {
            logger.info(`✅ Destination transaction found: ${destTxHash}`);
            return destTxHash;
          }
        }
        
        logger.info(`   Status: ${response.data?.status || 'unknown'}`);
        
        // Attendre avant le prochain poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error: any) {
        logger.warn(`   Polling error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    logger.warn(`⏰ Polling timeout after ${timeoutMs}ms`);
    return null;
  }

  async getApprovalAddress(route: LiFiRoute): Promise<string | null> {
    if (!route.steps || route.steps.length === 0) {
      return null;
    }
    
    const firstStep = route.steps[0];
    return firstStep.transactionRequest.to;
  }
}

export function createLiFiBridgeService(config: LiFiBridgeConfig): LiFiBridgeService {
  return new LiFiBridgeService(config);
}