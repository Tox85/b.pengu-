#!/usr/bin/env node

/**
 * Script de démarrage en mode simulation
 * DRY_RUN=true et ENABLE_CEX=false
 */

// Configuration des variables d'environnement pour la simulation
process.env.DRY_RUN = 'true';
process.env.SIGN_ONLY = 'true';
process.env.ENABLE_CEX = 'false';
process.env.QUIET_TEST = 'true';

// Import du bot principal
const { PenguBot } = require('../dist/src/main');

async function startSimulation() {
  console.log('🚀 Démarrage du mode simulation...');
  console.log('📋 Configuration:');
  console.log('  - DRY_RUN=true (pas d\'appels API externes)');
  console.log('  - SIGN_ONLY=true (simulation RPC sans broadcast)');
  console.log('  - ENABLE_CEX=false (pas d\'accès aux exchanges)');
  console.log('  - QUIET_TEST=true (logs réduits)');
  console.log('');

  try {
    const bot = new PenguBot();
    await bot.start();
    
    // Laisser le bot tourner pendant 30 secondes pour les tests
    console.log('⏱️  Simulation en cours... (30 secondes)');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    await bot.stop();
    console.log('✅ Simulation terminée avec succès');
    
  } catch (error) {
    console.error('❌ Erreur lors de la simulation:', error);
    process.exit(1);
  }
}

// Gestion des signaux d'arrêt
process.on('SIGINT', async () => {
  console.log('\n🛑 Arrêt de la simulation...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Arrêt de la simulation...');
  process.exit(0);
});

// Démarrer la simulation
startSimulation().catch(console.error);