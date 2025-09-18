/**
 * Tests pour la simulation SIGN_ONLY
 * Vérifie que les transactions sont simulées sans être broadcastées
 */

import { BridgeManager } from '../modules/bridge';
import { TradingManager } from '../modules/trading';
import { LiquidityManager } from '../modules/liquidity';
import { simulateSolanaTransaction, simulateEvmTx, validateSimulationResult } from '../src/simulation/rpcSimulators';

// Mock des dépendances
const mockWalletManager = {
  getWallet: vi.fn().mockReturnValue({
    address: 'test-solana-address',
    evmAddress: '0xtest-evm-address',
    evmPrivateKey: 'test-private-key'
  }),
  signSolanaTransaction: vi.fn().mockResolvedValue('mock-signed-tx')
};

const mockConnection = {
  simulateTransaction: vi.fn().mockResolvedValue({
    value: { err: null, logs: ['test log'], unitsConsumed: 1500 }
  }),
  sendTransaction: vi.fn(),
  confirmTransaction: vi.fn()
};

const mockProvider = {
  estimateGas: vi.fn().mockResolvedValue(120000),
  call: vi.fn().mockResolvedValue('0x'),
  broadcastTransaction: vi.fn()
};

describe('Sign-only simulation', () => {
  beforeAll(() => {
    // Configurer l'environnement pour les tests
    process.env.DRY_RUN = 'true';
    process.env.SIGN_ONLY = 'true';
  });

  afterAll(() => {
    // Nettoyer l'environnement
    delete process.env.DRY_RUN;
    delete process.env.SIGN_ONLY;
  });

  describe('BridgeManager', () => {
    let bridgeManager: BridgeManager;

    beforeEach(() => {
      bridgeManager = new BridgeManager({
        walletManager: mockWalletManager,
        solanaConnection: mockConnection,
        ethereumProvider: mockProvider,
        bscProvider: mockProvider
      });
      
      // S'assurer que SIGN_ONLY est bien défini
      process.env.SIGN_ONLY = 'true';
    });

    it('should simulate bridge transaction without broadcasting', async () => {
      // Mock de la méthode getBridgeQuote pour retourner un quote valide
      vi.spyOn(bridgeManager, 'getBridgeQuote')
        .mockResolvedValue({
          fromChain: '1',
          toChain: '101',
          fromToken: '0xA0b86a33E6c0b6c0b6c0b6c0b6c0b6c0b6c0b6c0',
          toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          fromAmount: '1000000',
          toAmount: '998000',
          tool: 'cctp',
          gasCosts: []
        } as any);

      // Mock de la méthode privée buildBridgeTransaction
      vi.spyOn(bridgeManager as any, 'buildBridgeTransaction')
        .mockResolvedValue({
          to: '0x123',
          value: '0',
          data: '0x',
          gasLimit: '21000'
        });

      // Mock de la méthode privée signTransactionLocal
      vi.spyOn(bridgeManager as any, 'signTransactionLocal')
        .mockResolvedValue('mock-signed-tx-base64');

      const result = await bridgeManager.bridgeUsdcToSpl(0, 'ethereum', '1000000');

      expect(result.simulated).toBe(true);
      expect(result.success).toBe(true);
      expect(result.txHash).toBe('simulated-tx-hash');
    });

    it('should handle simulation failures gracefully', async () => {
      // Mock pour simuler un échec de simulation
      vi.spyOn(bridgeManager as any, 'buildBridgeTransaction')
        .mockResolvedValue({
          to: '0x123',
          value: '0',
          data: '0x',
          gasLimit: '21000'
        });

      vi.spyOn(bridgeManager as any, 'signTransactionLocal')
        .mockRejectedValue(new Error('Simulation failed'));

      const result = await bridgeManager.bridgeUsdcToSpl(0, 'ethereum', '1000000');

      expect(result.simulated).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Simulation failed');
    });
  });

  describe('TradingManager', () => {
    let tradingManager: TradingManager;

    beforeEach(() => {
      tradingManager = new TradingManager({
        walletManager: mockWalletManager,
        connection: mockConnection
      });
    });

    it('should simulate swap transaction without broadcasting', async () => {
      // Mock de la méthode getSwapQuote
      vi.spyOn(tradingManager, 'getSwapQuote')
        .mockResolvedValue({
          inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          outputMint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
          inAmount: '1000000',
          outAmount: '1000000',
          otherAmountThreshold: '990000',
          swapMode: 'ExactIn',
          slippageBps: 300,
          priceImpactPct: '0.1',
          routePlan: []
        } as any);

      // Mock de la méthode privée buildSwapTransaction
      vi.spyOn(tradingManager as any, 'buildSwapTransaction')
        .mockResolvedValue({
          instructions: [],
          recentBlockhash: 'test-blockhash'
        });

      // Mock de la méthode privée signTransactionLocal
      vi.spyOn(tradingManager as any, 'signTransactionLocal')
        .mockResolvedValue('mock-signed-tx-base64');

      const result = await tradingManager.swapUsdcToPengu(0, 1.0);

      expect(result.success).toBe(true);
      expect(result.txSignature).toBe('simulated-swap-signature');
      expect(result.actualSlippage).toBeDefined();
    });

    it('should simulate PENGU to USDC swap', async () => {
      // Mock de la méthode getSwapQuote
      vi.spyOn(tradingManager, 'getSwapQuote')
        .mockResolvedValue({
          inputMint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          inAmount: '1000000',
          outAmount: '1000000',
          otherAmountThreshold: '990000',
          swapMode: 'ExactIn',
          slippageBps: 300,
          priceImpactPct: '0.1',
          routePlan: []
        } as any);

      vi.spyOn(tradingManager as any, 'buildSwapTransaction')
        .mockResolvedValue({
          instructions: [],
          recentBlockhash: 'test-blockhash'
        });

      vi.spyOn(tradingManager as any, 'signTransactionLocal')
        .mockResolvedValue('mock-signed-tx-base64');

      const result = await tradingManager.swapPenguToUsdc(0, 1000.0);

      expect(result.success).toBe(true);
      expect(result.txSignature).toBe('simulated-swap-signature');
    });
  });

  describe('LiquidityManager', () => {
    let liquidityManager: LiquidityManager;

    beforeEach(() => {
      liquidityManager = new LiquidityManager({
        walletManager: mockWalletManager,
        connection: mockConnection
      });
    });

    it('should simulate position opening without broadcasting', async () => {
      // Mock de la méthode privée buildOpenPositionTransaction
      vi.spyOn(liquidityManager as any, 'buildOpenPositionTransaction')
        .mockResolvedValue({
          instructions: [],
          recentBlockhash: 'test-blockhash'
        });

      // Mock de la méthode privée signTransactionLocal
      vi.spyOn(liquidityManager as any, 'signTransactionLocal')
        .mockResolvedValue('mock-signed-tx-base64');

      const result = await liquidityManager.openPosition(0, 'test-pool', -1000, 1000, 5.0);

      expect(result.success).toBe(true);
      expect(result.signature).toBe('simulated-position-signature');
      expect(result.positionId).toContain('simulated-position_');
    });
  });

  describe('RPC Simulators', () => {
    it('should simulate Solana transaction in DRY_RUN mode', async () => {
      const result = await simulateSolanaTransaction(mockConnection, 'mock-tx-base64');

      expect(result.value.err).toBe(null);
      expect(result.value.logs).toBeDefined();
      expect(result.value.unitsConsumed).toBeGreaterThan(0);
    });

    it('should simulate EVM transaction in DRY_RUN mode', async () => {
      const result = await simulateEvmTx(null, { to: '0x123', value: '0' });

      expect(result.gasEstimate).toBeGreaterThan(0);
      expect(result.willRevert).toBe(false);
    });

    it('should validate simulation results correctly', () => {
      const solanaResult = {
        value: { err: null, logs: ['test'], unitsConsumed: 1500 }
      };

      const validation = validateSimulationResult(solanaResult, 'bridge');

      expect(validation.success).toBe(true);
      expect(validation.details.unitsConsumed).toBe(1500);
      expect(validation.warnings).toHaveLength(0);
    });

    it('should detect simulation failures', () => {
      const failedResult = {
        value: { err: 'Insufficient funds', logs: null, unitsConsumed: 0 }
      };

      const validation = validateSimulationResult(failedResult, 'trading');

      expect(validation.success).toBe(false);
      expect(validation.warnings).toContain('Solana transaction would fail: Insufficient funds');
    });

    it('should warn about high compute units', () => {
      const highComputeResult = {
        value: { err: null, logs: ['test'], unitsConsumed: 250000 }
      };

      const validation = validateSimulationResult(highComputeResult, 'liquidity');

      expect(validation.success).toBe(true);
      expect(validation.warnings).toContain('High compute units consumed: 250000');
    });
  });

  describe('Integration tests', () => {
    it('should complete full bridge -> swap -> LP simulation flow', async () => {
      const bridgeManager = new BridgeManager({
        walletManager: mockWalletManager,
        solanaConnection: mockConnection,
        ethereumProvider: mockProvider
      });

      const tradingManager = new TradingManager({
        walletManager: mockWalletManager,
        connection: mockConnection
      });

      const liquidityManager = new LiquidityManager({
        walletManager: mockWalletManager,
        connection: mockConnection
      });

      // Mock toutes les méthodes privées nécessaires
      vi.spyOn(bridgeManager as any, 'buildBridgeTransaction').mockResolvedValue({});
      vi.spyOn(bridgeManager as any, 'signTransactionLocal').mockResolvedValue('mock-signed-tx');
      vi.spyOn(tradingManager as any, 'buildSwapTransaction').mockResolvedValue({});
      vi.spyOn(tradingManager as any, 'signTransactionLocal').mockResolvedValue('mock-signed-tx');
      vi.spyOn(liquidityManager as any, 'buildOpenPositionTransaction').mockResolvedValue({});
      vi.spyOn(liquidityManager as any, 'signTransactionLocal').mockResolvedValue('mock-signed-tx');

      // Exécuter le flow complet
      const bridgeResult = await bridgeManager.bridgeUsdcToSpl(0, 'ethereum', '1000000');
      const swapResult = await tradingManager.swapUsdcToPengu(0, 1.0);
      const lpResult = await liquidityManager.openPosition(0, 'test-pool', -1000, 1000, 5.0);

      // Vérifier que tout a été simulé
      expect(bridgeResult.simulated).toBe(true);
      expect(bridgeResult.success).toBe(true);
      expect(swapResult.success).toBe(true);
      expect(swapResult.txSignature).toBe('simulated-swap-signature');
      expect(lpResult.success).toBe(true);
      expect(lpResult.signature).toBe('simulated-position-signature');
    });
  });
});
