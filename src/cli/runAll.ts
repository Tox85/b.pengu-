#!/usr/bin/env ts-node

/**
 * CLI principal pour exécuter le bot PENGU
 * Supporte tous les modes : DRY_RUN, SIGN_ONLY, Production
 */

import { env, ENABLE_CEX, DRY_RUN, SIGN_ONLY } from '../config/env';
import { main } from '../main';

async function runAll() {
  console.log('🚀 PENGU Bot - CLI Principal');
  console.log('============================');
  console.log('Configuration:');
  console.log(`  ENABLE_CEX: ${ENABLE_CEX}`);
  console.log(`  DRY_RUN: ${DRY_RUN}`);
  console.log(`  SIGN_ONLY: ${SIGN_ONLY}`);
  console.log(`  NODE_ENV: ${env.NODE_ENV}`);
  console.log('============================\n');

  try {
    await main();
  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  }
}

// Gestion des signaux pour arrêt propre
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt demandé par l\'utilisateur');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Arrêt demandé par le système');
  process.exit(0);
});

// Exécution
runAll().catch(console.error);
