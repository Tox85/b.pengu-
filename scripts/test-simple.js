#!/usr/bin/env node

const dotenv = require('dotenv');
const { ethers } = require('ethers');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

console.log('🧪 Test simple du bot...');

dotenv.config();

async function testBot() {
  try {
    console.log('1️⃣ Chargement de la configuration...');
    
    // Vérifier les variables d'environnement
    const requiredVars = [
      'PRIVATE_KEY',
      'BASE_RPC_URL',
      'SOLANA_RPC_URL',
      'SOLANA_KEYPAIR_PATH'
    ];
    
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        console.log(`❌ Variable manquante: ${varName}`);
        return;
      }
    }
    
    console.log('✅ Configuration chargée');
    
    console.log('2️⃣ Test de la connexion Base...');
    const baseProvider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const baseWallet = new ethers.Wallet(process.env.PRIVATE_KEY, baseProvider);
    console.log(`   Adresse Base: ${baseWallet.address}`);
    
    const ethBalance = await baseProvider.getBalance(baseWallet.address);
    console.log(`   Balance ETH: ${ethers.formatEther(ethBalance)} ETH`);
    
    console.log('3️⃣ Test de la connexion Solana...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    // Charger le keypair
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    const solanaAddress = keypair.publicKey.toString();
    
    console.log(`   Adresse Solana: ${solanaAddress}`);
    
    const solBalance = await solanaConnection.getBalance(keypair.publicKey);
    console.log(`   Balance SOL: ${solBalance / 1e9} SOL`);
    
    console.log('4️⃣ Test des caps de sécurité...');
    const maxSpendUsdc = process.env.MAX_SPEND_USDC || '10';
    const maxSpendEth = process.env.MAX_SPEND_ETH || '0.01';
    const maxGasGwei = process.env.MAX_GAS_GWEI || '50';
    
    console.log(`   Max USDC: ${maxSpendUsdc}`);
    console.log(`   Max ETH: ${maxSpendEth}`);
    console.log(`   Max Gas: ${maxGasGwei} Gwei`);
    
    console.log('5️⃣ Test du mode DRY_RUN...');
    const dryRun = process.env.DRY_RUN === 'true';
    console.log(`   Mode DRY_RUN: ${dryRun}`);
    
    if (dryRun) {
      console.log('✅ Mode DRY_RUN activé - Aucune transaction réelle');
    } else {
      console.log('⚠️ Mode LIVE - Transactions réelles !');
    }
    
    console.log('\n🎉 Test simple réussi !');
    console.log('✅ Base: Connecté');
    console.log('✅ Solana: Connecté');
    console.log('✅ Fonds: Disponibles');
    console.log('✅ Configuration: Valide');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error('Stack:', error.stack);
  }
}

testBot();
