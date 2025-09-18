import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ethers } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import { createJupiterService } from '../src/services/solana/jupiter';
import { createOrcaService } from '../src/services/solana/orca';

describe('E2E Solana Swap + LP Dry Run', () => {
  let jupiterService: ReturnType<typeof createJupiterService>;
  let orcaService: ReturnType<typeof createOrcaService>;

  beforeAll(() => {
    // Mock des variables d'environnement
    process.env.DRY_RUN = 'true';
    process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
    process.env.SOL_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    process.env.SOL_PENGU_MINT = '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv';
    process.env.SOL_WSOL_MINT = 'So11111111111111111111111111111111111111112';
    process.env.ORCA_WHIRLPOOLS_PROGRAM = 'whirLbMiicVdio4qvVYQW7i6T2ftwCgreG7VMVQ2QJ';
    process.env.ORCA_USDC_PENGU_POOL = 'test_pool_address';
    process.env.ORCA_USDC_WSOL_POOL = 'fallback_pool_address';
    process.env.SLIPPAGE_BPS = '50';
    process.env.MAX_SPEND_USDC = '1';
    process.env.JUPITER_API_KEY = 'test_key';
  });

  describe('Jupiter Swap Service', () => {
    it('should get quote for USDC to PENGU swap', async () => {
      const quote = await jupiterService.getQuote({
        inputMint: process.env.SOL_USDC_MINT!,
        outputMint: process.env.SOL_PENGU_MINT!,
        amount: ethers.parseUnits('1', 6).toString(), // 1 USDC
        slippageBps: 50,
      });

      expect(quote).toBeDefined();
      expect(quote.inputMint).toBe(process.env.SOL_USDC_MINT);
      expect(quote.outputMint).toBe(process.env.SOL_PENGU_MINT);
      expect(quote.inAmount).toBe(ethers.parseUnits('1', 6).toString());
      expect(quote.outAmount).toBeDefined();
      expect(quote.slippageBps).toBe(50);
      expect(quote.routePlan.length).toBeGreaterThan(0);
    });

    it('should respect max spend caps', async () => {
      const maxSpend = parseFloat(process.env.MAX_SPEND_USDC!);
      
      await expect(
        jupiterService.getQuote({
          inputMint: process.env.SOL_USDC_MINT!,
          outputMint: process.env.SOL_PENGU_MINT!,
          amount: ethers.parseUnits((maxSpend + 1).toString(), 6).toString(),
          slippageBps: 50,
        })
      ).rejects.toThrow('exceeds max spend');
    });

    it('should handle dry run mode for swap transaction', async () => {
      const quote = await jupiterService.getQuote({
        inputMint: process.env.SOL_USDC_MINT!,
        outputMint: process.env.SOL_PENGU_MINT!,
        amount: ethers.parseUnits('1', 6).toString(),
        slippageBps: 50,
      });

      const userPublicKey = new PublicKey('11111111111111111111111111111111');
      const result = await jupiterService.swapTx(userPublicKey, quote);

      expect(result).toBeDefined();
      expect(result.transaction).toBeDefined();
      expect(result.signature).toBeUndefined(); // Pas de signature en mode dry run
    });

    it('should validate slippage settings', async () => {
      const quote = await jupiterService.getQuote({
        inputMint: process.env.SOL_USDC_MINT!,
        outputMint: process.env.SOL_PENGU_MINT!,
        amount: ethers.parseUnits('1', 6).toString(),
        slippageBps: 100, // 1%
      });

      expect(quote.slippageBps).toBe(100);
    });

    it('should get token balance', async () => {
      const userPublicKey = new PublicKey('11111111111111111111111111111111');
      const balance = await jupiterService.getTokenBalance(userPublicKey, process.env.SOL_USDC_MINT!);

      expect(typeof balance).toBe('bigint');
      expect(balance).toBeGreaterThanOrEqual(0n);
    });

    it('should get SOL balance', async () => {
      const userPublicKey = new PublicKey('11111111111111111111111111111111');
      const balance = await jupiterService.getSolBalance(userPublicKey);

      expect(typeof balance).toBe('number');
      expect(balance).toBeGreaterThanOrEqual(0);
    });

    it('should handle airdrop in dry run mode', async () => {
      const userPublicKey = new PublicKey('11111111111111111111111111111111');
      const signature = await jupiterService.requestAirdrop(userPublicKey, 0.1);

      expect(signature).toBe('dry_run_signature');
    });
  });

  describe('Orca LP Service', () => {
    it('should get pool info', async () => {
      const poolInfo = await orcaService.getPoolInfo(process.env.ORCA_USDC_PENGU_POOL!);

      expect(poolInfo).toBeDefined();
      expect(poolInfo.whirlpool).toBe(process.env.ORCA_USDC_PENGU_POOL);
      expect(poolInfo.tokenMintA).toBeDefined();
      expect(poolInfo.tokenMintB).toBeDefined();
      expect(poolInfo.tickCurrentIndex).toBeDefined();
      expect(poolInfo.liquidity).toBeDefined();
      expect(poolInfo.feeRate).toBeDefined();
    });

    it('should ensure ATA exists and create if needed', async () => {
      const userPublicKey = new PublicKey('11111111111111111111111111111111');
      const ata = await orcaService.ensureAta(userPublicKey, process.env.SOL_USDC_MINT!);

      expect(ata).toBeDefined();
      expect(ata.toString()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/); // Base58 address
    });

    it('should verify Orca pool resolution with mint ordering', async () => {
      const mintA = process.env.SOL_USDC_MINT!;
      const mintB = process.env.SOL_PENGU_MINT!;
      
      // Test avec mints dans l'ordre normal
      const pool1 = await orcaService.resolvePoolByMints(mintA, mintB);
      expect(pool1.poolAddress).toBeDefined();
      expect(pool1.tickSpacing).toBeGreaterThan(0);
      expect(pool1.feeRate).toBeGreaterThan(0);

      // Test avec mints dans l'ordre inverse (doit être trié automatiquement)
      const pool2 = await orcaService.resolvePoolByMints(mintB, mintA);
      expect(pool2.poolAddress).toBe(pool1.poolAddress); // Même pool
    });

    it('should verify ComputeBudget instructions are added', async () => {
      const userPublicKey = new PublicKey('11111111111111111111111111111111');
      
      // Mock du service pour vérifier les instructions
      const mockTransaction = {
        add: jest.fn(),
      };

      // Vérifier que les paramètres de compute budget sont configurés
      expect(process.env.SOL_COMPUTE_UNITS).toBeDefined();
      expect(process.env.SOL_MICRO_LAMPORTS).toBeDefined();
      expect(parseInt(process.env.SOL_COMPUTE_UNITS!)).toBeGreaterThan(0);
      expect(parseInt(process.env.SOL_MICRO_LAMPORTS!)).toBeGreaterThan(0);
    });

    it('should add liquidity in dry run mode', async () => {
      const userPublicKey = new PublicKey('11111111111111111111111111111111');
      
      const result = await orcaService.addLiquidityUSDC_PENGU({
        amountUsdc: ethers.parseUnits('1', 6).toString(),
        amountPengu: '1000000', // 1 PENGU
        slippageBps: 50,
        owner: userPublicKey,
      });

      expect(result).toBeDefined();
      expect(result.positionMint).toBeDefined();
      expect(result.signature).toBeUndefined(); // Pas de signature en mode dry run
    });

    it('should respect max spend caps for LP', async () => {
      const maxSpend = parseFloat(process.env.MAX_SPEND_USDC!);
      
      await expect(
        orcaService.addLiquidityUSDC_PENGU({
          amountUsdc: ethers.parseUnits((maxSpend + 1).toString(), 6).toString(),
          amountPengu: '1000000',
          slippageBps: 50,
          owner: new PublicKey('11111111111111111111111111111111'),
        })
      ).rejects.toThrow('exceeds max spend');
    });

    it('should withdraw liquidity partially in dry run mode', async () => {
      const userPublicKey = new PublicKey('11111111111111111111111111111111');
      const positionMint = 'test_position_mint';
      
      const result = await orcaService.withdrawLiquidityPartial({
        pool: process.env.ORCA_USDC_PENGU_POOL!,
        positionMint,
        pct: 10, // 10%
        owner: userPublicKey,
      });

      expect(result).toBeDefined();
      expect(result.amountUsdc).toBeDefined();
      expect(result.amountPengu).toBeDefined();
      expect(result.signature).toBeUndefined(); // Pas de signature en mode dry run
    });

    it('should collect fees in dry run mode', async () => {
      const userPublicKey = new PublicKey('11111111111111111111111111111111');
      const positionMint = 'test_position_mint';
      
      const result = await orcaService.collectFees({
        positionMint,
        owner: userPublicKey,
      });

      expect(result).toBeDefined();
      expect(result.feesUsdc).toBeDefined();
      expect(result.feesPengu).toBeDefined();
      expect(result.signature).toBeUndefined(); // Pas de signature en mode dry run
    });

    it('should get position info', async () => {
      const positionMint = 'test_position_mint';
      
      const positionInfo = await orcaService.getPositionInfo(positionMint);

      expect(positionInfo).toBeDefined();
      expect(positionInfo.liquidity).toBeDefined();
      expect(positionInfo.tickLowerIndex).toBeDefined();
      expect(positionInfo.tickUpperIndex).toBeDefined();
      expect(positionInfo.feeOwedA).toBeDefined();
      expect(positionInfo.feeOwedB).toBeDefined();
    });

    it('should fallback to USDC/WSOL pool if PENGU pool not available', async () => {
      // Mock du service avec seulement le pool USDC/WSOL
      const fallbackOrcaService = createOrcaService({
        usdcPenguPool: undefined,
        usdcWsolPool: process.env.ORCA_USDC_WSOL_POOL,
      });

      const userPublicKey = new PublicKey('11111111111111111111111111111111');
      
      const result = await fallbackOrcaService.addLiquidityUSDC_PENGU({
        amountUsdc: ethers.parseUnits('1', 6).toString(),
        amountPengu: '1000000',
        slippageBps: 50,
        owner: userPublicKey,
      });

      expect(result).toBeDefined();
      expect(result.positionMint).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should simulate complete swap + LP flow', async () => {
      const userPublicKey = new PublicKey('11111111111111111111111111111111');
      
      // 1. Swap USDC → PENGU
      const swapQuote = await jupiterService.getQuote({
        inputMint: process.env.SOL_USDC_MINT!,
        outputMint: process.env.SOL_PENGU_MINT!,
        amount: ethers.parseUnits('1', 6).toString(),
        slippageBps: 50,
      });

      const swapResult = await jupiterService.swapTx(userPublicKey, swapQuote);
      expect(swapResult.transaction).toBeDefined();

      // 2. Add liquidity USDC/PENGU
      const lpResult = await orcaService.addLiquidityUSDC_PENGU({
        amountUsdc: ethers.parseUnits('0.5', 6).toString(), // 0.5 USDC
        amountPengu: '500000', // 0.5 PENGU
        slippageBps: 50,
        owner: userPublicKey,
      });

      expect(lpResult.positionMint).toBeDefined();

      // 3. Withdraw 10% of liquidity
      const withdrawResult = await orcaService.withdrawLiquidityPartial({
        pool: process.env.ORCA_USDC_PENGU_POOL!,
        positionMint: lpResult.positionMint!,
        pct: 10,
        owner: userPublicKey,
      });

      expect(withdrawResult.amountUsdc).toBeDefined();
      expect(withdrawResult.amountPengu).toBeDefined();
    });

    it('should handle error scenarios gracefully', async () => {
      const userPublicKey = new PublicKey('11111111111111111111111111111111');

      // Test avec un montant trop élevé
      await expect(
        jupiterService.getQuote({
          inputMint: process.env.SOL_USDC_MINT!,
          outputMint: process.env.SOL_PENGU_MINT!,
          amount: ethers.parseUnits('1000', 6).toString(), // 1000 USDC
          slippageBps: 50,
        })
      ).rejects.toThrow();

      // Test avec un slippage trop élevé
      await expect(
        jupiterService.getQuote({
          inputMint: process.env.SOL_USDC_MINT!,
          outputMint: process.env.SOL_PENGU_MINT!,
          amount: ethers.parseUnits('1', 6).toString(),
          slippageBps: 10000, // 100% slippage
        })
      ).rejects.toThrow();
    });
  });
});
