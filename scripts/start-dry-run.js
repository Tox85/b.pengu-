#!/usr/bin/env node

/**
 * Script de lancement en mode DRY-RUN
 * Simule les transactions sans les envoyer sur le réseau
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Lancement du bot PENGU en mode DRY-RUN');
console.log('📋 Configuration:');
console.log('  - ENABLE_CEX=false (pas d\'APIs CEX)');
console.log('  - DRY_RUN=true (simulation uniquement)');
console.log('  - Montants réduits pour tests');
console.log('');

// Variables d'environnement pour le mode DRY-RUN
const env = {
  ...process.env,
  ENABLE_CEX: 'false',
  DRY_RUN: 'true',
  ENABLE_EX_ORCHESTRATOR: 'false',
  ENABLE_IDEMPOTENCY: 'false',
  ENABLE_CIRCUIT_BREAKER: 'false',
  MIN_USDC_BALANCE: '2',
  LP_POSITION_SIZE_USDC: '5',
  TOTAL_WALLETS: '5',
  LOG_LEVEL: 'info',
};

// Lancer le bot
const botProcess = spawn('node', ['dist/src/main.js'], {
  env,
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});

botProcess.on('close', (code) => {
  console.log(`\n✅ Bot arrêté avec le code: ${code}`);
  process.exit(code);
});

botProcess.on('error', (err) => {
  console.error('❌ Erreur lors du lancement du bot:', err);
  process.exit(1);
});

// Gestion des signaux d'arrêt
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt du bot...');
  botProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Arrêt du bot...');
  botProcess.kill('SIGTERM');
});
