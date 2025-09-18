#!/usr/bin/env node

const dotenv = require('dotenv');
const { ethers } = require('ethers');

console.log('🔍 Test de configuration...');

// Charger les variables d'environnement
dotenv.config();

console.log('✅ Variables d\'environnement chargées');

// Vérifier les variables requises
const required = [
  'PRIVATE_KEY',
  'BASE_RPC_URL',
  'SOLANA_RPC_URL',
  'BASE_USDC',
  'SOL_USDC_MINT',
  'SOL_PENGU_MINT',
  'LIFI_API_KEY',
];

console.log('\n📋 Vérification des variables requises:');
for (const key of required) {
  if (process.env[key]) {
    console.log(`✅ ${key}: ${process.env[key].substring(0, 20)}...`);
  } else {
    console.log(`❌ ${key}: MANQUANT`);
  }
}

// Test de création d'un wallet
try {
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  console.log(`\n✅ Wallet EVM créé: ${wallet.address}`);
} catch (error) {
  console.log(`\n❌ Erreur création wallet: ${error.message}`);
}

// Test de la clé Li.Fi
if (process.env.LIFI_API_KEY) {
  console.log(`\n✅ Clé Li.Fi: ${process.env.LIFI_API_KEY.substring(0, 20)}...`);
} else {
  console.log(`\n❌ Clé Li.Fi manquante`);
}

console.log('\n🎯 Configuration prête pour les tests !');
