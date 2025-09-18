#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');

console.log('🐧 Test Orca PENGU/WSOL avec pool forcé...');

dotenv.config();

// Forcer la variable d'environnement
process.env.ORCA_PENGU_WSOL_POOL = 'FAqh648xeeaTqL7du49sztp9nfj5PjRQrfvaMccyd9cz';

async function testPenguPoolForce() {
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    console.log(`   Pool PENGU/WSOL: ${process.env.ORCA_PENGU_WSOL_POOL}`);
    
    // 2. Vérification des fonds
    console.log('\n2️⃣ Vérification des fonds...');
    const solBalance = await solanaConnection.getBalance(keypair.publicKey);
    
    const penguMint = new PublicKey(process.env.SOL_PENGU_MINT);
    const wsolMint = new PublicKey(process.env.SOL_WSOL_MINT);
    
    const penguAta = await getAssociatedTokenAddress(penguMint, keypair.publicKey);
    const wsolAta = await getAssociatedTokenAddress(wsolMint, keypair.publicKey);
    
    let penguBalance = 0;
    let wsolBalance = 0;
    
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
    console.log(`   PENGU: ${penguBalance / 1e6}`);
    console.log(`   WSOL: ${wsolBalance / 1e9}`);
    
    // 3. Test de résolution du pool
    console.log('\n3️⃣ Test de résolution du pool...');
    
    const orcaWhirlpoolsProgram = new PublicKey(process.env.ORCA_WHIRLPOOLS_PROGRAM);
    console.log(`   Orca Program: ${orcaWhirlpoolsProgram.toBase58()}`);
    
    try {
      // Test de récupération du pool
      const { WhirlpoolContext, buildWhirlpoolClient } = require('@orca-so/whirlpools-sdk');
      
      const ctx = WhirlpoolContext.from(
        orcaWhirlpoolsProgram,
        solanaConnection,
        keypair
      );
      
      const client = buildWhirlpoolClient(ctx);
      
      console.log('   Tentative de récupération du pool...');
      const pool = await client.getPool(new PublicKey(process.env.ORCA_PENGU_WSOL_POOL));
      
      console.log('   ✅ Pool récupéré avec succès !');
      console.log(`   Token A: ${pool.getData().tokenMintA.toBase58()}`);
      console.log(`   Token B: ${pool.getData().tokenMintB.toBase58()}`);
      console.log(`   Tick Spacing: ${pool.getData().tickSpacing}`);
      console.log(`   Current Tick: ${pool.getData().tickCurrentIndex}`);
      
      // Vérifier si c'est bien PENGU/WSOL
      const isPenguWsol = (pool.getData().tokenMintA.toBase58() === penguMint.toBase58() && 
                          pool.getData().tokenMintB.toBase58() === wsolMint.toBase58()) ||
                         (pool.getData().tokenMintB.toBase58() === penguMint.toBase58() && 
                          pool.getData().tokenMintA.toBase58() === wsolMint.toBase58());
      
      if (isPenguWsol) {
        console.log('   ✅ Pool PENGU/WSOL confirmé !');
        
        // Test des montants pour LP
        console.log('\n4️⃣ Test des montants pour LP...');
        
        const minPenguForLP = 0.001; // 0.001 PENGU minimum
        const minWsolForLP = 0.0001; // 0.0001 WSOL minimum
        
        const hasEnoughPengu = penguBalance >= minPenguForLP * 1e6;
        const hasEnoughWsol = wsolBalance >= minWsolForLP * 1e9;
        
        console.log(`   Montants minimums pour LP:`);
        console.log(`   - PENGU: ${minPenguForLP} (${hasEnoughPengu ? '✅' : '❌'})`);
        console.log(`   - WSOL: ${minWsolForLP} (${hasEnoughWsol ? '✅' : '❌'})`);
        
        if (hasEnoughPengu && hasEnoughWsol) {
          console.log('   ✅ Fonds suffisants pour LP PENGU/WSOL');
          
          // Calculer les montants pour LP (50% de chaque)
          const penguAmount = Math.floor(penguBalance * 0.5);
          const wsolAmount = Math.floor(wsolBalance * 0.5);
          
          console.log(`   Montants proposés pour LP:`);
          console.log(`   - PENGU: ${penguAmount / 1e6} (50% du balance)`);
          console.log(`   - WSOL: ${wsolAmount / 1e9} (50% du balance)`);
          
          console.log('\n✅ Prêt pour le LP PENGU/WSOL !');
          console.log('   Prochaine étape: Tester avec orca-lp-pengu-wsol.js');
          
        } else {
          console.log('   ❌ Fonds insuffisants pour LP PENGU/WSOL');
        }
        
      } else {
        console.log('   ⚠️  Pool trouvé mais pas PENGU/WSOL');
        console.log(`   Attendu: PENGU (${penguMint.toBase58()}) / WSOL (${wsolMint.toBase58()})`);
        console.log(`   Trouvé: ${pool.getData().tokenMintA.toBase58()} / ${pool.getData().tokenMintB.toBase58()}`);
      }
      
    } catch (error) {
      console.log('   ❌ Erreur lors de la récupération du pool:');
      console.log(`   ${error.message}`);
      
      if (error.message.includes('Account does not exist')) {
        console.log('   💡 Le pool ID n\'existe pas sur Solana');
        console.log('   Actions recommandées:');
        console.log('   1. Vérifier l\'ID du pool sur Orca Explorer');
        console.log('   2. Utiliser un pool ID valide');
      }
    }
    
    console.log('\n✅ Test Orca PENGU/WSOL terminé !');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

testPenguPoolForce();
