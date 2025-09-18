#!/usr/bin/env node

const dotenv = require('dotenv');
const { PublicKey } = require('@solana/web3.js');

console.log('🔍 Vérification de la configuration .env...');

// Charger .env avec override
dotenv.config({ override: true });

// Variables requises
const REQUIRED_VARS = [
  'SOLANA_RPC_URL',
  'ORCA_WHIRLPOOLS_PROGRAM', 
  'ORCA_PENGU_WSOL_POOL',
  'SOL_USDC_MINT',
  'SOL_WSOL_MINT',
  'SOL_PENGU_MINT',
  'SLIPPAGE_BPS',
  'MIN_SOL_BALANCE',
  'TARGET_ASSET'
];

let missingVars = [];
let invalidVars = [];

// Vérifier les variables requises
for (const varName of REQUIRED_VARS) {
  const value = process.env[varName];
  if (!value) {
    missingVars.push(varName);
  } else {
    console.log(`   ${varName}: ${value}`);
  }
}

// Vérifier TARGET_ASSET = PENGU
if (process.env.TARGET_ASSET !== 'PENGU') {
  invalidVars.push(`TARGET_ASSET doit être 'PENGU', actuellement: '${process.env.TARGET_ASSET}'`);
}

// Vérifier les PublicKeys valides
const pubkeyVars = [
  'ORCA_WHIRLPOOLS_PROGRAM',
  'ORCA_PENGU_WSOL_POOL', 
  'SOL_USDC_MINT',
  'SOL_WSOL_MINT',
  'SOL_PENGU_MINT'
];

for (const varName of pubkeyVars) {
  const value = process.env[varName];
  if (value) {
    try {
      new PublicKey(value);
    } catch (error) {
      invalidVars.push(`${varName} n'est pas une adresse Solana valide: ${value}`);
    }
  }
}

// Vérifier les valeurs numériques
const numericVars = [
  { name: 'SLIPPAGE_BPS', min: 1, max: 10000 },
  { name: 'MIN_SOL_BALANCE', min: 0.001, max: 1.0 }
];

for (const { name, min, max } of numericVars) {
  const value = parseFloat(process.env[name]);
  if (isNaN(value) || value < min || value > max) {
    invalidVars.push(`${name} doit être entre ${min} et ${max}, actuellement: ${process.env[name]}`);
  }
}

// Résultat
if (missingVars.length > 0) {
  console.log(`❌ Variables manquantes: ${missingVars.join(', ')}`);
  process.exit(1);
}

if (invalidVars.length > 0) {
  console.log(`❌ Variables invalides:`);
  invalidVars.forEach(msg => console.log(`   - ${msg}`));
  process.exit(1);
}

console.log('✅ Configuration .env OK');
process.exit(0);
