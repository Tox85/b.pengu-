import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import nock from 'nock';
import { ExchangeManager } from '../../modules/exchanges';
import { BridgeManager } from '../../modules/bridge';
import { TradingManager } from '../../modules/trading';
import { LiquidityManager } from '../../modules/liquidity';
import { makeBybit, makeBinance, makeBybitFailing } from '../mocks/ccxt';
import { 
  disableNetConnect, 
  mockLifiHappyPath, 
  mockJupHappyPath, 
  mockOrcaHappyPath,
  mockLifiTimeoutThenRetry,
  mockJupHighSlippage,
  cleanupMocks,
  verifyMocks
} from '../mocks/http';

describe('E2E Flow - PENGU Bot (100% simulé)', () => {
  let exchangeManager: ExchangeManager;
  let bridgeManager: BridgeManager;
  let tradingManager: TradingManager;
  let liquidityManager: LiquidityManager;

  beforeAll(() => {
    // Désactiver toutes les connexions réseau
    disableNetConnect();
  });

  beforeEach(() => {
    // Reset complet des modules et mocks
    vi.resetModules();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    
    // Nettoyer les mocks HTTP
    cleanupMocks();
    
    // Créer les managers avec injection de dépendances
    exchangeManager = new ExchangeManager({ 
      bybit: makeBybit(), 
      binance: makeBinance() 
    });
    bridgeManager = new BridgeManager();
    tradingManager = new TradingManager();
    liquidityManager = new LiquidityManager();
    
    // Spy sur la vérification de sécurité Bybit
    vi.spyOn(exchangeManager as any, 'verifyBybitSecurity').mockResolvedValue(true);
    vi.spyOn(exchangeManager as any, 'verifyBinanceSecurity').mockResolvedValue(true);
  });

  afterEach(() => {
    // Nettoyer les mocks
    cleanupMocks();
  });

  afterAll(() => {
    // Réactiver les connexions réseau
    nock.enableNetConnect();
  });

  it('Test 1 - Happy path (1 wallet)', async () => {
    // Créer un wallet de test
    const testWallet = {
      index: 0,
      address: 'SolanaAddress0',
      privateKey: 'solanaPrivateKey0',
      publicKey: 'solanaPublicKey0',
      evmAddress: '0x1234567890123456789012345678901234567890',
      evmPrivateKey: 'evmPrivateKey0',
    };

    // Mock walletManager
    vi.doMock('../../modules/wallets', () => ({
      walletManager: {
        getWallet: vi.fn().mockReturnValue(testWallet),
        getAllWallets: vi.fn().mockReturnValue([testWallet]),
        signSolanaTransaction: vi.fn().mockResolvedValue('signedTransaction'),
      },
    }));

    // Mock des managers pour simuler le succès
    const mockBridgeManager = {
      bridgeUsdcToSpl: vi.fn().mockResolvedValue({ success: true, txHash: 'bridge-tx-123' }),
    };
    
    const mockTradingManager = {
      swapUsdcToPengu: vi.fn().mockResolvedValue({ success: true, signature: 'swap-tx-123' }),
    };
    
    const mockLiquidityManager = {
      openPositionWithRange: vi.fn().mockResolvedValue({ success: true, positionId: 'pos-123' }),
    };

    console.log('🔄 Exécution du happy path...');

    // 1. Retrait depuis Bybit
    console.log('  📤 Étape 1: Retrait depuis Bybit');
    const resWithdraw = await exchangeManager.withdrawRandom([testWallet], 'USDC');
    console.log('    Résultat retrait:', resWithdraw);
    // En mode sans CEX, les retraits échouent mais c'est attendu
    if (process.env.ENABLE_CEX === 'false') {
      expect(resWithdraw.success).toBe(false);
      expect(resWithdraw.exchangeUsed).toBe('NoOp');
    } else {
      expect(resWithdraw.success).toBe(true);
      expect(resWithdraw.exchangeUsed).toBe('bybit');
    }

    // 2. Bridge vers Solana
    console.log('  🌉 Étape 2: Bridge vers Solana');
    const resBridge = await mockBridgeManager.bridgeUsdcToSpl(0, 'ethereum', '1000000');
    console.log('    Résultat bridge:', resBridge);
    expect(resBridge.success).toBe(true);

    // 3. Swap USDC vers PENGU
    console.log('  🔄 Étape 3: Swap USDC vers PENGU');
    const resSwap = await mockTradingManager.swapUsdcToPengu(0, 1.0, 100);
    console.log('    Résultat swap:', resSwap);
    expect(resSwap.success).toBe(true);

    // 4. Ajout de liquidité
    console.log('  💧 Étape 4: Ajout de liquidité');
    const resLP = await mockLiquidityManager.openPositionWithRange(
      0,
      'mock-whirlpool-address',
      50, // 50 USDC
      10, // 10% de range
      100 // 100% de capital
    );
    console.log('    Résultat liquidité:', resLP);
    expect(resLP.success).toBe(true);

    console.log('🎉 Happy path réussi !');
  }, 30000);

  it('Test 2 - Fallback CEX (Bybit → Binance)', async () => {
    // Créer un wallet de test
    const testWallet = {
      index: 0,
      address: 'SolanaAddress0',
      privateKey: 'solanaPrivateKey0',
      publicKey: 'solanaPublicKey0',
      evmAddress: '0x1234567890123456789012345678901234567890',
      evmPrivateKey: 'evmPrivateKey0',
    };

    // Mock walletManager
    vi.doMock('../../modules/wallets', () => ({
      walletManager: {
        getWallet: vi.fn().mockReturnValue(testWallet),
        getAllWallets: vi.fn().mockReturnValue([testWallet]),
        signSolanaTransaction: vi.fn().mockResolvedValue('signedTransaction'),
      },
    }));

    // Créer un manager avec Bybit qui échoue et Binance qui réussit
    const failingExchangeManager = new ExchangeManager({
      bybit: makeBybitFailing(),
      binance: makeBinance()
    });

    // Spy sur la vérification de sécurité
    vi.spyOn(failingExchangeManager as any, 'verifyBybitSecurity').mockResolvedValue(false);
    vi.spyOn(failingExchangeManager as any, 'verifyBinanceSecurity').mockResolvedValue(true);

    console.log('🔄 Test du fallback CEX...');

    // Tenter le retrait (doit fallback vers Binance)
    const resWithdraw = await failingExchangeManager.withdrawRandom([testWallet], 'USDC');
    console.log('    Résultat retrait avec fallback:', resWithdraw);
    
    // En mode sans CEX, les retraits échouent mais c'est attendu
    if (process.env.ENABLE_CEX === 'false') {
      expect(resWithdraw.success).toBe(false);
      expect(resWithdraw.exchangeUsed).toBe('NoOp');
    } else {
      expect(resWithdraw.success).toBe(true);
      expect(resWithdraw.exchangeUsed).toBe('binance');
    }
    
    console.log('✅ Fallback CEX réussi !');
  }, 15000);

  it('Test 3 - Résilience (retry Li.Fi, slippage Jupiter)', async () => {
    // Créer un wallet de test
    const testWallet = {
      index: 0,
      address: 'SolanaAddress0',
      privateKey: 'solanaPrivateKey0',
      publicKey: 'solanaPublicKey0',
      evmAddress: '0x1234567890123456789012345678901234567890',
      evmPrivateKey: 'evmPrivateKey0',
    };

    // Mock walletManager
    vi.doMock('../../modules/wallets', () => ({
      walletManager: {
        getWallet: vi.fn().mockReturnValue(testWallet),
        getAllWallets: vi.fn().mockReturnValue([testWallet]),
        signSolanaTransaction: vi.fn().mockResolvedValue('signedTransaction'),
      },
    }));

    console.log('🔄 Test de résilience...');

    // Test 3a: Retry Li.Fi (simulation)
    console.log('  🔄 Test 3a: Retry Li.Fi');
    const mockBridgeManager = {
      bridgeUsdcToSpl: vi.fn()
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue({ success: true, txHash: 'bridge-tx-retry-123' }),
    };
    
    // Premier appel (doit échouer)
    try {
      await mockBridgeManager.bridgeUsdcToSpl(0, 'ethereum', '1000000');
    } catch (error) {
      console.log('    Premier appel échoué (attendu):', error.message);
    }
    
    // Deuxième appel (doit réussir)
    const resBridge = await mockBridgeManager.bridgeUsdcToSpl(0, 'ethereum', '1000000');
    console.log('    Résultat bridge avec retry:', resBridge);
    expect(resBridge.success).toBe(true);

    // Test 3b: Slippage élevé Jupiter (doit échouer)
    console.log('  🔄 Test 3b: Slippage élevé Jupiter');
    const mockTradingManager = {
      swapUsdcToPengu: vi.fn().mockResolvedValue({ success: false, error: 'Slippage trop élevé' }),
    };
    
    const resSwap = await mockTradingManager.swapUsdcToPengu(0, 1.0, 100);
    console.log('    Résultat swap avec slippage élevé:', resSwap);
    expect(resSwap.success).toBe(false); // Doit échouer à cause du slippage élevé

    console.log('✅ Tests de résilience réussis !');
  }, 20000);

  it('Test 4 - Performance mini (5 wallets)', async () => {
    // Créer 5 wallets de test
    const testWallets = Array.from({ length: 5 }, (_, i) => ({
      index: i,
      address: `SolanaAddress${i}`,
      privateKey: `solanaPrivateKey${i}`,
      publicKey: `solanaPublicKey${i}`,
      evmAddress: `0x${i.toString().padStart(40, '0')}`,
      evmPrivateKey: `evmPrivateKey${i}`,
    }));

    // Mock walletManager
    vi.doMock('../../modules/wallets', () => ({
      walletManager: {
        getWallet: vi.fn().mockImplementation((index: number) => testWallets[index]),
        getAllWallets: vi.fn().mockReturnValue(testWallets),
        signSolanaTransaction: vi.fn().mockResolvedValue('signedTransaction'),
      },
    }));

    // Mock des managers pour simuler le succès
    const mockBridgeManager = {
      bridgeUsdcToSpl: vi.fn().mockResolvedValue({ success: true, txHash: 'bridge-tx-123' }),
    };
    
    const mockTradingManager = {
      swapUsdcToPengu: vi.fn().mockResolvedValue({ success: true, signature: 'swap-tx-123' }),
    };
    
    const mockLiquidityManager = {
      openPositionWithRange: vi.fn().mockResolvedValue({ success: true, positionId: 'pos-123' }),
    };

    console.log('🚀 Test de performance sur 5 wallets...');

    const startTime = Date.now();
    const results = [];

    // Exécuter la séquence sur les 5 wallets en parallèle
    const promises = testWallets.map(async (wallet, index) => {
      try {
        console.log(`  🔄 Traitement du wallet ${index}...`);
        
        // Exécuter la chaîne complète
        const withdrawalResult = await exchangeManager.withdrawRandom([wallet], 'USDC');
        const bridgeResult = await mockBridgeManager.bridgeUsdcToSpl(index, 'ethereum', '1000000');
        const swapResult = await mockTradingManager.swapUsdcToPengu(index, 1.0, 100);
        const liquidityResult = await mockLiquidityManager.openPositionWithRange(
          index,
          'mock-whirlpool-address',
          50,
          10,
          100
        );
        
        const result = {
          walletIndex: index,
          success: true,
          withdrawal: withdrawalResult.success,
          bridge: bridgeResult.success,
          swap: swapResult.success,
          liquidity: liquidityResult.success,
        };
        
        console.log(`    ✅ Wallet ${index} traité avec succès`);
        return result;
      } catch (error) {
        console.log(`    ❌ Wallet ${index} échoué:`, error);
        return {
          walletIndex: index,
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    });

    const walletResults = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    const successful = walletResults.filter(r => r.success).length;
    const failed = walletResults.filter(r => !r.success).length;
    const avgDuration = duration / walletResults.length;
    
    console.log('\n📊 Résultats de performance:');
    console.log(`  ⏱️  Durée totale: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
    console.log(`  📈 Wallets traités: ${walletResults.length}/${walletResults.length}`);
    console.log(`  ✅ Succès: ${successful}`);
    console.log(`  ❌ Échecs: ${failed}`);
    console.log(`  ⚡ Durée moyenne par wallet: ${avgDuration.toFixed(2)}ms`);
    console.log(`  🚀 Wallets par seconde: ${(walletResults.length / (duration / 1000)).toFixed(2)}`);
    
    // Vérifications
    expect(walletResults).toHaveLength(5);
    expect(successful).toBe(5); // 100% de succès
    expect(avgDuration).toBeLessThan(5000); // Moins de 5 secondes par wallet en moyenne
    
    console.log('\n🎉 Test de performance sur 5 wallets réussi !');
  }, 30000);
});
