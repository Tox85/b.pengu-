#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import { logger } from '../src/logger';
import { getE2EDatabase, closeE2EDatabase } from '../src/lib/sql';
import { createERC20Service } from '../src/services/evm/erc20';
import { createLiFiBridgeService } from '../src/services/bridge/lifi';
import { createJupiterService } from '../src/services/solana/jupiter';
import { createOrcaService } from '../src/services/solana/orca';
import { getSolanaKeypair } from '../src/lib/solana-keypair';
import { initializeDirectories } from '../src/lib/init';

// Charger les variables d'environnement
dotenv.config();

interface E2EConfig {
  privateKey: string;
  baseRpcUrl: string;
  solanaRpcUrl: string;
  dryRun: boolean;
  maxSpendUsdc: string;
  maxSpendEth: string;
  slippageBps: number;
  confirmations: number;
  timeoutMs: number;
  maxGasGwei: number;
}

class E2EOrchestrator {
  private config: E2EConfig;
  private db: ReturnType<typeof getE2EDatabase>;
  private erc20Service: ReturnType<typeof createERC20Service>;
  private bridgeService: ReturnType<typeof createLiFiBridgeService>;
  private jupiterService: ReturnType<typeof createJupiterService>;
  private orcaService: ReturnType<typeof createOrcaService>;
  private jobId: string;

  constructor() {
    this.config = this.loadConfig();
    this.db = getE2EDatabase();
    this.erc20Service = createERC20Service();
    this.bridgeService = createLiFiBridgeService(this.db);
    this.jupiterService = createJupiterService();
    this.orcaService = createOrcaService();
    this.jobId = `e2e_${Date.now()}`;
  }

