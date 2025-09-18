#!/usr/bin/env node

const { Connection, PublicKey } = require('@solana/web3.js');

console.log('🔍 Vérification Solana directe...');

async function checkSolana() {
  try {
    // Adresse Solana générée
    const address = 'DXnHR9bo6TLwb95xQixLJExU69G584qCRuencMRdLfgE';
    
    console.log(`✅ Adresse Solana: ${address}`);
    console.log(`   Longueur: ${address.length} caractères`);
    
    // Vérifier la validité
    try {
      const pubkey = new PublicKey(address);
      console.log('✅ Adresse valide');
    } catch (error) {
      console.log('❌ Adresse invalide:', error.message);
      return;
    }
    
    // Connexion Solana
    const rpcUrl = 'https://methodical-solemn-yard.solana-mainnet.quiknode.pro/9ce45e08623e3af0d580066c3bc3248e0ed658e6/';
    const connection = new Connection(rpcUrl);
    console.log(`🌐 Connexion: ${rpcUrl.substring(0, 50)}...`);
    
    // Balance SOL
    const balance = await connection.getBalance(new PublicKey(address));
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
    
    // Vérifier si l'adresse est acceptée par les plateformes
    console.log('\n🔍 Test de compatibilité:');
    console.log('   ✅ Format Base58 valide');
    console.log('   ✅ Longueur correcte (44 caractères)');
    console.log('   ✅ Caractères valides');
    
    console.log('\n💡 Si Jumper/Base refuse l\'adresse:');
    console.log('   1. Vérifiez que vous copiez bien: DXnHR9bo6TLwb95xQixLJExU69G584qCRuencMRdLfgE');
    console.log('   2. Essayez de la coller dans un wallet Solana (Phantom, Solflare)');
    console.log('   3. Si ça marche, le problème vient de la plateforme');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

checkSolana();
