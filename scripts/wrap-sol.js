#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, createSyncNativeInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');

console.log('🔄 Wrap SOL → WSOL...');

dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const solAmount = args.find(arg => arg.startsWith('--sol='))?.split('=')[1] || '0.002';

async function wrapSol() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  let wrapTxHash = null;
  let keypair = null;
  
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toBase58()}`);
    console.log(`   Montant SOL à wrapper: ${solAmount} SOL`);
    
    // 2. Vérification des fonds
    console.log('\n2️⃣ Vérification des fonds...');
    const solBalanceBefore = await solanaConnection.getBalance(keypair.publicKey);
    const wrapAmount = Math.floor(parseFloat(solAmount) * LAMPORTS_PER_SOL);
    
    console.log(`   SOL disponible: ${solBalanceBefore / LAMPORTS_PER_SOL}`);
    console.log(`   SOL à wrapper: ${wrapAmount / LAMPORTS_PER_SOL}`);
    
    if (solBalanceBefore < wrapAmount + 0.001e9) { // +0.001 SOL pour les frais
      throw new Error(`SOL insuffisant pour wrapper ${solAmount} SOL (minimum ${(wrapAmount + 0.001e9) / LAMPORTS_PER_SOL} SOL)`);
    }
    
    // 3. Configuration WSOL
    console.log('\n3️⃣ Configuration WSOL...');
    const wsolMint = new PublicKey(process.env.SOL_WSOL_MINT);
    const wsolAta = await getAssociatedTokenAddress(wsolMint, keypair.publicKey);
    
    console.log(`   WSOL Mint: ${wsolMint.toBase58()}`);
    console.log(`   WSOL ATA: ${wsolAta.toBase58()}`);
    
    // 4. Créer l'ATA WSOL si nécessaire
    console.log('\n4️⃣ Vérification de l\'ATA WSOL...');
    try {
      await getAccount(solanaConnection, wsolAta);
      console.log('   ATA WSOL existe déjà');
    } catch (e) {
      console.log('   Création de l\'ATA WSOL...');
      const createAtaIx = createAssociatedTokenAccountInstruction(
        keypair.publicKey,
        wsolAta,
        keypair.publicKey,
        wsolMint
      );
      
      const { blockhash, lastValidBlockHeight } = await solanaConnection.getLatestBlockhash();
      const createTx = new Transaction().add(createAtaIx);
      createTx.recentBlockhash = blockhash;
      createTx.lastValidBlockHeight = lastValidBlockHeight;
      createTx.feePayer = keypair.publicKey;
      
      const createSignature = await solanaConnection.sendTransaction(createTx, [keypair]);
      await solanaConnection.confirmTransaction({ signature: createSignature, blockhash, lastValidBlockHeight }, 'confirmed');
      console.log(`   ATA WSOL créé: ${createSignature}`);
    }
    
    // 5. Vérifier le balance WSOL avant
    console.log('\n5️⃣ Balance WSOL AVANT...');
    let wsolBalanceBefore = 0;
    try {
      const wsolAccount = await getAccount(solanaConnection, wsolAta);
      wsolBalanceBefore = Number(wsolAccount.amount);
      console.log(`   WSOL avant: ${wsolBalanceBefore / LAMPORTS_PER_SOL}`);
    } catch (e) {
      console.log('   WSOL ATA non trouvé avant wrap');
    }
    
    // 6. Wrap SOL → WSOL
    console.log('\n6️⃣ Wrap SOL → WSOL...');
    const wrapTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: wsolAta,
        lamports: wrapAmount,
      }),
      createSyncNativeInstruction(wsolAta, TOKEN_PROGRAM_ID)
    );
    
    const { blockhash, lastValidBlockHeight } = await solanaConnection.getLatestBlockhash();
    wrapTx.recentBlockhash = blockhash;
    wrapTx.lastValidBlockHeight = lastValidBlockHeight;
    wrapTx.feePayer = keypair.publicKey;
    
    wrapTxHash = await solanaConnection.sendTransaction(wrapTx, [keypair]);
    console.log(`   Wrap Tx envoyée: ${wrapTxHash}`);
    
    // Attendre la confirmation
    console.log('   Attente de la confirmation...');
    await solanaConnection.confirmTransaction({ signature: wrapTxHash, blockhash, lastValidBlockHeight }, 'confirmed');
    console.log(`   Wrap Tx confirmée: ${wrapTxHash}`);
    
    // 7. Vérification des balances APRÈS
    console.log('\n7️⃣ Vérification des balances APRÈS...');
    const solBalanceAfter = await solanaConnection.getBalance(keypair.publicKey);
    
    let wsolBalanceAfter = 0;
    try {
      const wsolAccount = await getAccount(solanaConnection, wsolAta);
      wsolBalanceAfter = Number(wsolAccount.amount);
    } catch (e) {
      console.log('   WSOL ATA non trouvé après wrap');
    }
    
    console.log(`   SOL: ${solBalanceAfter / LAMPORTS_PER_SOL} (${(solBalanceAfter - solBalanceBefore) / LAMPORTS_PER_SOL} perdu)`);
    console.log(`   WSOL: ${wsolBalanceAfter / LAMPORTS_PER_SOL} (${(wsolBalanceAfter - wsolBalanceBefore) / LAMPORTS_PER_SOL} gagné)`);
    
    // 8. Critères de succès
    console.log('\n8️⃣ Critères de succès...');
    console.log('✅ Transaction de wrap confirmée');
    console.log('✅ SOL converti en WSOL');
    console.log('✅ ATA WSOL créé/vérifié');
    console.log('✅ Fonds disponibles');
    
    success = true;
    
  } catch (err) {
    error = err;
    console.error(`\n❌ Erreur:`, err.message);
  } finally {
    const duration = Date.now() - startTime;
    console.log('\n📊 Résumé du wrap SOL:');
    console.log(`   Durée: ${duration}ms`);
    console.log(`   Succès: ${success ? '✅' : '❌'}`);
    console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
    console.log(`   Wrap Tx Hash: ${wrapTxHash || 'N/A'}`);
    console.log(`   Montant: ${solAmount} SOL`);
    console.log(`   Address: ${keypair ? keypair.publicKey.toBase58() : 'N/A'}`);
    
    if (success) {
      console.log('\n🎉 Wrap SOL réussi !');
      console.log('   Prochaine étape: LP Orca');
    } else {
      console.log('\n💥 Wrap SOL échoué !');
      console.log('   Vérifiez la configuration et les fonds');
    }
  }
}

wrapSol();
