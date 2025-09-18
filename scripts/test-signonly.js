#!/usr/bin/env node

/**
 * Script de test spécifique pour SIGN_ONLY
 * Force l'exécution des méthodes de bridge, trading et liquidity en mode simulation
 */

// Configuration des variables d'environnement pour la simulation
process.env.DRY_RUN = 'true';
process.env.SIGN_ONLY = 'true';
process.env.ENABLE_CEX = 'false';

const { BridgeManager } = require('../dist/modules/bridge');
const { TradingManager } = require('../dist/modules/trading');
const { LiquidityManager } = require('../dist/modules/liquidity');

// Mock des dépendances
const mockWalletManager = {
  getWallet: jest.fn().mockReturnValue({
    address: 'test-solana-address',
    evmAddress: '0xtest-evm-address',
    evmPrivateKey: 'test-private-key'
  }),
  signSolanaTransaction: jest.fn().mockResolvedValue('mock-signed-tx')
};

const mockConnection = {
  simulateTransaction: jest.fn().mockResolvedValue({
    value: { err: null, logs: ['SIMULATED: success'], unitsConsumed: 1500 }
  }),
  sendTransaction: jest.fn(),
  confirmTransaction: jest.fn()
};

const mockProvider = {
  estimateGas: jest.fn().mockResolvedValue(120000),
  call: jest.fn().mockResolvedValue('0x'),
  broadcastTransaction: jest.fn()
};

async function testSignOnlySimulation() {
  console.log('🚀 Test de simulation SIGN_ONLY...');
  console.log('📋 Configuration:');
  console.log('  - DRY_RUN=true');
  console.log('  - SIGN_ONLY=true');
  console.log('  - ENABLE_CEX=false');
  console.log('');

  try {
    // Initialiser les managers
    const bridgeManager = new BridgeManager({
      walletManager: mockWalletManager,
      solanaConnection: mockConnection,
      ethereumProvider: mockProvider,
      bscProvider: mockProvider
    });

    const tradingManager = new TradingManager({
      walletManager: mockWalletManager,
      connection: mockConnection
    });

    const liquidityManager = new LiquidityManager({
      walletManager: mockWalletManager,
      connection: mockConnection
    });

    // Mock des méthodes privées
    jest.spyOn(bridgeManager, 'getBridgeQuote').mockResolvedValue({
      fromChain: '1',
      toChain: '101',
      fromToken: '0xA0b86a33E6c0b6c0b6c0b6c0b6c0b6c0b6c0b6c0',
      toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      fromAmount: '1000000',
      toAmount: '998000',
      tool: 'cctp',
      gasCosts: []
    });

    jest.spyOn(tradingManager, 'getSwapQuote').mockResolvedValue({
      inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      outputMint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
      inAmount: '1000000',
      outAmount: '1000000',
      otherAmountThreshold: '990000',
      swapMode: 'ExactIn',
      slippageBps: 300,
      priceImpactPct: '0.1',
      routePlan: []
    });

    jest.spyOn(bridgeManager, 'buildBridgeTransaction').mockResolvedValue({
      to: '0x123',
      value: '0',
      data: '0x',
      gasLimit: '21000'
    });

    jest.spyOn(tradingManager, 'buildSwapTransaction').mockResolvedValue({
      instructions: [],
      recentBlockhash: 'test-blockhash'
    });

    jest.spyOn(liquidityManager, 'buildOpenPositionTransaction').mockResolvedValue({
      instructions: [],
      recentBlockhash: 'test-blockhash'
    });

    jest.spyOn(bridgeManager, 'signTransactionLocal').mockResolvedValue('mock-signed-tx-base64');
    jest.spyOn(tradingManager, 'signTransactionLocal').mockResolvedValue('mock-signed-tx-base64');
    jest.spyOn(liquidityManager, 'signTransactionLocal').mockResolvedValue('mock-signed-tx-base64');

    console.log('🔧 Test 1: Bridge simulation...');
    const bridgeResult = await bridgeManager.bridgeUsdcToSpl(0, 'ethereum', '1000000');
    console.log('✅ Bridge result:', {
      success: bridgeResult.success,
      simulated: bridgeResult.simulated,
      txHash: bridgeResult.txHash
    });

    console.log('🔧 Test 2: Trading simulation...');
    const swapResult = await tradingManager.swapUsdcToPengu(0, 1.0);
    console.log('✅ Swap result:', {
      success: swapResult.success,
      simulated: swapResult.simulated,
      txSignature: swapResult.txSignature
    });

    console.log('🔧 Test 3: Liquidity simulation...');
    const lpResult = await liquidityManager.openPosition(0, 'test-pool', -1000, 1000, 5.0);
    console.log('✅ LP result:', {
      success: lpResult.success,
      simulated: lpResult.simulated,
      signature: lpResult.signature
    });

    console.log('');
    console.log('🎯 Résumé des tests:');
    console.log(`  - Bridge: ${bridgeResult.simulated ? '✅ Simulé' : '❌ Non simulé'}`);
    console.log(`  - Trading: ${swapResult.simulated ? '✅ Simulé' : '❌ Non simulé'}`);
    console.log(`  - Liquidity: ${lpResult.simulated ? '✅ Simulé' : '❌ Non simulé'}`);

    if (bridgeResult.simulated && swapResult.simulated && lpResult.simulated) {
      console.log('');
      console.log('🎉 Tous les tests SIGN_ONLY ont réussi !');
      console.log('✅ La simulation RPC fonctionne correctement');
    } else {
      console.log('');
      console.log('❌ Certains tests ont échoué');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Erreur lors du test SIGN_ONLY:', error);
    process.exit(1);
  }
}

// Démarrer le test
testSignOnlySimulation().catch(console.error);
