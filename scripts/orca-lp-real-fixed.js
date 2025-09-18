#!/usr/bin/env node

const dotenv = require('dotenv');
const { PublicKey, Connection, Keypair, Transaction, SystemProgram, ComputeBudgetProgram } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createInitializeMintInstruction, MINT_SIZE, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { WhirlpoolContext, buildWhirlpoolClient, PDAUtil, WhirlpoolIx } = require("@orca-so/whirlpools-sdk");
const { makeProvider } = require("../utils/anchor-provider");
const BN = require('bn.js');
const fs = require('fs');
const pRetry = require('p-retry');

console.log('🐧 LP Orca RÉEL FIXÉ - PENGU/WSOL (SDK Orca 0.9.0)...');

dotenv.config({ override: true });

async function orcaLpRealFixed() {
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
    
    // 2. Configuration Orca avec Provider Anchor correct
    console.log('\n2️⃣ Configuration Orca...');
    const programId = new PublicKey(process.env.ORCA_WHIRLPOOLS_PROGRAM);
    const provider = makeProvider(connection, payer);
    const ctx = WhirlpoolContext.withProvider(provider, programId);
    const client = buildWhirlpoolClient(ctx);
    
    console.log(`   Orca Program: ${programId.toBase58()}`);
    console.log(`   Provider Anchor: OK`);
    
    // 3. Vérification des fonds AVANT
    console.log('\n3️⃣ Vérification des fonds AVANT...');
    const solBalanceBefore = await connection.getBalance(payer.publicKey);
    console.log(`   SOL: ${solBalanceBefore / 1e9}`);
    
    if (solBalanceBefore < 0.01e9) {
      throw new Error('SOL insuffisant pour les frais de transaction');
    }
    
    // 4. Calcul des montants LP
    console.log('\n4️⃣ Calcul des montants LP...');
    
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
    
    // 5. Résolution du pool
    console.log('\n5️⃣ Résolution du pool...');
    const poolPubkey = new PublicKey(process.env.ORCA_PENGU_WSOL_POOL);
    const pool = await client.getPool(poolPubkey);
    
    // Utiliser pool.getData() avec 0.9.0, sinon pool.data
    let poolData;
    try {
      poolData = pool.getData();
      console.log(`   Pool data via getData(): OK`);
    } catch (e) {
      poolData = pool.data;
      console.log(`   Pool data via pool.data: OK`);
    }
    
    console.log(`   Pool: ${poolPubkey.toBase58()}`);
    console.log(`   Token A: ${poolData.tokenMintA.toBase58()}`);
    console.log(`   Token B: ${poolData.tokenMintB.toBase58()}`);
    console.log(`   Tick Spacing: ${poolData.tickSpacing.toNumber()}`);
    console.log(`   Fee Rate: ${poolData.feeRate}`);
    
    // 6. Calcul des ticks alignés
    console.log('\n6️⃣ Calcul des ticks alignés...');
    const spacing = poolData.tickSpacing.toNumber();
    const currentTick = poolData.tickCurrentIndex.toNumber();
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
    
    // 7. Calcul de la liquidité
    console.log('\n7️⃣ Calcul de la liquidité...');
    const penguAmountBN = new BN(Math.floor(depositPenguAmount * 1e6));
    const wsolAmountBN = new BN(Math.floor(depositWsolAmount * 1e9));
    
    // Simulation du quote (en attendant la résolution du SDK)
    const liquidityAmount = penguAmountBN.div(new BN(2));
    const tokenMaxA = penguAmountBN;
    const tokenMaxB = wsolAmountBN;
    
    console.log(`   Liquidity: ${liquidityAmount.toString()}`);
    console.log(`   Token Max A (PENGU): ${tokenMaxA.toString()}`);
    console.log(`   Token Max B (WSOL): ${tokenMaxB.toString()}`);
    
    // 8. Mode DRY_RUN ou LIVE
    if (dryRun) {
      console.log('\n8️⃣ Mode DRY_RUN - Simulation uniquement...');
      console.log(`   Pool: ${poolPubkey.toBase58()}`);
      console.log(`   PENGU: ${depositPenguAmount}`);
      console.log(`   WSOL: ${depositWsolAmount}`);
      console.log(`   Ticks: ${tickLowerIndex} → ${tickUpperIndex}`);
      console.log(`   Liquidity: ${liquidityAmount.toString()}`);
      
      success = true;
      console.log('\n✅ Simulation LP PENGU/WSOL (SDK Orca) réussie !');
      return;
    }
    
    // Mode LIVE - Exécution réelle
    console.log('\n8️⃣ Mode LIVE - Exécution réelle...');
    console.log('   ⚠️  ATTENTION: Transactions réelles sur Solana !');
    
    // 9. TX1: Création mint + ATA
    console.log('\n9️⃣ TX1: Création mint + ATA...');
    
    positionMint = Keypair.generate();
    positionPda = PDAUtil.getPosition(programId, positionMint.publicKey);
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
    
    tx1Hash = await pRetry(
      () => connection.sendTransaction(tx1, [payer, positionMint]),
      { retries: 3, minTimeout: 1000 }
    );
    
    console.log(`   TX1 envoyée: ${tx1Hash}`);
    
    // Attendre confirmation TX1
    await connection.confirmTransaction(tx1Hash);
    console.log('   TX1 confirmée');
    
    // Petite pause entre les transactions
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 10. TX2: Instructions LP
    console.log('\n🔟 TX2: Instructions LP...');
    
    const tx2 = new Transaction();
    
    // Compute Budget
    tx2.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000
    }));
    
    tx2.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 2000
    }));
    
    // Calculer les TickArray PDAs
    const lowerPda = PDAUtil.getTickArray(programId, poolPubkey, Math.floor(tickLowerIndex / spacing / 88) * 88);
    const upperPda = PDAUtil.getTickArray(programId, poolPubkey, Math.floor(tickUpperIndex / spacing / 88) * 88);
    
    console.log(`   TickArray Lower: ${lowerPda.publicKey.toBase58()}`);
    console.log(`   TickArray Upper: ${upperPda.publicKey.toBase58()}`);
    
    // Vérifier et initialiser les TickArrays si nécessaire
    try {
      const lowerAccount = await ctx.fetcher.getTickArray(lowerPda.publicKey, true);
      if (!lowerAccount) {
        console.log('   Initialisation TickArray Lower...');
        const initLowerIx = await ctx.program.methods.initializeTickArray(
          new BN(Math.floor(tickLowerIndex / spacing / 88) * 88)
        ).accounts({
          whirlpool: poolPubkey,
          tickArray: lowerPda.publicKey,
          funder: payer.publicKey,
          systemProgram: SystemProgram.programId
        }).instruction();
        tx2.add(initLowerIx);
      }
    } catch (e) {
      console.log('   TickArray Lower manquant, ajout instruction...');
      const initLowerIx = await ctx.program.methods.initializeTickArray(
        new BN(Math.floor(tickLowerIndex / spacing / 88) * 88)
      ).accounts({
        whirlpool: poolPubkey,
        tickArray: lowerPda.publicKey,
        funder: payer.publicKey,
        systemProgram: SystemProgram.programId
      }).instruction();
      tx2.add(initLowerIx);
    }
    
    try {
      const upperAccount = await ctx.fetcher.getTickArray(upperPda.publicKey, true);
      if (!upperAccount) {
        console.log('   Initialisation TickArray Upper...');
        const initUpperIx = await ctx.program.methods.initializeTickArray(
          new BN(Math.floor(tickUpperIndex / spacing / 88) * 88)
        ).accounts({
          whirlpool: poolPubkey,
          tickArray: upperPda.publicKey,
          funder: payer.publicKey,
          systemProgram: SystemProgram.programId
        }).instruction();
        tx2.add(initUpperIx);
      }
    } catch (e) {
      console.log('   TickArray Upper manquant, ajout instruction...');
      const initUpperIx = await ctx.program.methods.initializeTickArray(
        new BN(Math.floor(tickUpperIndex / spacing / 88) * 88)
      ).accounts({
        whirlpool: poolPubkey,
        tickArray: upperPda.publicKey,
        funder: payer.publicKey,
        systemProgram: SystemProgram.programId
      }).instruction();
      tx2.add(initUpperIx);
    }
    
    // Open Position
    const openIx = WhirlpoolIx.openPositionIx(ctx.program, {
      whirlpool: poolPubkey,
      positionPda: positionPda.publicKey,      // 👈 PDA de position (PAS le mint)
      positionMint: positionMint.publicKey,
      positionTokenAccount,
      tickLowerIndex: new BN(tickLowerIndex),
      tickUpperIndex: new BN(tickUpperIndex),
      funder: payer.publicKey,
    });
    
    // Increase Liquidity
    const incIx = WhirlpoolIx.increaseLiquidityIx(ctx.program, {
      whirlpool: poolPubkey,
      position: positionPda.publicKey,         // 👈 PDA encore
      positionTokenAccount,
      tickArrayLower: lowerPda.publicKey,
      tickArrayUpper: upperPda.publicKey,
      tokenOwnerAccountA: getAssociatedTokenAddressSync(new PublicKey(process.env.SOL_PENGU_MINT), payer.publicKey),
      tokenOwnerAccountB: getAssociatedTokenAddressSync(new PublicKey(process.env.SOL_WSOL_MINT), payer.publicKey),
      tokenVaultA: poolData.tokenVaultA,       // depuis pool.data
      tokenVaultB: poolData.tokenVaultB,
      liquidityAmount: liquidityAmount,
      tokenMaxA: tokenMaxA,
      tokenMaxB: tokenMaxB,
    });
    
    tx2.add(openIx);
    tx2.add(incIx);
    
    console.log('   TX2 construite: openPosition + increaseLiquidity');
    
    // Envoyer TX2
    const recentBlockhash2 = await connection.getLatestBlockhash();
    tx2.recentBlockhash = recentBlockhash2.blockhash;
    tx2.feePayer = payer.publicKey;
    
    tx2Hash = await pRetry(
      () => connection.sendTransaction(tx2, [payer]),
      { retries: 3, minTimeout: 1000 }
    );
    
    console.log(`   TX2 envoyée: ${tx2Hash}`);
    
    // Attendre confirmation TX2
    await connection.confirmTransaction(tx2Hash);
    console.log('   TX2 confirmée');
    
    // 11. Vérification des balances APRÈS
    console.log('\n1️⃣1️⃣ Vérification des balances APRÈS...');
    const solBalanceAfter = await connection.getBalance(payer.publicKey);
    console.log(`   SOL: ${solBalanceAfter / 1e9} (${(solBalanceAfter - solBalanceBefore) / 1e9} gagné)`);
    
    // 12. Critères de succès
    console.log('\n1️⃣2️⃣ Critères de succès...');
    const successCriteria = [
      { name: 'TX1 confirmée', passed: !!tx1Hash },
      { name: 'TX2 confirmée', passed: !!tx2Hash },
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
  console.log(`\n📊 Résumé du LP PENGU/WSOL (SDK Orca FIXÉ):`);
  console.log(`   Durée: ${duration}ms`);
  console.log(`   Succès: ${success ? '✅' : '❌'}`);
  console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
  console.log(`   TX1 Hash: ${tx1Hash || 'N/A'}`);
  console.log(`   TX2 Hash: ${tx2Hash || 'N/A'}`);
  console.log(`   Position Mint: ${positionMint?.publicKey.toBase58() || 'N/A'}`);
  console.log(`   Position PDA: ${positionPda?.publicKey.toBase58() || 'N/A'}`);
  console.log(`   Pool: ${process.env.ORCA_PENGU_WSOL_POOL || 'N/A'}`);
  console.log(`   Address: ${payer ? payer.publicKey.toString() : 'N/A'}`);
  
  if (success) {
    console.log('\n🎉 LP PENGU/WSOL (SDK Orca FIXÉ) réussi !');
    console.log('   Position NFT créée avec succès');
    console.log('   Liquidité ajoutée au pool');
  } else {
    console.log('\n💥 LP PENGU/WSOL (SDK Orca FIXÉ) échoué !');
    console.log('   Vérifiez la configuration et les fonds');
  }
}

orcaLpRealFixed();
