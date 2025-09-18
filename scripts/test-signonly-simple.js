#!/usr/bin/env node

/**
 * Script de test simple pour SIGN_ONLY
 * Teste directement les simulateurs RPC sans Jest
 */

// Configuration des variables d'environnement pour la simulation
process.env.DRY_RUN = 'true';
process.env.SIGN_ONLY = 'true';
process.env.ENABLE_CEX = 'false';

const { simulateSolanaTransaction, simulateEvmTx, validateSimulationResult } = require('../dist/src/simulation/rpcSimulators');

async function testSignOnlySimulation() {
  console.log('🚀 Test de simulation SIGN_ONLY...');
  console.log('📋 Configuration:');
  console.log('  - DRY_RUN=true');
  console.log('  - SIGN_ONLY=true');
  console.log('  - ENABLE_CEX=false');
  console.log('');

  try {
    // Mock connection
    const mockConnection = {
      simulateTransaction: async () => ({
        value: { err: null, logs: ['SIMULATED: success'], unitsConsumed: 1500 }
      })
    };

    console.log('🔧 Test 1: Solana transaction simulation...');
    const solanaResult = await simulateSolanaTransaction(mockConnection, 'mock-tx-base64');
    console.log('✅ Solana simulation result:', {
      err: solanaResult.value.err,
      unitsConsumed: solanaResult.value.unitsConsumed,
      logs: solanaResult.value.logs
    });

    console.log('🔧 Test 2: EVM transaction simulation...');
    const evmResult = await simulateEvmTx(null, { to: '0x123', value: '0' });
    console.log('✅ EVM simulation result:', {
      gasEstimate: evmResult.gasEstimate,
      willRevert: evmResult.willRevert
    });

    console.log('🔧 Test 3: Validation des résultats...');
    const validation = validateSimulationResult(solanaResult, 'bridge');
    console.log('✅ Validation result:', {
      success: validation.success,
      warnings: validation.warnings
    });

    console.log('');
    console.log('🎯 Résumé des tests:');
    console.log(`  - Solana simulation: ${solanaResult.value.err === null ? '✅ Succès' : '❌ Échec'}`);
    console.log(`  - EVM simulation: ${evmResult.gasEstimate > 0 ? '✅ Succès' : '❌ Échec'}`);
    console.log(`  - Validation: ${validation.success ? '✅ Succès' : '❌ Échec'}`);

    if (solanaResult.value.err === null && evmResult.gasEstimate > 0 && validation.success) {
      console.log('');
      console.log('🎉 Tous les tests SIGN_ONLY ont réussi !');
      console.log('✅ La simulation RPC fonctionne correctement');
      console.log('');
      console.log('📊 Détails de la simulation:');
      console.log(`  - Units Solana consommées: ${solanaResult.value.unitsConsumed}`);
      console.log(`  - Gas EVM estimé: ${evmResult.gasEstimate}`);
      console.log(`  - Avertissements: ${validation.warnings.length}`);
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
