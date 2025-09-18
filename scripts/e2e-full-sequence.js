#!/usr/bin/env node

const dotenv = require('dotenv');
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 E2E Full Sequence: Bridge → Swap → LP...');

dotenv.config();

async function runScript(scriptName, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔄 ${description}...`);
    console.log(`   Script: ${scriptName}`);
    
    const child = spawn('node', [scriptName], {
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

async function e2eFullSequence() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  let currentStep = 0;
  const totalSteps = 3;
  
  try {
    console.log('⚠️ ATTENTION: Séquence E2E complète activée !');
    console.log('   Bridge: Base → Solana (USDC)');
    console.log('   Swap: USDC → WSOL (Jupiter)');
    console.log('   LP: USDC/WSOL (Orca)');
    console.log('   Sécurité: Caps activés');
    
    // 1. Bridge Li.Fi
    currentStep = 1;
    console.log(`\n📊 Étape ${currentStep}/${totalSteps}`);
    await runScript('bridge-lifi-live.js', 'Bridge Li.Fi Base → Solana');
    
    // Attendre un peu pour que la transaction soit propagée
    console.log('\n⏳ Attente de la propagation de la transaction...');
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 secondes
    
    // 2. Swap Jupiter
    currentStep = 2;
    console.log(`\n📊 Étape ${currentStep}/${totalSteps}`);
    await runScript('jupiter-swap-live.js', 'Swap Jupiter USDC → WSOL');
    
    // 3. LP Orca
    currentStep = 3;
    console.log(`\n📊 Étape ${currentStep}/${totalSteps}`);
    await runScript('orca-lp-live.js', 'LP Orca USDC/WSOL');
    
    success = true;
    
  } catch (err) {
    error = err;
    console.error(`\n❌ Erreur à l'étape ${currentStep}/${totalSteps}:`, err.message);
  } finally {
    const duration = Date.now() - startTime;
    console.log('\n📊 Résumé de la séquence E2E:');
    console.log(`   Durée totale: ${Math.floor(duration / 1000)}s`);
    console.log(`   Succès: ${success ? '✅' : '❌'}`);
    console.log(`   Étape atteinte: ${currentStep}/${totalSteps}`);
    console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
    
    if (success) {
      console.log('\n🎉 Séquence E2E complète réussie !');
      console.log('   Bridge: Base → Solana ✅');
      console.log('   Swap: USDC → WSOL ✅');
      console.log('   LP: USDC/WSOL ✅');
    } else {
      console.log('\n💥 Séquence E2E échouée !');
      console.log(`   Arrêt à l'étape ${currentStep}/${totalSteps}`);
      console.log('   Vérifiez les logs et la configuration');
    }
  }
}

e2eFullSequence();