  private loadConfig(): E2EConfig {
    const required = [
      'PRIVATE_KEY',
      'BASE_RPC_URL',
      'SOLANA_RPC_URL',
    ];

    for (const key of required) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
      }
    }

    return {
      privateKey: process.env.PRIVATE_KEY!,
      baseRpcUrl: process.env.BASE_RPC_URL!,
      solanaRpcUrl: process.env.SOLANA_RPC_URL!,
      dryRun: process.env.DRY_RUN === 'true',
      maxSpendUsdc: process.env.MAX_SPEND_USDC || '1',
      maxSpendEth: process.env.MAX_SPEND_ETH || '0.005',
      slippageBps: parseInt(process.env.SLIPPAGE_BPS || '50'),
      confirmations: parseInt(process.env.CONFIRMATIONS || '2'),
      timeoutMs: parseInt(process.env.TIMEOUT_MS || '1800000'),
      maxGasGwei: parseInt(process.env.MAX_GAS_GWEI || '8'),
    };
  }

  async run(): Promise<void> {
    logger.info('🚀 Starting E2E Bridge + Solana + LP test');
    logger.info(`Mode: ${this.config.dryRun ? 'DRY RUN' : 'LIVE'}`);
    logger.info(`Job ID: ${this.jobId}`);

    try {
      // Initialiser les dossiers
      initializeDirectories();

      // Vérifier l'idempotence - si le job existe déjà et est terminé, skip
      const existingJob = this.db.getJob(this.jobId);
      if (existingJob && existingJob.status === 'completed') {
        logger.info('✅ Job already completed, skipping execution (idempotence)');
        return;
      }

      // Créer ou mettre à jour le job dans la DB
      if (existingJob) {
        this.db.updateJob(this.jobId, {
          status: 'in_progress',
          step: 'restart',
        });
        logger.info('🔄 Resuming existing job');
      } else {
        this.db.createJob({
          id: this.jobId,
          status: 'pending',
          step: 'initialization',
          metadata: JSON.stringify({
            config: this.config,
            timestamp: new Date().toISOString(),
          }),
        });
      }

      // 1. Vérifications préliminaires
      await this.performSanityChecks();

      // 2. Bridge Base → Solana
      const bridgeResult = await this.performBridge();

      // 3. Swap USDC → PENGU sur Solana
      const swapResult = await this.performSwap();

      // 4. LP USDC/PENGU sur Orca
      const lpResult = await this.performLiquidityProvision();

      // 5. (Optionnel) Withdraw partiel de la LP
      const withdrawResult = await this.performPartialWithdraw(lpResult.positionMint);

      // 6. (Optionnel) Re-bridge vers Base
      const rebridgeResult = await this.performRebridge(withdrawResult?.amountUsdc);

      // Résumé final
      await this.printSummary({
        bridge: bridgeResult,
        swap: swapResult,
        lp: lpResult,
        withdraw: withdrawResult,
        rebridge: rebridgeResult,
      });

      this.db.updateJob(this.jobId, {
        status: 'completed',
        step: 'completed',
        metadata: JSON.stringify({
          completedAt: new Date().toISOString(),
          results: {
            bridge: bridgeResult,
            swap: swapResult,
            lp: lpResult,
            withdraw: withdrawResult,
            rebridge: rebridgeResult,
          },
        }),
      });

      logger.info('✅ E2E test completed successfully');

    } catch (error: any) {
      logger.error('❌ E2E test failed:', error.message);
      
      this.db.updateJob(this.jobId, {
        status: 'failed',
        step: 'error',
        metadata: JSON.stringify({ 
          error: error.message,
          failedAt: new Date().toISOString(),
        }),
      });

      throw error;
    } finally {
      closeE2EDatabase();
    }
  }

  private async performSanityChecks(): Promise<void> {
    logger.info('🔍 Performing sanity checks...');

    this.db.updateJob(this.jobId, {
      status: 'in_progress',
      step: 'sanity_checks',
    });

    // Vérifier le wallet EVM
    const wallet = await this.erc20Service.getWallet(this.config.privateKey);
    logger.info(`EVM Wallet: ${wallet.address}`);

    // Vérifier les balances
    const ethBalance = await this.erc20Service.getBalance(wallet);
    const usdcBalance = await this.erc20Service.getBalance(wallet, process.env.BASE_USDC!);

    logger.info(`ETH Balance: ${ethers.formatEther(ethBalance)}`);
    logger.info(`USDC Balance: ${ethers.formatUnits(usdcBalance, 6)}`);

    // Vérifier les caps
    const maxEth = ethers.parseEther(this.config.maxSpendEth);
    const maxUsdc = ethers.parseUnits(this.config.maxSpendUsdc, 6);

    if (ethBalance < maxEth) {
      throw new Error(`Insufficient ETH balance: ${ethers.formatEther(ethBalance)} < ${this.config.maxSpendEth}`);
    }

    if (usdcBalance < maxUsdc) {
      throw new Error(`Insufficient USDC balance: ${ethers.formatUnits(usdcBalance, 6)} < ${this.config.maxSpendUsdc}`);
    }

    // Vérifier le gas price
    if (!(await this.erc20Service.checkGasPrice())) {
      throw new Error('Gas price too high');
    }

    // Vérifier Solana - utiliser le keypair configuré
    let solanaWallet: PublicKey;
    try {
      const keypair = getSolanaKeypair();
      solanaWallet = keypair.publicKey;
      logger.info(`Solana wallet from keypair: ${solanaWallet.toString()}`);
    } catch (error: any) {
      logger.warn(`Failed to load Solana keypair: ${error.message}`);
      solanaWallet = new PublicKey(process.env.SOLANA_WALLET_ADDRESS || wallet.address);
      logger.info(`Using fallback Solana wallet: ${solanaWallet.toString()}`);
    }

    const solBalance = await this.jupiterService.getSolBalance(solanaWallet);
    logger.info(`SOL Balance: ${solBalance}`);

    if (solBalance < 0.01) {
      logger.warn('Low SOL balance, requesting airdrop...');
      await this.jupiterService.requestAirdrop(solanaWallet, 0.1);
    }

    logger.info('✅ Sanity checks passed');
  }

  private async performBridge(): Promise<{ srcTxHash: string; destTxHash?: string }> {
    logger.info('🌉 Performing bridge Base → Solana...');

    this.db.updateJob(this.jobId, {
      status: 'in_progress',
      step: 'bridge',
    });

    const wallet = await this.erc20Service.getWallet(this.config.privateKey);
    const amount = ethers.parseUnits(this.config.maxSpendUsdc, 6).toString();

    // Obtenir la route Li.Fi
    const route = await this.bridgeService.getRoute({
      srcChainId: 8453, // Base
      dstChainId: 101,  // Solana
      srcToken: process.env.BASE_USDC!,
      dstToken: process.env.SOL_USDC_MINT!,
      amount,
      address: wallet.address,
    });

    // Construire la transaction
    const txData = this.bridgeService.buildTx(route);

    // Approve USDC si nécessaire
    await this.erc20Service.approveIfNeeded(
      wallet,
      process.env.BASE_USDC!,
      txData.to,
      BigInt(amount)
    );

    // Envoyer et poller
    const result = await this.bridgeService.sendAndPoll(
      wallet,
      txData,
      this.jobId,
      {
        confirmations: this.config.confirmations,
        timeoutMs: this.config.timeoutMs,
      }
    );

    logger.info(`✅ Bridge completed: ${result.srcTxHash} → ${result.destTxHash || 'pending'}`);
    return result;
  }

  private async performSwap(): Promise<{ signature?: string; amountOut: string }> {
    logger.info('🔄 Performing swap USDC → PENGU...');

    this.db.updateJob(this.jobId, {
      status: 'in_progress',
      step: 'swap',
    });

    const wallet = new PublicKey(process.env.SOLANA_WALLET_ADDRESS || (await this.erc20Service.getWallet(this.config.privateKey)).address);
    const amount = ethers.parseUnits(this.config.maxSpendUsdc, 6).toString();

    // Obtenir la quote Jupiter
    const quote = await this.jupiterService.getQuote({
      inputMint: process.env.SOL_USDC_MINT!,
      outputMint: process.env.SOL_PENGU_MINT!,
      amount,
      slippageBps: this.config.slippageBps,
    });

    // Exécuter le swap
    const result = await this.jupiterService.swapTx(wallet, quote);

    logger.info(`✅ Swap completed: ${result.signature || 'dry_run'}`);
    return {
      signature: result.signature,
      amountOut: quote.outAmount,
    };
  }

  private async performLiquidityProvision(): Promise<{ signature?: string; positionMint?: string }> {
    logger.info('💧 Adding liquidity USDC/PENGU...');

    this.db.updateJob(this.jobId, {
      status: 'in_progress',
      step: 'liquidity',
    });

    const wallet = new PublicKey(process.env.SOLANA_WALLET_ADDRESS || (await this.erc20Service.getWallet(this.config.privateKey)).address);
    
    // S'assurer que les ATA existent
    await this.orcaService.ensureAta(wallet, process.env.SOL_USDC_MINT!);
    await this.orcaService.ensureAta(wallet, process.env.SOL_PENGU_MINT!);

    // Ajouter la liquidité
    const result = await this.orcaService.addLiquidityUSDC_PENGU({
      amountUsdc: ethers.parseUnits(this.config.maxSpendUsdc, 6).toString(),
      amountPengu: '1000000', // 1 PENGU (ajuster selon les décimales)
      slippageBps: this.config.slippageBps,
      owner: wallet,
    });

    logger.info(`✅ Liquidity added: ${result.signature || 'dry_run'}, position: ${result.positionMint || 'dry_run'}`);
    return result;
  }

  private async performPartialWithdraw(positionMint?: string): Promise<{ signature?: string; amountUsdc?: string; amountPengu?: string } | null> {
    if (!positionMint || this.config.dryRun) {
      logger.info('⏭️ Skipping partial withdraw (no position or dry run)');
      return null;
    }

    logger.info('💰 Withdrawing 10% of liquidity...');

    this.db.updateJob(this.jobId, {
      status: 'in_progress',
      step: 'withdraw',
    });

    const wallet = new PublicKey(process.env.SOLANA_WALLET_ADDRESS || (await this.erc20Service.getWallet(this.config.privateKey)).address);
    const poolAddress = process.env.ORCA_USDC_PENGU_POOL || process.env.ORCA_USDC_WSOL_POOL!;

    const result = await this.orcaService.withdrawLiquidityPartial({
      pool: poolAddress,
      positionMint,
      pct: 10, // 10%
      owner: wallet,
    });

    logger.info(`✅ Partial withdraw completed: ${result.signature || 'dry_run'}`);
    return result;
  }

  private async performRebridge(amountUsdc?: string): Promise<{ srcTxHash: string; destTxHash?: string } | null> {
    if (!amountUsdc || this.config.dryRun) {
      logger.info('⏭️ Skipping re-bridge (no amount or dry run)');
      return null;
    }

    logger.info('🔄 Re-bridging to Base...');

    this.db.updateJob(this.jobId, {
      status: 'in_progress',
      step: 'rebridge',
    });

    const wallet = await this.erc20Service.getWallet(this.config.privateKey);
    const amount = (BigInt(amountUsdc) * 20n) / 100n; // 20% du montant retiré

    // Obtenir la route Li.Fi (Solana → Base)
    const route = await this.bridgeService.getRoute({
      srcChainId: 101,  // Solana
      dstChainId: 8453, // Base
      srcToken: process.env.SOL_USDC_MINT!,
      dstToken: process.env.BASE_USDC!,
      amount: amount.toString(),
      address: wallet.address,
    });

    const txData = this.bridgeService.buildTx(route);
    const result = await this.bridgeService.sendAndPoll(
      wallet,
      txData,
      this.jobId,
      {
        confirmations: this.config.confirmations,
        timeoutMs: this.config.timeoutMs,
      }
    );

    logger.info(`✅ Re-bridge completed: ${result.srcTxHash} → ${result.destTxHash || 'pending'}`);
    return result;
  }

  private async printSummary(results: any): Promise<void> {
    logger.info('📊 E2E Test Summary:');
    logger.info('==================');
    
    if (results.bridge) {
      logger.info(`Bridge: ${results.bridge.srcTxHash} → ${results.bridge.destTxHash || 'pending'}`);
    }
    
    if (results.swap) {
      logger.info(`Swap: ${results.swap.signature || 'dry_run'} (${results.swap.amountOut} PENGU)`);
    }
    
    if (results.lp) {
      logger.info(`LP: ${results.lp.signature || 'dry_run'} (position: ${results.lp.positionMint || 'dry_run'})`);
    }
    
    if (results.withdraw) {
      logger.info(`Withdraw: ${results.withdraw.signature || 'dry_run'} (${results.withdraw.amountUsdc} USDC, ${results.withdraw.amountPengu} PENGU)`);
    }
    
    if (results.rebridge) {
      logger.info(`Re-bridge: ${results.rebridge.srcTxHash} → ${results.rebridge.destTxHash || 'pending'}`);
    }

    logger.info('==================');
  }
}

// Point d'entrée
async function main() {
  try {
    const orchestrator = new E2EOrchestrator();
    await orchestrator.run();
    process.exit(0);
  } catch (error: any) {
    logger.error('Fatal error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
