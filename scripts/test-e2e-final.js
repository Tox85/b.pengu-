#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🐧 Test E2E Final - Validation complète de la chaîne');

async function testE2EFinal() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  let results = {
    sanityCheck: null,
    ensureSol: null,
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

    // Step 2: Ensure SOL (DRY_RUN)
    console.log('\n2️⃣ Vérification SOL (DRY_RUN)...');
    const ensureSolResult = await runScript('scripts/ensure-sol.js', ['--dry-run']);
    if (ensureSolResult.code !== 0) {
      throw new Error('Échec de la vérification SOL');
    }
    results.ensureSol = { success: true, output: ensureSolResult.output };
    console.log('   ✅ SOL vérifié (DRY_RUN)');

    // Step 3: Orca LP (DRY_RUN)
    console.log('\n3️⃣ LP Orca PENGU/WSOL (DRY_RUN)...');
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
    console.log('   ✅ LP Orca simulé (DRY_RUN)');

    success = true;

  } catch (err) {
    error = err;
    console.error(`❌ Erreur: ${err.message}`);
  }

  // Résumé final
  const duration = Date.now() - startTime;
  console.log(`\n📊 Résumé Test E2E Final:`);
  console.log(`   Durée: ${duration}ms`);
  console.log(`   Succès: ${success ? '✅' : '❌'}`);
  console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);

  console.log(`\n📋 Détails des étapes:`);
  console.log(`   1. Sanity Check: ${results.sanityCheck?.success ? '✅' : '❌'}`);
  console.log(`   2. Ensure SOL: ${results.ensureSol?.success ? '✅' : '❌'}`);
  console.log(`   3. Orca LP: ${results.orcaLp?.success ? '✅' : '❌'}`);

  if (success) {
    console.log('\n🎉 Test E2E Final réussi !');
    console.log('   Chaîne E2E complète validée');
    console.log('   Tous les composants fonctionnent');
    console.log('   Prêt pour exécution LIVE');
  } else {
    console.log('\n💥 Test E2E Final échoué !');
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
  testE2EFinal();
}

module.exports = { testE2EFinal };
