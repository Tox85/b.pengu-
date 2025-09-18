#!/usr/bin/env node

const { PublicKey } = require('@solana/web3.js');

console.log('🔍 Validation de l\'adresse Solana...');

const addresses = [
  'DXnHR9bo6TLwb95xQixLJExU69G584qCRuencMRdLfgE', // Nouvelle adresse
  '2UgejyYnpZrNRC9DtqpHBCuGkiKoSdaMP9VuFzqmhiJE', // Ancienne adresse
];

for (const address of addresses) {
  try {
    const pubkey = new PublicKey(address);
    console.log(`✅ ${address} - VALIDE`);
    console.log(`   Longueur: ${address.length} caractères`);
    console.log(`   Base58: ${pubkey.toString()}`);
  } catch (error) {
    console.log(`❌ ${address} - INVALIDE`);
    console.log(`   Erreur: ${error.message}`);
  }
}

console.log('\n💡 Utilisez la nouvelle adresse valide pour déposer des fonds !');
