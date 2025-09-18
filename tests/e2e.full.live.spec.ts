import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import { getE2EDatabase, closeE2EDatabase } from '../src/lib/sql';
import { createERC20Service } from '../src/services/evm/erc20';
import { createLiFiBridgeService } from '../src/services/bridge/lifi';
import { createJupiterService } from '../src/services/solana/jupiter';
import { createOrcaService } from '../src/services/solana/orca';

describe('E2E Full Live Test', () => {
  let db: ReturnType<typeof getE2EDatabase>;
  let erc20Service: ReturnType<typeof createERC20Service>;
  let bridgeService: ReturnType<typeof createLiFiBridgeService>;
  let jupiterService: ReturnType<typeof createJupiterService>;
  let orcaService: ReturnType<typeof createOrcaService>;
  let wallet: ethers.Wallet;
  let solanaWallet: PublicKey;

  beforeAll(() => {
    // Vérifier que les variables d'environnement requises sont présentes
    const requiredEnvVars = [
      'PRIVATE_KEY',
      'BASE_RPC_URL',
      'SOLANA_RPC_URL',
      'BASE_USDC',
      'SOL_USDC_MINT',
      'SOL_PENGU_MINT',
    ];

    const missingVars = requiredEnvVars.filter(key => !process.env[key]);
    
    if (missingVars.length > 0) {
      console.log(`⚠️ Skipping live tests - missing environment variables: ${missingVars.join(', ')}`);
      return;
    }

    // Configuration pour les tests live
    process.env.DRY_RUN = 'false';
    process.env.MAX_SPEND_USDC = '0.1'; // Montant très petit pour les tests
    process.env.MAX_SPEND_ETH = '0.001';
    process.env.SLIPPAGE_BPS = '100'; // 1% slippage pour les tests
    process.env.CONFIRMATIONS = '1';
    process.env.TIMEOUT_MS = '300000'; // 5 minutes
    process.env.MAX_GAS_GWEI = '20'; // Limite plus élevée pour les tests

    db = getE2EDatabase();
    erc20Service = createERC20Service();
    bridgeService = createLiFiBridgeService(db);
    jupiterService = createJupiterService();
    orcaService = createOrcaService();

    // Créer le wallet
    wallet = new ethers.Wallet(process.env.PRIVATE_KEY!);
    solanaWallet = new PublicKey(process.env.SOLANA_WALLET_ADDRESS || wallet.address);
  });

  afterAll(() => {
    closeE2EDatabase();
  });

  beforeEach(() => {
    // Skip les tests si les variables d'environnement ne sont pas configurées
    if (!process.env.PRIVATE_KEY) {
      return;
    }
  });

  describe('Pre-flight Checks', () => {
    it('should have sufficient balances', async () => {
      if (!process.env.PRIVATE_KEY) return;

      const ethBalance = await erc20Service.getBalance(wallet);
      const usdcBalance = await erc20Service.getBalance(wallet, process.env.BASE_USDC!);
      const solBalance = await jupiterService.getSolBalance(solanaWallet);

      console.log(`ETH Balance: ${ethers.formatEther(ethBalance)}`);
      console.log(`USDC Balance: ${ethers.formatUnits(usdcBalance, 6)}`);
      console.log(`SOL Balance: ${solBalance}`);

      expect(ethBalance).toBeGreaterThan(ethers.parseEther('0.001'));
      expect(usdcBalance).toBeGreaterThan(ethers.parseUnits('0.1', 6));
      expect(solBalance).toBeGreaterThan(0.01);
    });

    it('should have reasonable gas prices', async () => {
      if (!process.env.PRIVATE_KEY) return;

      const gasPriceOk = await erc20Service.checkGasPrice();
      expect(gasPriceOk).toBe(true);
    });
  });

  describe('Bridge Base → Solana', () => {
    it('should bridge USDC from Base to Solana', async () => {
      if (!process.env.PRIVATE_KEY) return;

      const jobId = `bridge_test_${Date.now()}`;
      const amount = ethers.parseUnits('0.1', 6).toString(); // 0.1 USDC

      // Créer le job
      db.createJob({
        id: jobId,
        status: 'pending',
        step: 'bridge_start',
      });

      try {
        // Obtenir la route
        const route = await bridgeService.getRoute({
          srcChainId: 8453, // Base
          dstChainId: 101,  // Solana
          srcToken: process.env.BASE_USDC!,
          dstToken: process.env.SOL_USDC_MINT!,
          amount,
          address: wallet.address,
        });

        expect(route).toBeDefined();
        expect(route.fromChainId).toBe(8453);
        expect(route.toChainId).toBe(101);

        // Construire la transaction
        const txData = bridgeService.buildTx(route);
        expect(txData.to).toBeDefined();
        expect(txData.data).toBeDefined();

        // Approve USDC si nécessaire
        const approved = await erc20Service.approveIfNeeded(
          wallet,
          process.env.BASE_USDC!,
          txData.to,
          BigInt(amount)
        );

        if (approved) {
          console.log('✅ USDC approved for bridge');
        }

        // Envoyer la transaction
        const result = await bridgeService.sendAndPoll(
          wallet,
          txData,
          jobId,
          {
            confirmations: 1,
            timeoutMs: 300000, // 5 minutes
          }
        );

        expect(result.srcTxHash).toBeDefined();
        expect(result.srcTxHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

        console.log(`✅ Bridge completed: ${result.srcTxHash}`);
        if (result.destTxHash) {
          console.log(`✅ Destination tx: ${result.destTxHash}`);
        }

      } catch (error: any) {
        console.error('❌ Bridge failed:', error.message);
        throw error;
      }
    });
  });

  describe('Solana Swap USDC → PENGU', () => {
    it('should swap USDC to PENGU on Solana', async () => {
      if (!process.env.PRIVATE_KEY) return;

      const amount = ethers.parseUnits('0.05', 6).toString(); // 0.05 USDC

      try {
        // Obtenir la quote
        const quote = await jupiterService.getQuote({
          inputMint: process.env.SOL_USDC_MINT!,
          outputMint: process.env.SOL_PENGU_MINT!,
          amount,
          slippageBps: 100, // 1%
        });

        expect(quote).toBeDefined();
        expect(quote.inAmount).toBe(amount);
        expect(quote.outAmount).toBeDefined();

        console.log(`Quote: ${quote.inAmount} USDC → ${quote.outAmount} PENGU`);

        // Exécuter le swap
        const result = await jupiterService.swapTx(solanaWallet, quote);

        expect(result.signature).toBeDefined();
        expect(result.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/); // Base58 signature

        console.log(`✅ Swap completed: ${result.signature}`);

      } catch (error: any) {
        console.error('❌ Swap failed:', error.message);
        throw error;
      }
    });
  });

  describe('Orca LP USDC/PENGU', () => {
    it('should add liquidity to USDC/PENGU pool', async () => {
      if (!process.env.PRIVATE_KEY) return;

      try {
        // S'assurer que les ATA existent
        await orcaService.ensureAta(solanaWallet, process.env.SOL_USDC_MINT!);
        await orcaService.ensureAta(solanaWallet, process.env.SOL_PENGU_MINT!);

        // Ajouter la liquidité
        const result = await orcaService.addLiquidityUSDC_PENGU({
          amountUsdc: ethers.parseUnits('0.02', 6).toString(), // 0.02 USDC
          amountPengu: '20000', // 0.02 PENGU (ajuster selon les décimales)
          slippageBps: 100, // 1%
          owner: solanaWallet,
        });

        expect(result.positionMint).toBeDefined();
        expect(result.signature).toBeDefined();

        console.log(`✅ LP created: position ${result.positionMint}`);
        console.log(`✅ LP tx: ${result.signature}`);

        // Tester le retrait partiel
        if (result.positionMint) {
          const withdrawResult = await orcaService.withdrawLiquidityPartial({
            pool: process.env.ORCA_USDC_PENGU_POOL || process.env.ORCA_USDC_WSOL_POOL!,
            positionMint: result.positionMint,
            pct: 10, // 10%
            owner: solanaWallet,
          });

          expect(withdrawResult.amountUsdc).toBeDefined();
          expect(withdrawResult.amountPengu).toBeDefined();

          console.log(`✅ Partial withdraw: ${withdrawResult.amountUsdc} USDC, ${withdrawResult.amountPengu} PENGU`);
        }

      } catch (error: any) {
        console.error('❌ LP operation failed:', error.message);
        throw error;
      }
    });
  });

  describe('End-to-End Flow', () => {
    it('should complete full E2E flow with micro amounts', async () => {
      if (!process.env.PRIVATE_KEY) return;

      const jobId = `e2e_full_${Date.now()}`;
      const bridgeAmount = ethers.parseUnits('0.05', 6).toString(); // 0.05 USDC

      console.log('🚀 Starting full E2E flow...');

      try {
        // 1. Bridge Base → Solana
        console.log('1️⃣ Bridging to Solana...');
        const bridgeRoute = await bridgeService.getRoute({
          srcChainId: 8453,
          dstChainId: 101,
          srcToken: process.env.BASE_USDC!,
          dstToken: process.env.SOL_USDC_MINT!,
          amount: bridgeAmount,
          address: wallet.address,
        });

        const bridgeTxData = bridgeService.buildTx(bridgeRoute);
        
        await erc20Service.approveIfNeeded(
          wallet,
          process.env.BASE_USDC!,
          bridgeTxData.to,
          BigInt(bridgeAmount)
        );

        const bridgeResult = await bridgeService.sendAndPoll(
          wallet,
          bridgeTxData,
          jobId,
          { confirmations: 1, timeoutMs: 300000 }
        );

        console.log(`✅ Bridge: ${bridgeResult.srcTxHash}`);

        // Attendre un peu pour que le bridge se finalise
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 secondes

        // 2. Swap USDC → PENGU
        console.log('2️⃣ Swapping USDC → PENGU...');
        const swapQuote = await jupiterService.getQuote({
          inputMint: process.env.SOL_USDC_MINT!,
          outputMint: process.env.SOL_PENGU_MINT!,
          amount: ethers.parseUnits('0.03', 6).toString(), // 0.03 USDC
          slippageBps: 100,
        });

        const swapResult = await jupiterService.swapTx(solanaWallet, swapQuote);
        console.log(`✅ Swap: ${swapResult.signature}`);

        // 3. LP USDC/PENGU
        console.log('3️⃣ Adding liquidity...');
        const lpResult = await orcaService.addLiquidityUSDC_PENGU({
          amountUsdc: ethers.parseUnits('0.01', 6).toString(), // 0.01 USDC
          amountPengu: '10000', // 0.01 PENGU
          slippageBps: 100,
          owner: solanaWallet,
        });

        console.log(`✅ LP: ${lpResult.positionMint}`);

        // 4. Vérifier les balances finaux
        console.log('4️⃣ Checking final balances...');
        const finalUsdcBalance = await jupiterService.getTokenBalance(solanaWallet, process.env.SOL_USDC_MINT!);
        const finalPenguBalance = await jupiterService.getTokenBalance(solanaWallet, process.env.SOL_PENGU_MINT!);
        const finalSolBalance = await jupiterService.getSolBalance(solanaWallet);

        console.log(`Final USDC balance: ${ethers.formatUnits(finalUsdcBalance, 6)}`);
        console.log(`Final PENGU balance: ${ethers.formatUnits(finalPenguBalance, 9)}`);
        console.log(`Final SOL balance: ${finalSolBalance}`);

        expect(finalUsdcBalance).toBeGreaterThan(0n);
        expect(finalPenguBalance).toBeGreaterThan(0n);
        expect(finalSolBalance).toBeGreaterThan(0);

        console.log('✅ Full E2E flow completed successfully!');

      } catch (error: any) {
        console.error('❌ E2E flow failed:', error.message);
        throw error;
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle insufficient balance gracefully', async () => {
      if (!process.env.PRIVATE_KEY) return;

      // Test avec un montant énorme qui devrait échouer
      await expect(
        jupiterService.getQuote({
          inputMint: process.env.SOL_USDC_MINT!,
          outputMint: process.env.SOL_PENGU_MINT!,
          amount: ethers.parseUnits('1000000', 6).toString(), // 1M USDC
          slippageBps: 100,
        })
      ).rejects.toThrow();
    });

    it('should handle invalid token addresses gracefully', async () => {
      if (!process.env.PRIVATE_KEY) return;

      await expect(
        jupiterService.getQuote({
          inputMint: 'invalid_mint_address',
          outputMint: process.env.SOL_PENGU_MINT!,
          amount: ethers.parseUnits('1', 6).toString(),
          slippageBps: 100,
        })
      ).rejects.toThrow();
    });
  });
});
