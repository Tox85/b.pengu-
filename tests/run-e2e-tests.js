#!/usr/bin/env node

/**
 * Script pour exécuter tous les tests end-to-end du PENGU Bot
 * Usage: node tests/run-e2e-tests.js [--verbose] [--performance] [--monitoring]
 */

const { spawn } = require('child_process');
const path = require('path');

// Configuration des tests
const testConfig = {
  verbose: process.argv.includes('--verbose'),
  performance: process.argv.includes('--performance'),
  monitoring: process.argv.includes('--monitoring'),
  all: !process.argv.includes('--performance') && !process.argv.includes('--monitoring'),
};

console.log('🚀 PENGU Bot - Tests End-to-End');
console.log('================================');
console.log(`📊 Configuration:`);
console.log(`  - Verbose: ${testConfig.verbose ? '✅' : '❌'}`);
console.log(`  - Performance: ${testConfig.performance ? '✅' : '❌'}`);
console.log(`  - Monitoring: ${testConfig.monitoring ? '✅' : '❌'}`);
console.log(`  - Tous les tests: ${testConfig.all ? '✅' : '❌'}`);
console.log('');

// Fonction pour exécuter les tests
async function runTests(testPattern, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔄 ${description}`);
    console.log('─'.repeat(50));
    
    const args = [
      'test',
      testPattern,
      '--verbose',
      '--detectOpenHandles',
      '--forceExit',
      '--testTimeout=60000'
    ];
    
    if (testConfig.verbose) {
      args.push('--verbose');
    }
    
    const jest = spawn('npx', ['jest', ...args], {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd()
    });
    
    jest.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${description} - RÉUSSI`);
        resolve();
      } else {
        console.log(`❌ ${description} - ÉCHOUÉ (code: ${code})`);
        reject(new Error(`Tests échoués avec le code ${code}`));
      }
    });
    
    jest.on('error', (error) => {
      console.log(`❌ ${description} - ERREUR: ${error.message}`);
      reject(error);
    });
  });
}

// Fonction principale
async function main() {
  const startTime = Date.now();
  const results = {
    passed: 0,
    failed: 0,
    total: 0
  };
  
  try {
    // Tests de base end-to-end
    if (testConfig.all || testConfig.performance) {
      try {
        await runTests('tests/e2e.test.ts', 'Tests End-to-End de base');
        results.passed++;
      } catch (error) {
        results.failed++;
        console.error('❌ Erreur dans les tests de base:', error.message);
      }
      results.total++;
    }
    
    // Tests de monitoring
    if (testConfig.all || testConfig.monitoring) {
      try {
        await runTests('tests/monitoring.e2e.test.ts', 'Tests de Monitoring');
        results.passed++;
      } catch (error) {
        results.failed++;
        console.error('❌ Erreur dans les tests de monitoring:', error.message);
      }
      results.total++;
    }
    
    // Tests de smoke
    if (testConfig.all) {
      try {
        await runTests('tests/smoke.test.ts', 'Tests de Smoke');
        results.passed++;
      } catch (error) {
        results.failed++;
        console.error('❌ Erreur dans les tests de smoke:', error.message);
      }
      results.total++;
    }
    
    // Tests unitaires
    if (testConfig.all) {
      try {
        await runTests('tests/*.test.ts', 'Tests Unitaires');
        results.passed++;
      } catch (error) {
        results.failed++;
        console.error('❌ Erreur dans les tests unitaires:', error.message);
      }
      results.total++;
    }
    
  } catch (error) {
    console.error('❌ Erreur générale:', error.message);
  }
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  // Résumé final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ DES TESTS END-TO-END');
  console.log('='.repeat(60));
  console.log(`⏱️  Durée totale: ${duration}s`);
  console.log(`📈 Tests exécutés: ${results.total}`);
  console.log(`✅ Réussis: ${results.passed}`);
  console.log(`❌ Échoués: ${results.failed}`);
  console.log(`📊 Taux de réussite: ${((results.passed / results.total) * 100).toFixed(1)}%`);
  
  if (results.failed === 0) {
    console.log('\n🎉 TOUS LES TESTS SONT PASSÉS !');
    console.log('🚀 Le PENGU Bot est prêt pour la production !');
  } else {
    console.log('\n⚠️  CERTAINS TESTS ONT ÉCHOUÉ');
    console.log('🔧 Vérifiez les logs ci-dessus pour plus de détails');
    process.exit(1);
  }
}

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Erreur non gérée:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Exception non capturée:', error);
  process.exit(1);
});

// Exécuter les tests
main().catch((error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
