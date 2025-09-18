#!/usr/bin/env node

const dotenv = require('dotenv');
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 E2E Swap + LP Sequence: Jupiter → Orca...');

dotenv.config();

async function runScript(scriptName, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔄 ${description}...`);
    console.log(`   Script: ${scriptName}`);
    
    const [script, ...args] = scriptName.split(' ');
    const child = spawn('node', [script, ...args], {
      cwd: __dirname,
      stdio: 'inherit'
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${description} terminé avec succès`);
        resolve();
      } else {
        console.log(`❌ ${description} échoué avec le code ${code}`);
        reject(new Error(`${description} échoué`));
      }
    });
    
    child.on('error', (error) => {
      console.log(`❌ Erreur lors de l'exécution de ${description}:`, error.message);
      reject(error);
    });
  });
}

async function e2eSwapLp() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  let currentStep = 0;
  const totalSteps = 2;
  
  try {
    console.log('⚠️ ATTENTION: Séquence E2E Swap + LP activée !');
    console.log('   Swap: USDC → WSOL (Jupiter)');
    console.log('   LP: USDC/WSOL (Orca)');
    console.log('   Sécurité: Caps activés');
    
    // 1. Swap Jupiter
    currentStep = 1;
    console.log(`\n📊 Étape ${currentStep}/${totalSteps}`);
    const targetAsset = process.env.TARGET_ASSET || 'WSOL';
    await runScript(`jupiter-swap-live.js --usdc=0.01 --wrap=false`, `Swap Jupiter USDC → ${targetAsset}`);
    
    // Attendre un peu pour que la transaction soit propagée
    console.log('\n⏳ Attente de la propagation de la transaction...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5 secondes
    
    // 1.5. Fallback wrap SOL → WSOL si nécessaire
    console.log('\n📊 Étape 1.5: Vérification WSOL...');
    try {
      await runScript('wrap-sol.js --sol=0.001', 'Fallback wrap SOL → WSOL');
    } catch (e) {
      console.log('   Fallback wrap non nécessaire ou échoué');
    }
    
    // 2. LP Orca
    currentStep = 2;
    console.log(`\n📊 Étape ${currentStep}/${totalSteps}`);
    await runScript(`orca-lp-live-simple.js --usdc=0.005 --wsol=0.0005 --tick-range=15 --slippageBps=50`, `LP Orca USDC/${targetAsset}`);
    
    success = true;
    
  } catch (err) {
    error = err;
    console.error(`\n❌ Erreur à l'étape ${currentStep}/${totalSteps}:`, err.message);
  } finally {
    const duration = Date.now() - startTime;
    console.log('\n📊 Résumé de la séquence E2E Swap + LP:');
    console.log(`   Durée totale: ${Math.floor(duration / 1000)}s`);
    console.log(`   Succès: ${success ? '✅' : '❌'}`);
    console.log(`   Étape atteinte: ${currentStep}/${totalSteps}`);
    console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
    
    if (success) {
      console.log('\n🎉 Séquence E2E Swap + LP réussie !');
      console.log('   Swap: USDC → WSOL ✅');
      console.log('   LP: USDC/WSOL ✅');
    } else {
      console.log('\n💥 Séquence E2E Swap + LP échouée !');
      console.log(`   Arrêt à l'étape ${currentStep}/${totalSteps}`);
      console.log('   Vérifiez les logs et la configuration');
    }
  }
}

e2eSwapLp();
