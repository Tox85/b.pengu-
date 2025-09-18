#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

console.log('🔍 Vérification Solana simple...');

dotenv.config();

async function checkSolana() {
  try {
    // Charger le keypair
    const keypairPath = process.env.SOLANA_KEYPAIR_PATH;
    console.log(`📁 Chemin keypair: ${keypairPath}`);
    
    if (!keypairPath || !fs.existsSync(keypairPath)) {
      console.log('❌ Fichier keypair non trouvé');
      return;
    }
    
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    const address = keypair.publicKey.toString();
    
    console.log(`✅ Adresse Solana: ${address}`);
    console.log(`   Longueur: ${address.length} caractères`);
    
    // Vérifier la validité
    try {
      new PublicKey(address);
      console.log('✅ Adresse valide');
    } catch (error) {
      console.log('❌ Adresse invalide:', error.message);
      return;
    }
    
    // Connexion Solana
    const connection = new Connection(process.env.SOLANA_RPC_URL);
    console.log(`🌐 Connexion: ${process.env.SOLANA_RPC_URL}`);
    
    // Balance SOL
    const balance = await connection.getBalance(keypair.publicKey);
    const solBalance = balance / 1e9;
    console.log(`💰 Balance SOL: ${solBalance} SOL`);
    
    if (solBalance > 0) {
      console.log('✅ Fonds SOL disponibles !');
    } else {
      console.log('⚠️ Aucun SOL - déposez 0.02-0.05 SOL');
      console.log(`   Adresse: ${address}`);
    }
    
    // Test de l'adresse sur différents formats
    console.log('\n📋 Formats d\'adresse:');
    console.log(`   Base58: ${address}`);
    console.log(`   Hex: ${Buffer.from(keypair.publicKey.toBytes()).toString('hex')}`);
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

checkSolana();
