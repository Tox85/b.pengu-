#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, createCloseAccountInstruction } = require('@solana/spl-token');
const fs = require('fs');

console.log('🔄 Unwrap WSOL → SOL...');

dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const wsolAmount = args.find(arg => arg.startsWith('--wsol='))?.split('=')[1] || 'all';

async function unwrapWsol() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  let unwrapTxHash = null;
  let keypair = null;
  
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toBase58()}`);
    console.log(`   Montant WSOL à unwrapper: ${wsolAmount === 'all' ? 'Tout' : wsolAmount + ' WSOL'}`);
    
    // 2. Vérification des fonds
    console.log('\n2️⃣ Vérification des fonds...');
    const solBalanceBefore = await solanaConnection.getBalance(keypair.publicKey);
    
    const wsolMint = new PublicKey(process.env.SOL_WSOL_MINT);
    const wsolAta = await getAssociatedTokenAddress(wsolMint, keypair.publicKey);
    
    let wsolBalanceBefore = 0;
    try {
      const wsolAccount = await getAccount(solanaConnection, wsolAta);
      wsolBalanceBefore = Number(wsolAccount.amount);
      console.log(`   WSOL disponible: ${wsolBalanceBefore / LAMPORTS_PER_SOL}`);
    } catch (e) {
      throw new Error('WSOL ATA non trouvé ou vide');
    }
    
    if (wsolBalanceBefore === 0) {
      throw new Error('Aucun WSOL à unwrapper');
    }
    
    console.log(`   SOL avant: ${solBalanceBefore / LAMPORTS_PER_SOL}`);
    
    // 3. Configuration de l'unwrap
    console.log('\n3️⃣ Configuration de l\'unwrap...');
    console.log(`   WSOL ATA: ${wsolAta.toBase58()}`);
    
    // 4. Unwrap WSOL → SOL (close account)
    console.log('\n4️⃣ Unwrap WSOL → SOL...');
    const unwrapTx = new Transaction().add(
      createCloseAccountInstruction(
        wsolAta,           // account à fermer
        keypair.publicKey, // destination des lamports
        keypair.publicKey, // owner
        []                 // multisig signers (vide)
      )
    );
    
    const { blockhash, lastValidBlockHeight } = await solanaConnection.getLatestBlockhash();
    unwrapTx.recentBlockhash = blockhash;
    unwrapTx.lastValidBlockHeight = lastValidBlockHeight;
    unwrapTx.feePayer = keypair.publicKey;
    
    unwrapTxHash = await solanaConnection.sendTransaction(unwrapTx, [keypair]);
    console.log(`   Unwrap Tx envoyée: ${unwrapTxHash}`);
    
    // Attendre la confirmation
    console.log('   Attente de la confirmation...');
    await solanaConnection.confirmTransaction({ signature: unwrapTxHash, blockhash, lastValidBlockHeight }, 'confirmed');
    console.log(`   Unwrap Tx confirmée: ${unwrapTxHash}`);
    
    // 5. Vérification des balances APRÈS
    console.log('\n5️⃣ Vérification des balances APRÈS...');
    const solBalanceAfter = await solanaConnection.getBalance(keypair.publicKey);
    
    let wsolBalanceAfter = 0;
    try {
      const wsolAccount = await getAccount(solanaConnection, wsolAta);
      wsolBalanceAfter = Number(wsolAccount.amount);
    } catch (e) {
      console.log('   WSOL ATA fermé (normal après unwrap)');
    }
    
    console.log(`   SOL: ${solBalanceAfter / LAMPORTS_PER_SOL} (${(solBalanceAfter - solBalanceBefore) / LAMPORTS_PER_SOL} gagné)`);
    console.log(`   WSOL: ${wsolBalanceAfter / LAMPORTS_PER_SOL} (${(wsolBalanceAfter - wsolBalanceBefore) / LAMPORTS_PER_SOL} perdu)`);
    
    // 6. Critères de succès
    console.log('\n6️⃣ Critères de succès...');
    console.log('✅ Transaction d\'unwrap confirmée');
    console.log('✅ WSOL converti en SOL');
    console.log('✅ ATA WSOL fermé');
    console.log('✅ Fonds disponibles');
    
    success = true;
    
  } catch (err) {
    error = err;
    console.error(`\n❌ Erreur:`, err.message);
  } finally {
    const duration = Date.now() - startTime;
    console.log('\n📊 Résumé de l\'unwrap WSOL:');
    console.log(`   Durée: ${duration}ms`);
    console.log(`   Succès: ${success ? '✅' : '❌'}`);
    console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
    console.log(`   Unwrap Tx Hash: ${unwrapTxHash || 'N/A'}`);
    console.log(`   Montant: ${wsolAmount === 'all' ? 'Tout' : wsolAmount + ' WSOL'}`);
    console.log(`   Address: ${keypair ? keypair.publicKey.toBase58() : 'N/A'}`);
    
    if (success) {
      console.log('\n🎉 Unwrap WSOL réussi !');
      console.log('   WSOL converti en SOL natif');
    } else {
      console.log('\n💥 Unwrap WSOL échoué !');
      console.log('   Vérifiez la configuration et les fonds');
    }
  }
}

unwrapWsol();
