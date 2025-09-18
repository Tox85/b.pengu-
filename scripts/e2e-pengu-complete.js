#!/usr/bin/env node

const dotenv = require('dotenv');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Séquence E2E complète PENGU...');

dotenv.config();

async function e2ePenguComplete() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  let results = {
    bridge: null,
    swap: null,
    lp: null
  };
  
  try {
    console.log('\n🎯 Séquence E2E PENGU complète');
    console.log('   Bridge Base → Solana (USDC)');
    console.log('   Swap USDC → PENGU (Jupiter)');
    console.log('   LP PENGU/WSOL (Orca)');
    console.log(`   Mode: ${process.env.DRY_RUN === 'true' ? 'DRY_RUN' : 'LIVE'}`);
    
    // 1. Bridge Base → Solana (USDC)
    console.log('\n1️⃣ Bridge Base → Solana (USDC)...');
    
    try {
      console.log('   Exécution du bridge Li.Fi...');
      const bridgeResult = await runScript('scripts/bridge-lifi-live.js', ['--amount=0.5']);
      
      if (bridgeResult.success) {
        console.log('   ✅ Bridge réussi');
        console.log(`   Tx Hash: ${bridgeResult.txHash}`);
        results.bridge = bridgeResult;
      } else {
        throw new Error(`Bridge échoué: ${bridgeResult.error}`);
      }
    } catch (err) {
      console.log('   ⚠️  Bridge échoué, utilisation des fonds existants');
      console.log(`   Erreur: ${err.message}`);
      results.bridge = { success: false, error: err.message };
    }
    
    // Petite pause entre les étapes
    await sleep(2000);
    
    // 2. Swap USDC → PENGU (Jupiter)
    console.log('\n2️⃣ Swap USDC → PENGU (Jupiter)...');
    
    try {
      console.log('   Exécution du swap Jupiter...');
      const swapResult = await runScript('scripts/jupiter-swap-live.js', ['--amount=0.001']);
      
      if (swapResult.success) {
        console.log('   ✅ Swap PENGU réussi');
        console.log(`   Tx Hash: ${swapResult.txHash}`);
        results.swap = swapResult;
      } else {
        throw new Error(`Swap échoué: ${swapResult.error}`);
      }
    } catch (err) {
      console.log('   ❌ Swap PENGU échoué');
      console.log(`   Erreur: ${err.message}`);
      results.swap = { success: false, error: err.message };
      throw err;
    }
    
    // Petite pause entre les étapes
    await sleep(2000);
    
    // 3. LP PENGU/WSOL (Orca)
    console.log('\n3️⃣ LP PENGU/WSOL (Orca)...');
    
    try {
      console.log('   Exécution du LP Orca...');
      const lpResult = await runScript('scripts/pengu-lp-live.js', ['--pengu=0.05', '--wsol=0.0005', '--tick-range=15']);
      
      if (lpResult.success) {
        console.log('   ✅ LP PENGU/WSOL réussi');
        console.log(`   Tx Hash: ${lpResult.txHash}`);
        results.lp = lpResult;
      } else {
        console.log('   ⚠️  LP PENGU/WSOL échoué (simulation)');
        console.log(`   Erreur: ${lpResult.error}`);
        results.lp = { success: false, error: lpResult.error };
      }
    } catch (err) {
      console.log('   ❌ LP PENGU/WSOL échoué');
      console.log(`   Erreur: ${err.message}`);
      results.lp = { success: false, error: err.message };
    }
    
    // 4. Résumé final
    console.log('\n4️⃣ Résumé de la séquence E2E...');
    
    const bridgeStatus = results.bridge?.success ? '✅' : '❌';
    const swapStatus = results.swap?.success ? '✅' : '❌';
    const lpStatus = results.lp?.success ? '✅' : '❌';
    
    console.log(`   Bridge Base → Solana: ${bridgeStatus}`);
    console.log(`   Swap USDC → PENGU: ${swapStatus}`);
    console.log(`   LP PENGU/WSOL: ${lpStatus}`);
    
    // Critères de succès
    const successCriteria = [
      { name: 'Bridge réussi', passed: results.bridge?.success },
      { name: 'Swap PENGU réussi', passed: results.swap?.success },
      { name: 'LP PENGU/WSOL réussi', passed: results.lp?.success },
      { name: 'Séquence complète', passed: results.swap?.success } // Au minimum le swap doit réussir
    ];
    
    console.log('\n   Critères de succès:');
    successCriteria.forEach(criteria => {
      console.log(`   ${criteria.passed ? '✅' : '❌'} ${criteria.name}`);
    });
    
    success = successCriteria.every(criteria => criteria.passed);
    
  } catch (err) {
    error = err;
    console.error(`❌ Erreur séquence E2E: ${err.message}`);
  }
  
  // Résumé final
  const duration = Date.now() - startTime;
  console.log(`\n📊 Résumé de la séquence E2E PENGU:`);
  console.log(`   Durée: ${duration}ms`);
  console.log(`   Succès: ${success ? '✅' : '❌'}`);
  console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
  console.log(`   Bridge: ${results.bridge?.success ? '✅' : '❌'}`);
  console.log(`   Swap: ${results.swap?.success ? '✅' : '❌'}`);
  console.log(`   LP: ${results.lp?.success ? '✅' : '❌'}`);
  
  if (success) {
    console.log('\n🎉 Séquence E2E PENGU complète réussie !');
    console.log('   Toutes les étapes ont été exécutées avec succès');
  } else {
    console.log('\n💥 Séquence E2E PENGU incomplète !');
    console.log('   Certaines étapes ont échoué');
  }
  
  return { success, error, results, duration };
}

// Fonction utilitaire pour exécuter un script
function runScript(scriptPath, args = []) {
  return new Promise((resolve) => {
    console.log(`   Exécution: node ${scriptPath} ${args.join(' ')}`);
    
    const child = spawn('node', [scriptPath, ...args], {
      stdio: 'pipe',
      cwd: process.cwd()
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      const success = code === 0;
      const output = stdout + stderr;
      
      // Extraire le hash de transaction si disponible
      const txHashMatch = output.match(/(?:Tx|Hash|Signature):\s*([A-Za-z0-9]{40,})/);
      const txHash = txHashMatch ? txHashMatch[1] : null;
      
      resolve({
        success,
        code,
        output,
        txHash,
        error: success ? null : stderr
      });
    });
    
    child.on('error', (err) => {
      resolve({
        success: false,
        code: -1,
        output: '',
        txHash: null,
        error: err.message
      });
    });
  });
}

// Fonction utilitaire pour attendre
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

e2ePenguComplete();
