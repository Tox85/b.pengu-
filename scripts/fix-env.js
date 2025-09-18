#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧹 Nettoyage du fichier .env...');

function fixEnvFile() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    
    if (!fs.existsSync(envPath)) {
      console.log('❌ Fichier .env non trouvé');
      return false;
    }
    
    // Lire le fichier .env
    let content = fs.readFileSync(envPath, 'utf8');
    
    // Supprimer BOM et normaliser les fins de ligne
    content = content.replace(/^\uFEFF/, ''); // Supprimer BOM
    content = content.replace(/\r\n/g, '\n'); // Normaliser CRLF vers LF
    content = content.replace(/\r/g, '\n'); // Normaliser CR vers LF
    
    // Supprimer les lignes vides et les doublons
    const lines = content.split('\n');
    const seen = new Set();
    const cleanedLines = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const key = trimmed.split('=')[0];
        if (!seen.has(key)) {
          seen.add(key);
          cleanedLines.push(line);
        }
      } else if (trimmed.startsWith('#') || trimmed === '') {
        cleanedLines.push(line);
      }
    }
    
    // Vérifier les clés requises
    const requiredKeys = [
      'TARGET_ASSET=PENGU',
      'SOL_PENGU_MINT=2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
      'SOL_WSOL_MINT=So11111111111111111111111111111111111111112',
      'ORCA_WHIRLPOOLS_PROGRAM=whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
      'ORCA_PENGU_WSOL_POOL=FAqh648xeeaTqL7du49sztp9nfj5PjRQrfvaMccyd9cz'
    ];
    
    const missingKeys = [];
    for (const required of requiredKeys) {
      const key = required.split('=')[0];
      if (!seen.has(key)) {
        missingKeys.push(required);
      }
    }
    
    // Ajouter les clés manquantes
    if (missingKeys.length > 0) {
      console.log('   Ajout des clés manquantes...');
      cleanedLines.push('');
      cleanedLines.push('# Clés PENGU requises');
      cleanedLines.push(...missingKeys);
    }
    
    // Écrire le fichier nettoyé
    const cleanedContent = cleanedLines.join('\n');
    fs.writeFileSync(envPath, cleanedContent, 'utf8');
    
    console.log('✅ .env nettoyé (pas de NULLs, fins de ligne LF).');
    
    // Vérifier que dotenv peut lire le fichier
    try {
      require('dotenv').config({ override: true });
      console.log('✅ dotenv peut lire le fichier.');
      
      // Afficher les clés importantes
      console.log(`TARGET_ASSET = ${process.env.TARGET_ASSET}`);
      console.log(`SOL_PENGU_MINT = ${process.env.SOL_PENGU_MINT}`);
      console.log(`SOL_WSOL_MINT = ${process.env.SOL_WSOL_MINT}`);
      console.log(`ORCA_WHIRLPOOLS_PROGRAM = ${process.env.ORCA_WHIRLPOOLS_PROGRAM}`);
      console.log(`ORCA_PENGU_WSOL_POOL = ${process.env.ORCA_PENGU_WSOL_POOL || 'Non défini (découverte auto)'}`);
      
    } catch (err) {
      console.log('❌ Erreur lors de la lecture avec dotenv:', err.message);
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return false;
  }
}

if (fixEnvFile()) {
  console.log('✅ Nettoyage .env terminé avec succès !');
} else {
  console.log('❌ Échec du nettoyage .env');
  process.exit(1);
}