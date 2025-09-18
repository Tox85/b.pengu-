#!/usr/bin/env node

const fs = require('fs');

console.log('🔧 Correction du fichier .env...');

try {
  let content = fs.readFileSync('.env', 'utf8');
  
  // Remplacer les adresses manquantes
  content = content.replace(
    'BASE_ROUTER_V2_OR_V3=0x...',
    'BASE_ROUTER_V2_OR_V3=0x4752ba5dbc23f44d87826276bf6fd6b1e372ad4b'
  );
  
  // Ajouter SOLANA_KEYPAIR_PATH si manquant
  if (!content.includes('SOLANA_KEYPAIR_PATH')) {
    content += '\nSOLANA_KEYPAIR_PATH=C:\\Users\\amine\\.config\\solana\\keypair.json';
  }
  
  fs.writeFileSync('.env', content);
  
  console.log('✅ Fichier .env corrigé');
  console.log('   BASE_ROUTER_V2_OR_V3: 0x4752ba5dbc23f44d87826276bf6fd6b1e372ad4b');
  console.log('   SOLANA_KEYPAIR_PATH: Ajouté');
  
} catch (error) {
  console.error('❌ Erreur:', error.message);
}
