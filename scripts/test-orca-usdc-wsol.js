#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');

console.log('🏊 Test Orca USDC/WSOL (validation système)...');

dotenv.config();

async function testOrcaUsdcWsol() {
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
    const wsolMint = new PublicKey(process.env.SOL_WSOL_MINT);
    
    const usdcAta = await getAssociatedTokenAddress(usdcMint, keypair.publicKey);
    const wsolAta = await getAssociatedTokenAddress(wsolMint, keypair.publicKey);
    
    let usdcBalance = 0;
    let wsolBalance = 0;
    
    try {
      const usdcAccount = await getAccount(solanaConnection, usdcAta);
      usdcBalance = Number(usdcAccount.amount);
    } catch (e) {
      console.log('   USDC ATA non trouvé');
    }
    
    try {
      const wsolAccount = await getAccount(solanaConnection, wsolAta);
      wsolBalance = Number(wsolAccount.amount);
    } catch (e) {
      console.log('   WSOL ATA non trouvé');
    }
    
    console.log(`   SOL: ${solBalance / 1e9}`);
    console.log(`   USDC: ${usdcBalance / 1e6}`);
    console.log(`   WSOL: ${wsolBalance / 1e9}`);
    
    // 3. Test de résolution du pool USDC/WSOL
    console.log('\n3️⃣ Test de résolution du pool USDC/WSOL...');
    
    const orcaWhirlpoolsProgram = new PublicKey(process.env.ORCA_WHIRLPOOLS_PROGRAM);
    console.log(`   Orca Program: ${orcaWhirlpoolsProgram.toBase58()}`);
    
    const usdcWsolPoolId = process.env.ORCA_USDC_WSOL_POOL;
    if (usdcWsolPoolId) {
      console.log(`   Pool USDC/WSOL configuré: ${usdcWsolPoolId}`);
      
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
        const pool = await client.getPool(new PublicKey(usdcWsolPoolId));
        
        console.log('   ✅ Pool récupéré avec succès !');
        console.log(`   Token A: ${pool.getData().tokenMintA.toBase58()}`);
        console.log(`   Token B: ${pool.getData().tokenMintB.toBase58()}`);
        console.log(`   Tick Spacing: ${pool.getData().tickSpacing}`);
        console.log(`   Current Tick: ${pool.getData().tickCurrentIndex}`);
        
        // Vérifier si c'est bien USDC/WSOL
        const isUsdcWsol = (pool.getData().tokenMintA.toBase58() === usdcMint.toBase58() && 
                           pool.getData().tokenMintB.toBase58() === wsolMint.toBase58()) ||
                          (pool.getData().tokenMintB.toBase58() === usdcMint.toBase58() && 
                           pool.getData().tokenMintA.toBase58() === wsolMint.toBase58());
        
        if (isUsdcWsol) {
          console.log('   ✅ Pool USDC/WSOL confirmé !');
          
          // Test des montants pour LP
          console.log('\n4️⃣ Test des montants pour LP...');
          
          const minUsdcForLP = 0.001; // 0.001 USDC minimum
          const minWsolForLP = 0.0001; // 0.0001 WSOL minimum
          
          const hasEnoughUsdc = usdcBalance >= minUsdcForLP * 1e6;
          const hasEnoughWsol = wsolBalance >= minWsolForLP * 1e9;
          
          console.log(`   Montants minimums pour LP:`);
          console.log(`   - USDC: ${minUsdcForLP} (${hasEnoughUsdc ? '✅' : '❌'})`);
          console.log(`   - WSOL: ${minWsolForLP} (${hasEnoughWsol ? '✅' : '❌'})`);
          
          if (hasEnoughUsdc && hasEnoughWsol) {
            console.log('   ✅ Fonds suffisants pour LP USDC/WSOL');
            
            // Calculer les montants pour LP (50% de chaque)
            const usdcAmount = Math.floor(usdcBalance * 0.5);
            const wsolAmount = Math.floor(wsolBalance * 0.5);
            
            console.log(`   Montants proposés pour LP:`);
            console.log(`   - USDC: ${usdcAmount / 1e6} (50% du balance)`);
            console.log(`   - WSOL: ${wsolAmount / 1e9} (50% du balance)`);
            
            console.log('\n✅ Système Orca validé !');
            console.log('   Le pool USDC/WSOL fonctionne correctement');
            console.log('   Prochaine étape: Trouver un pool PENGU/WSOL valide');
            
          } else {
            console.log('   ❌ Fonds insuffisants pour LP USDC/WSOL');
            console.log('   Mais le système Orca fonctionne !');
          }
          
        } else {
          console.log('   ⚠️  Pool trouvé mais pas USDC/WSOL');
          console.log(`   Attendu: USDC (${usdcMint.toBase58()}) / WSOL (${wsolMint.toBase58()})`);
          console.log(`   Trouvé: ${pool.getData().tokenMintA.toBase58()} / ${pool.getData().tokenMintB.toBase58()}`);
        }
        
      } catch (error) {
        console.log('   ❌ Erreur lors de la récupération du pool:');
        console.log(`   ${error.message}`);
        
        if (error.message.includes('Account does not exist')) {
          console.log('   💡 Le pool ID n\'existe pas sur Solana');
        }
      }
      
    } else {
      console.log('   ❌ Aucun pool USDC/WSOL configuré');
    }
    
    console.log('\n✅ Test Orca USDC/WSOL terminé !');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

testOrcaUsdcWsol();
