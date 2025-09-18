#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');

console.log('🐧 Validation du pool PENGU/WSOL (forcé)...');

dotenv.config();

// Forcer la variable d'environnement
process.env.ORCA_PENGU_WSOL_POOL = 'FAqh648xeeaTqL7du49sztp9nfj5PjRQrfvaMccyd9cz';

async function testPenguPoolForceValidation() {
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    console.log(`   Pool ID: ${process.env.ORCA_PENGU_WSOL_POOL}`);
    
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
    
    // 3. Test de validation du pool
    console.log('\n3️⃣ Test de validation du pool...');
    
    try {
      // Test de récupération du compte du pool
      console.log('   Tentative de récupération du compte du pool...');
      const poolAccount = await solanaConnection.getAccountInfo(new PublicKey(process.env.ORCA_PENGU_WSOL_POOL));
      
      if (poolAccount) {
        console.log('   ✅ Compte du pool trouvé sur Solana');
        console.log(`   Owner: ${poolAccount.owner.toBase58()}`);
        console.log(`   Executable: ${poolAccount.executable}`);
        console.log(`   Lamports: ${poolAccount.lamports}`);
        console.log(`   Data Length: ${poolAccount.data.length}`);
        
        // Vérifier si c'est bien un compte Orca Whirlpool
        const orcaProgram = new PublicKey(process.env.ORCA_WHIRLPOOLS_PROGRAM);
        if (poolAccount.owner.equals(orcaProgram)) {
          console.log('   ✅ Pool appartenant au programme Orca Whirlpools');
          
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
            
            console.log('\n✅ Pool PENGU/WSOL validé !');
            console.log('   Le pool existe et est accessible');
            console.log('   Fonds suffisants pour le LP');
            console.log('   Prochaine étape: Tester le LP en mode DRY_RUN');
            
          } else {
            console.log('   ❌ Fonds insuffisants pour LP PENGU/WSOL');
            console.log('   Mais le pool est valide !');
          }
          
        } else {
          console.log('   ❌ Pool n\'appartient pas au programme Orca Whirlpools');
          console.log(`   Owner attendu: ${orcaProgram.toBase58()}`);
          console.log(`   Owner trouvé: ${poolAccount.owner.toBase58()}`);
        }
        
      } else {
        console.log('   ❌ Compte du pool non trouvé sur Solana');
        console.log('   Le pool ID n\'existe pas ou est invalide');
      }
      
    } catch (error) {
      console.log('   ❌ Erreur lors de la récupération du compte du pool:');
      console.log(`   ${error.message}`);
    }
    
    console.log('\n✅ Validation du pool PENGU/WSOL terminée !');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

testPenguPoolForceValidation();
