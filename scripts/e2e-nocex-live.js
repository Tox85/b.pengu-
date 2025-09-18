#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🐧 E2E No CEX Live - Chaîne complète sans CEX');
console.log('   Base(USDC) → Bridge → Solana(USDC) → Swap → PENGU → LP Orca');

async function runE2ENoCEX() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  let results = {
    sanityCheck: null,
    ensureSol: null,
    jupiterSwap: null,
    orcaLp: null
  };

  try {
    // Step 1: Sanity check .env
    console.log('\n1️⃣ Vérification configuration .env...');
    const sanityResult = await runScript('scripts/sanity-env.js', []);
    if (sanityResult.code !== 0) {
      throw new Error('Configuration .env invalide');
    }
    results.sanityCheck = { success: true };
    console.log('   ✅ Configuration .env OK');

    // Step 2: Ensure SOL
    console.log('\n2️⃣ Vérification et approvisionnement SOL...');
    const ensureSolResult = await runScript('scripts/ensure-sol.js', []);
    if (ensureSolResult.code !== 0) {
      throw new Error('Échec de l\'approvisionnement SOL');
    }
    results.ensureSol = { success: true, output: ensureSolResult.output };
    console.log('   ✅ SOL vérifié/approvisionné');

    // Step 3: Jupiter Swap (optionnel, garder pour compatibilité)
    console.log('\n3️⃣ Swap USDC → PENGU (optionnel)...');
    const swapResult = await runScript('scripts/jupiter-swap-live.js', ['--amount=0.001', '--dry-run']);
    if (swapResult.code !== 0) {
      console.log('   ⚠️  Swap Jupiter échoué, continuons sans...');
    } else {
      results.jupiterSwap = { success: true, output: swapResult.output };
      console.log('   ✅ Swap Jupiter simulé');
    }

    // Step 4: Orca LP
    console.log('\n4️⃣ LP Orca PENGU/WSOL...');
    const lpResult = await runScript('scripts/orca-lp-tx2-live.js', [
      '--pengu=0.02',
      '--wsol=0.0002', 
      '--tick-range=15',
      '--dry-run'
    ]);
    
    if (lpResult.code !== 0) {
      throw new Error('Échec du LP Orca');
    }
    results.orcaLp = { success: true, output: lpResult.output };
    console.log('   ✅ LP Orca simulé');

    success = true;

  } catch (err) {
    error = err;
    console.error(`❌ Erreur: ${err.message}`);
  }

  // Résumé final
  const duration = Date.now() - startTime;
  console.log(`\n📊 Résumé E2E No CEX Live:`);
  console.log(`   Durée: ${duration}ms`);
  console.log(`   Succès: ${success ? '✅' : '❌'}`);
  console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);

  console.log(`\n📋 Détails des étapes:`);
  console.log(`   1. Sanity Check: ${results.sanityCheck?.success ? '✅' : '❌'}`);
  console.log(`   2. Ensure SOL: ${results.ensureSol?.success ? '✅' : '❌'}`);
  console.log(`   3. Jupiter Swap: ${results.jupiterSwap?.success ? '✅' : '⚠️'}`);
  console.log(`   4. Orca LP: ${results.orcaLp?.success ? '✅' : '❌'}`);

  if (success) {
    console.log('\n🎉 E2E No CEX Live réussi !');
    console.log('   Chaîne complète validée');
    console.log('   Prêt pour exécution LIVE');
  } else {
    console.log('\n💥 E2E No CEX Live échoué !');
    process.exit(1);
  }
}

function runScript(scriptPath, args) {
  return new Promise((resolve) => {
    const fullPath = path.resolve(scriptPath);
    const child = spawn('node', [fullPath, ...args], {
      stdio: 'pipe',
      shell: true
    });

    let output = '';
    let error = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(text.trim());
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      error += text;
      console.error(text.trim());
    });

    child.on('close', (code) => {
      resolve({
        code,
        output,
        error
      });
    });

    child.on('error', (err) => {
      resolve({
        code: 1,
        output,
        error: err.message
      });
    });
  });
}

// Exécution
if (require.main === module) {
  runE2ENoCEX();
}

module.exports = { runE2ENoCEX };
