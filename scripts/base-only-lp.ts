#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { logger } from '../src/logger';
import { createERC20Service } from '../src/services/evm/erc20';

// Charger les variables d'environnement
dotenv.config();

interface BaseLPConfig {
  privateKey: string;
  baseRpcUrl: string;
  dryRun: boolean;
  maxSpendUsdc: string;
  maxSpendEth: string;
  slippageBps: number;
  confirmations: number;
  maxGasGwei: number;
  usdcAddress: string;
  wethAddress: string;
  routerAddress: string;
}

class BaseLPTester {
  private config: BaseLPConfig;
  private erc20Service: ReturnType<typeof createERC20Service>;

  constructor() {
    this.config = this.loadConfig();
    this.erc20Service = createERC20Service();
  }

  private loadConfig(): BaseLPConfig {
    const required = [
      'PRIVATE_KEY',
      'BASE_RPC_URL',
      'BASE_USDC',
      'BASE_WETH',
      'BASE_ROUTER_V2_OR_V3',
    ];

    for (const key of required) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
      }
    }

    return {
      privateKey: process.env.PRIVATE_KEY!,
      baseRpcUrl: process.env.BASE_RPC_URL!,
      dryRun: process.env.DRY_RUN === 'true',
      maxSpendUsdc: process.env.MAX_SPEND_USDC || '1',
      maxSpendEth: process.env.MAX_SPEND_ETH || '0.005',
      slippageBps: parseInt(process.env.SLIPPAGE_BPS || '50'),
      confirmations: parseInt(process.env.CONFIRMATIONS || '2'),
      maxGasGwei: parseInt(process.env.MAX_GAS_GWEI || '8'),
      usdcAddress: process.env.BASE_USDC!,
      wethAddress: process.env.BASE_WETH!,
      routerAddress: process.env.BASE_ROUTER_V2_OR_V3!,
    };
  }

  async run(): Promise<void> {
    logger.info('🏦 Starting Base LP test (USDC/WETH)');
    logger.info(`Mode: ${this.config.dryRun ? 'DRY RUN' : 'LIVE'}`);

    try {
      // 1. Vérifications préliminaires
      await this.performSanityChecks();

      // 2. Test d'approval USDC
      await this.testUSDCApproval();

      // 3. Test d'approval WETH
      await this.testWETHApproval();

      // 4. Test de création de LP (simulation)
      await this.testLPCreation();

      // 5. Test de retrait d'approval
      await this.testApprovalRevocation();

      logger.info('✅ Base LP test completed successfully');

    } catch (error: any) {
      logger.error('❌ Base LP test failed:', error.message);
      throw error;
    }
  }

  private async performSanityChecks(): Promise<void> {
    logger.info('🔍 Performing sanity checks...');

    const wallet = await this.erc20Service.getWallet(this.config.privateKey);
    logger.info(`Wallet: ${wallet.address}`);

    // Vérifier les balances
    const ethBalance = await this.erc20Service.getBalance(wallet);
    const usdcBalance = await this.erc20Service.getBalance(wallet, this.config.usdcAddress);
    const wethBalance = await this.erc20Service.getBalance(wallet, this.config.wethAddress);

    logger.info(`ETH Balance: ${ethers.formatEther(ethBalance)}`);
    logger.info(`USDC Balance: ${ethers.formatUnits(usdcBalance, 6)}`);
    logger.info(`WETH Balance: ${ethers.formatEther(wethBalance)}`);

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

    // Vérifier les informations des tokens
    const usdcInfo = await this.erc20Service.getTokenInfo(this.config.usdcAddress);
    const wethInfo = await this.erc20Service.getTokenInfo(this.config.wethAddress);

    logger.info(`USDC: ${usdcInfo.name} (${usdcInfo.symbol}) - ${usdcInfo.decimals} decimals`);
    logger.info(`WETH: ${wethInfo.name} (${wethInfo.symbol}) - ${wethInfo.decimals} decimals`);

    logger.info('✅ Sanity checks passed');
  }

  private async testUSDCApproval(): Promise<void> {
    logger.info('💰 Testing USDC approval...');

    const wallet = await this.erc20Service.getWallet(this.config.privateKey);
    const amount = ethers.parseUnits(this.config.maxSpendUsdc, 6);

    // Vérifier l'allowance actuelle
    const currentAllowance = await this.erc20Service.getAllowance(
      wallet,
      this.config.usdcAddress,
      this.config.routerAddress
    );

    logger.info(`Current USDC allowance: ${ethers.formatUnits(currentAllowance, 6)}`);

    if (currentAllowance >= amount) {
      logger.info('USDC allowance already sufficient');
      return;
    }

    // Approuver USDC
    const approved = await this.erc20Service.approveIfNeeded(
      wallet,
      this.config.usdcAddress,
      this.config.routerAddress,
      amount
    );

    if (approved) {
      logger.info('✅ USDC approval successful');
    } else {
      logger.info('ℹ️ USDC approval not needed');
    }
  }

  private async testWETHApproval(): Promise<void> {
    logger.info('💰 Testing WETH approval...');

    const wallet = await this.erc20Service.getWallet(this.config.privateKey);
    const amount = ethers.parseEther(this.config.maxSpendEth);

    // Vérifier l'allowance actuelle
    const currentAllowance = await this.erc20Service.getAllowance(
      wallet,
      this.config.wethAddress,
      this.config.routerAddress
    );

    logger.info(`Current WETH allowance: ${ethers.formatEther(currentAllowance)}`);

    if (currentAllowance >= amount) {
      logger.info('WETH allowance already sufficient');
      return;
    }

    // Approuver WETH
    const approved = await this.erc20Service.approveIfNeeded(
      wallet,
      this.config.wethAddress,
      this.config.routerAddress,
      amount
    );

    if (approved) {
      logger.info('✅ WETH approval successful');
    } else {
      logger.info('ℹ️ WETH approval not needed');
    }
  }

  private async testLPCreation(): Promise<void> {
    logger.info('💧 Testing LP creation (simulation)...');

    const wallet = await this.erc20Service.getWallet(this.config.privateKey);
    const usdcAmount = ethers.parseUnits(this.config.maxSpendUsdc, 6);
    const wethAmount = ethers.parseEther(this.config.maxSpendEth);

    // Simuler la création d'une LP position
    // En réalité, il faudrait appeler le router UniswapV3 ou Aerodrome
    logger.info('Simulating LP creation with:');
    logger.info(`- USDC: ${ethers.formatUnits(usdcAmount, 6)}`);
    logger.info(`- WETH: ${ethers.formatEther(wethAmount)}`);
    logger.info(`- Slippage: ${this.config.slippageBps} BPS`);

    if (this.config.dryRun) {
      logger.info('DRY RUN: Would create LP position');
      
      // Estimation du gas pour une transaction de LP
      const estimatedGas = await this.erc20Service.estimateGas(wallet, {
        to: this.config.routerAddress,
        data: '0x', // Données simulées
        value: 0,
      });

      const feeData = await wallet.provider.getFeeData();
      const gasCost = estimatedGas * (feeData.gasPrice || 0n);
      
      logger.info(`Estimated gas cost: ${ethers.formatEther(gasCost)} ETH`);
      logger.info(`Estimated gas limit: ${estimatedGas.toString()}`);
    } else {
      logger.info('LIVE: Would execute LP creation transaction');
      // Ici, on appellerait le router pour créer la LP
    }

    logger.info('✅ LP creation simulation completed');
  }

  private async testApprovalRevocation(): Promise<void> {
    logger.info('🔄 Testing approval revocation...');

    const wallet = await this.erc20Service.getWallet(this.config.privateKey);

    // Révoquer l'approval USDC
    await this.erc20Service.revokeApproval(
      wallet,
      this.config.usdcAddress,
      this.config.routerAddress
    );

    // Révoquer l'approval WETH
    await this.erc20Service.revokeApproval(
      wallet,
      this.config.wethAddress,
      this.config.routerAddress
    );

    logger.info('✅ Approval revocation completed');
  }
}

// Point d'entrée
async function main() {
  try {
    const tester = new BaseLPTester();
    await tester.run();
    process.exit(0);
  } catch (error: any) {
    logger.error('Fatal error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
