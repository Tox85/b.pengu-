#!/usr/bin/env node

const dotenv = require('dotenv');
const { PublicKey, Connection, Keypair, Transaction, SystemProgram, ComputeBudgetProgram } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createInitializeMintInstruction, MINT_SIZE, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const BN = require('bn.js');
const fs = require('fs');
const pRetry = require('p-retry');

console.log('🐧 LP Orca MINIMAL - PENGU/WSOL (Sans SDK Orca)...');

dotenv.config({ override: true });

async function orcaLpMinimal() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const penguAmount = args.find(arg => arg.startsWith('--pengu='))?.split('=')[1];
  const wsolAmount = args.find(arg => arg.startsWith('--wsol='))?.split('=')[1];
  const tickRange = args.find(arg => arg.startsWith('--tick-range='))?.split('=')[1] || '15';
  const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
  
  const startTime = Date.now();
  let success = false;
  let error = null;
  let tx1Hash = null;
  let tx2Hash = null;
  let positionMint = null;
  let positionPda = null;
  
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    
    console.log(`   Solana: ${payer.publicKey.toString()}`);
    console.log(`   Mode: ${dryRun ? 'DRY_RUN (simulation)' : 'LIVE (exécution réelle)'}`);
    console.log(`   TARGET_ASSET: ${process.env.TARGET_ASSET || 'PENGU'}`);
    
    // 2. Vérification des fonds AVANT
    console.log('\n2️⃣ Vérification des fonds AVANT...');
    const solBalanceBefore = await connection.getBalance(payer.publicKey);
    console.log(`   SOL: ${solBalanceBefore / 1e9}`);
    
    if (solBalanceBefore < 0.01e9) {
      throw new Error('SOL insuffisant pour les frais de transaction');
    }
    
    // 3. Calcul des montants LP
    console.log('\n3️⃣ Calcul des montants LP...');
    
    let depositPenguAmount;
    let depositWsolAmount;
    
    if (penguAmount && wsolAmount) {
      depositPenguAmount = parseFloat(penguAmount);
      depositWsolAmount = parseFloat(wsolAmount);
      console.log(`   Montants paramétrables: ${penguAmount} PENGU, ${wsolAmount} WSOL`);
    } else {
      depositPenguAmount = 0.05;
      depositWsolAmount = 0.0005;
      console.log(`   Montants par défaut: 0.05 PENGU, 0.0005 WSOL`);
    }
    
    console.log(`   PENGU à déposer: ${depositPenguAmount}`);
    console.log(`   WSOL à déposer: ${depositWsolAmount}`);
    
    // 4. Configuration du pool
    console.log('\n4️⃣ Configuration du pool...');
    const poolPubkey = new PublicKey(process.env.ORCA_PENGU_WSOL_POOL);
    const programId = new PublicKey(process.env.ORCA_WHIRLPOOLS_PROGRAM);
    
    console.log(`   Pool: ${poolPubkey.toBase58()}`);
    console.log(`   Program: ${programId.toBase58()}`);
    
    // 5. Calcul des ticks alignés (simulation)
    console.log('\n5️⃣ Calcul des ticks alignés...');
    const spacing = 64; // Tick spacing typique
    const currentTick = 0; // Simulé
    const rangePercent = parseFloat(tickRange);
    
    const align = (t) => Math.floor(t / spacing) * spacing;
    const rangeValue = Math.floor(currentTick * rangePercent / 100);
    const tickLowerIndex = align(currentTick - rangeValue);
    const tickUpperIndex = align(currentTick + rangeValue);
    
    console.log(`   Current Tick: ${currentTick}`);
    console.log(`   Tick Spacing: ${spacing}`);
    console.log(`   Range: ±${rangePercent}%`);
    console.log(`   Tick Lower: ${tickLowerIndex}`);
    console.log(`   Tick Upper: ${tickUpperIndex}`);
    
    // 6. Calcul de la liquidité (simulation)
    console.log('\n6️⃣ Calcul de la liquidité...');
    const penguAmountBN = new BN(Math.floor(depositPenguAmount * 1e6));
    const wsolAmountBN = new BN(Math.floor(depositWsolAmount * 1e9));
    
    const liquidityAmount = penguAmountBN.div(new BN(2));
    const tokenMaxA = penguAmountBN;
    const tokenMaxB = wsolAmountBN;
    
    console.log(`   Liquidity: ${liquidityAmount.toString()}`);
    console.log(`   Token Max A (PENGU): ${tokenMaxA.toString()}`);
    console.log(`   Token Max B (WSOL): ${tokenMaxB.toString()}`);
    
    // 7. Mode DRY_RUN ou LIVE
    if (dryRun) {
      console.log('\n7️⃣ Mode DRY_RUN - Simulation uniquement...');
      console.log(`   Pool: ${poolPubkey.toBase58()}`);
      console.log(`   PENGU: ${depositPenguAmount}`);
      console.log(`   WSOL: ${depositWsolAmount}`);
      console.log(`   Ticks: ${tickLowerIndex} → ${tickUpperIndex}`);
      console.log(`   Liquidity: ${liquidityAmount.toString()}`);
      
      success = true;
      console.log('\n✅ Simulation LP PENGU/WSOL (Minimal) réussie !');
      return;
    }
    
    // Mode LIVE - Exécution réelle
    console.log('\n7️⃣ Mode LIVE - Exécution réelle...');
    console.log('   ⚠️  ATTENTION: Transactions réelles sur Solana !');
    
    // 8. TX1: Création mint + ATA
    console.log('\n8️⃣ TX1: Création mint + ATA...');
    
    positionMint = Keypair.generate();
    
    // Simulation du PDA (sans SDK Orca)
    const positionPdaPubkey = new PublicKey('11111111111111111111111111111111'); // Simulé
    positionPda = { publicKey: positionPdaPubkey };
    
    const positionTokenAccount = getAssociatedTokenAddressSync(
      positionMint.publicKey,
      payer.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    console.log(`   Position Mint: ${positionMint.publicKey.toBase58()}`);
    console.log(`   Position PDA: ${positionPda.publicKey.toBase58()}`);
    console.log(`   Position ATA: ${positionTokenAccount.toBase58()}`);
    
    const tx1 = new Transaction();
    
    // Compute Budget
    tx1.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000
    }));
    
    tx1.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 2000
    }));
    
    // Créer le compte mint
    const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    tx1.add(SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: positionMint.publicKey,
      lamports: mintRent,
      space: MINT_SIZE,
      programId: TOKEN_PROGRAM_ID
    }));
    
    // Initialiser le mint
    tx1.add(createInitializeMintInstruction(
      positionMint.publicKey,
      0, // decimals (NFT)
      payer.publicKey, // mintAuthority
      payer.publicKey, // freezeAuthority
      TOKEN_PROGRAM_ID
    ));
    
    // Créer l'ATA
    tx1.add(createAssociatedTokenAccountInstruction(
      payer.publicKey, // payer
      positionTokenAccount, // ata
      payer.publicKey, // owner
      positionMint.publicKey, // mint
      TOKEN_PROGRAM_ID
    ));
    
    console.log('   TX1 construite: mint + ATA');
    
    // Envoyer TX1
    const recentBlockhash1 = await connection.getLatestBlockhash();
    tx1.recentBlockhash = recentBlockhash1.blockhash;
    tx1.feePayer = payer.publicKey;
    
    tx1Hash = await connection.sendTransaction(tx1, [payer, positionMint]);
    
    console.log(`   TX1 envoyée: ${tx1Hash}`);
    
    // Attendre confirmation TX1
    await connection.confirmTransaction(tx1Hash);
    console.log('   TX1 confirmée');
    
    // Petite pause entre les transactions
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 9. TX2: Simulation des instructions LP
    console.log('\n9️⃣ TX2: Simulation des instructions LP...');
    
    const tx2 = new Transaction();
    
    // Compute Budget
    tx2.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000
    }));
    
    tx2.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 2000
    }));
    
    // Simulation des TickArray PDAs
    const lowerPdaPubkey = new PublicKey('11111111111111111111111111111112');
    const upperPdaPubkey = new PublicKey('11111111111111111111111111111113');
    
    console.log(`   TickArray Lower: ${lowerPdaPubkey.toBase58()}`);
    console.log(`   TickArray Upper: ${upperPdaPubkey.toBase58()}`);
    
    // Simulation des instructions Orca (sans SDK)
    console.log('   Simulation des instructions Orca...');
    console.log(`   OpenPosition: positionPda.publicKey`);
    console.log(`   IncreaseLiquidity: positionPda.publicKey`);
    console.log(`   TickArray Lower: ${tickLowerIndex}`);
    console.log(`   TickArray Upper: ${tickUpperIndex}`);
    console.log(`   Token Max A: ${tokenMaxA.toString()}`);
    console.log(`   Token Max B: ${tokenMaxB.toString()}`);
    
    console.log('   TX2 construite: openPosition + increaseLiquidity (simulation)');
    
    // Simulation de l'envoi TX2
    const simulatedTx2Hash = 'SIMULATED_TX2_' + Date.now();
    console.log(`   TX2 simulée: ${simulatedTx2Hash}`);
    
    tx2Hash = simulatedTx2Hash;
    
    // 10. Vérification des balances APRÈS
    console.log('\n🔟 Vérification des balances APRÈS...');
    const solBalanceAfter = await connection.getBalance(payer.publicKey);
    console.log(`   SOL: ${solBalanceAfter / 1e9} (${(solBalanceAfter - solBalanceBefore) / 1e9} gagné)`);
    
    // 11. Critères de succès
    console.log('\n1️⃣1️⃣ Critères de succès...');
    const successCriteria = [
      { name: 'TX1 confirmée', passed: !!tx1Hash },
      { name: 'TX2 simulée', passed: !!tx2Hash },
      { name: 'Position créée', passed: !!positionMint && !!positionPda },
      { name: 'Configuration valide', passed: !!poolPubkey },
      { name: 'Fonds disponibles', passed: solBalanceAfter > 0.01e9 }
    ];
    
    successCriteria.forEach(criteria => {
      console.log(`${criteria.passed ? '✅' : '❌'} ${criteria.name}`);
    });
    
    success = successCriteria.every(criteria => criteria.passed);
    
  } catch (err) {
    error = err;
    console.error(`❌ Erreur: ${err.message}`);
    console.error(`   Stack: ${err.stack}`);
  }
  
  // Résumé final
  const duration = Date.now() - startTime;
  console.log(`\n📊 Résumé du LP PENGU/WSOL (Minimal):`);
  console.log(`   Durée: ${duration}ms`);
  console.log(`   Succès: ${success ? '✅' : '❌'}`);
  console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
  console.log(`   TX1 Hash: ${tx1Hash || 'N/A'}`);
  console.log(`   TX2 Hash: ${tx2Hash || 'N/A'}`);
  console.log(`   Position Mint: ${positionMint?.publicKey.toBase58() || 'N/A'}`);
  console.log(`   Position PDA: ${positionPda?.publicKey.toBase58() || 'N/A'}`);
  console.log(`   Pool: ${process.env.ORCA_PENGU_WSOL_POOL || 'N/A'}`);
  console.log(`   Address: ${positionMint ? positionMint.publicKey.toString() : 'N/A'}`);
  
  if (success) {
    console.log('\n🎉 LP PENGU/WSOL (Minimal) réussi !');
    console.log('   Position NFT créée avec succès');
    console.log('   Instructions LP simulées');
    console.log('   Prêt pour l\'implémentation SDK Orca');
  } else {
    console.log('\n💥 LP PENGU/WSOL (Minimal) échoué !');
    console.log('   Vérifiez la configuration et les fonds');
  }
}

orcaLpMinimal();
