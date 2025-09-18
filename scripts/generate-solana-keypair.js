#!/usr/bin/env node

const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

console.log('🔑 Génération d\'un keypair Solana...');

// Générer un nouveau keypair
const keypair = Keypair.generate();

console.log(`✅ Keypair généré:`);
console.log(`   Adresse publique: ${keypair.publicKey.toString()}`);
console.log(`   Clé privée (base64): ${Buffer.from(keypair.secretKey).toString('base64')}`);

// Créer le dossier .config/solana s'il n'existe pas
const homeDir = process.env.HOME || process.env.USERPROFILE;
const configDir = path.join(homeDir, '.config', 'solana');
const keypairPath = path.join(configDir, 'keypair.json');

if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
  console.log(`📁 Dossier créé: ${configDir}`);
}

// Sauvegarder le keypair au format JSON
fs.writeFileSync(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));
console.log(`💾 Keypair sauvegardé: ${keypairPath}`);

// Afficher les variables d'environnement à ajouter
console.log('\n📝 Ajoutez ces lignes à votre fichier .env:');
console.log(`SOLANA_KEYPAIR_PATH=${keypairPath}`);
console.log(`# ou`);
console.log(`SOLANA_PRIVATE_KEY_B64=${Buffer.from(keypair.secretKey).toString('base64')}`);

console.log('\n🎯 Prochaines étapes:');
console.log('1. Déposez 0.02-0.05 SOL sur cette adresse:');
console.log(`   ${keypair.publicKey.toString()}`);
console.log('2. Ajoutez les variables d\'environnement à votre .env');
console.log('3. Lancez: npm run e2e:bridge:dry');
