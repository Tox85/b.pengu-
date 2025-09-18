#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');
const axios = require('axios');

console.log('🐧 Test LP PENGU/WSOL avec Orca...');

dotenv.config();

async function testPenguLP() {
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    
    // 2. Vérification des fonds
    console.log('\n2️⃣ Vérification des fonds...');
    const solBalance = await solanaConnection.getBalance(keypair.publicKey);
    
    const usdcMint = new PublicKey(process.env.SOL_USDC_MINT);
    const penguMint = new PublicKey(process.env.SOL_PENGU_MINT);
    const wsolMint = new PublicKey(process.env.SOL_WSOL_MINT);
    
    const usdcAta = await getAssociatedTokenAddress(usdcMint, keypair.publicKey);
    const penguAta = await getAssociatedTokenAddress(penguMint, keypair.publicKey);
    const wsolAta = await getAssociatedTokenAddress(wsolMint, keypair.publicKey);
    
    let usdcBalance = 0;
    let penguBalance = 0;
    let wsolBalance = 0;
    
    try {
      const usdcAccount = await getAccount(solanaConnection, usdcAta);
      usdcBalance = Number(usdcAccount.amount);
    } catch (e) {
      console.log('   USDC ATA non trouvé');
    }
    
    try {
      const penguAccount = await getAccount(solanaConnection, penguAta);
      penguBalance = Number(penguAccount.amount);
    } catch (e) {
      console.log('   PENGU ATA non trouvé');
    }
    
    try {
      const wsolAccount = await getAccount(solanaConnection, wsolAta);
      wsolBalance = Number(wsolAccount.amount);
    } catch (e) {
      console.log('   WSOL ATA non trouvé');
    }
    
    console.log(`   SOL: ${solBalance / 1e9}`);
    console.log(`   USDC: ${usdcBalance / 1e6}`);
    console.log(`   PENGU: ${penguBalance / 1e6}`);
    console.log(`   WSOL: ${wsolBalance / 1e9}`);
    
    // 3. Test de résolution du pool PENGU/WSOL
    console.log('\n3️⃣ Test de résolution du pool PENGU/WSOL...');
    
    // Configuration Orca
    const orcaWhirlpoolsProgram = new PublicKey(process.env.ORCA_WHIRLPOOLS_PROGRAM);
    console.log(`   Orca Program: ${orcaWhirlpoolsProgram.toBase58()}`);
    
    // Vérifier si un pool PENGU/WSOL est configuré
    const penguWsolPoolId = process.env.ORCA_PENGU_WSOL_POOL;
    if (penguWsolPoolId) {
      console.log(`   Pool PENGU/WSOL configuré: ${penguWsolPoolId}`);
    } else {
      console.log('   Aucun pool PENGU/WSOL configuré dans .env');
      console.log('   Recherche automatique via Orca SDK...');
    }
    
    // 4. Test des montants pour LP
    console.log('\n4️⃣ Test des montants pour LP...');
    
    const minUsdcForLP = 0.001; // 0.001 USDC minimum
    const minWsolForLP = 0.0001; // 0.0001 WSOL minimum
    const minPenguForLP = 0.001; // 0.001 PENGU minimum
    
    console.log(`   Montants minimums pour LP:`);
    console.log(`   - USDC: ${minUsdcForLP}`);
    console.log(`   - WSOL: ${minWsolForLP}`);
    console.log(`   - PENGU: ${minPenguForLP}`);
    
    // Vérifier si on a assez de fonds pour LP PENGU/WSOL
    const hasEnoughPengu = penguBalance >= minPenguForLP * 1e6;
    const hasEnoughWsol = wsolBalance >= minWsolForLP * 1e9;
    
    console.log(`\n   Fonds disponibles pour LP PENGU/WSOL:`);
    console.log(`   - PENGU: ${penguBalance / 1e6} (${hasEnoughPengu ? '✅' : '❌'})`);
    console.log(`   - WSOL: ${wsolBalance / 1e9} (${hasEnoughWsol ? '✅' : '❌'})`);
    
    if (hasEnoughPengu && hasEnoughWsol) {
      console.log('   ✅ Fonds suffisants pour LP PENGU/WSOL');
      
      // Calculer les montants pour LP (50% de chaque)
      const penguAmount = Math.floor(penguBalance * 0.5);
      const wsolAmount = Math.floor(wsolBalance * 0.5);
      
      console.log(`   Montants proposés pour LP:`);
      console.log(`   - PENGU: ${penguAmount / 1e6} (50% du balance)`);
      console.log(`   - WSOL: ${wsolAmount / 1e9} (50% du balance)`);
      
    } else {
      console.log('   ❌ Fonds insuffisants pour LP PENGU/WSOL');
      console.log('   Suggestions:');
      if (!hasEnoughPengu) {
        console.log('   - Acheter plus de PENGU via Jupiter');
      }
      if (!hasEnoughWsol) {
        console.log('   - Acheter plus de WSOL via Jupiter ou wrap SOL');
      }
    }
    
    // 5. Test de résolution du pool via Orca SDK
    console.log('\n5️⃣ Test de résolution du pool via Orca SDK...');
    
    try {
      // Importer les modules Orca
      const { WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID } = require('@orca-so/whirlpools-sdk');
      
      // Créer le contexte Orca
      const ctx = WhirlpoolContext.from(
        orcaWhirlpoolsProgram,
        solanaConnection,
        keypair
      );
      
      const client = buildWhirlpoolClient(ctx);
      
      // Essayer de trouver un pool PENGU/WSOL
      console.log('   Recherche de pools PENGU/WSOL...');
      
      // Note: Cette partie nécessiterait une implémentation plus complète
      // pour rechercher les pools disponibles via l'API Orca
      console.log('   (Recherche de pools via Orca SDK - implémentation à compléter)');
      
    } catch (error) {
      console.log('   ❌ Erreur lors de la résolution du pool Orca:');
      console.log(`   ${error.message}`);
    }
    
    // 6. Recommandations
    console.log('\n6️⃣ Recommandations...');
    
    if (penguWsolPoolId) {
      console.log('   ✅ Pool PENGU/WSOL configuré dans .env');
      console.log('   Prochaine étape: Tester le LP avec orca-lp-live-simple.js');
    } else {
      console.log('   ⚠️  Aucun pool PENGU/WSOL configuré');
      console.log('   Actions recommandées:');
      console.log('   1. Identifier le pool PENGU/WSOL sur Orca');
      console.log('   2. Ajouter ORCA_PENGU_WSOL_POOL=<pool_id> dans .env');
      console.log('   3. Tester le LP avec orca-lp-live-simple.js');
    }
    
    console.log('\n✅ Test LP PENGU terminé !');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

testPenguLP();
