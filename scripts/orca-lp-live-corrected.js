#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createInitializeMintInstruction, MINT_SIZE } = require('@solana/spl-token');
const { WhirlpoolContext, WhirlpoolClient, PDAUtil, WhirlpoolIx } = require('@orca-so/whirlpools-sdk');
const BN = require('bn.js');
const fs = require('fs');
const pRetry = require('p-retry');

console.log('🐧 LP LIVE PENGU/WSOL (Corrigé - 2 TX)...');

dotenv.config({ override: true });

async function orcaLpLiveCorrected() {
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
  let keypair = null;
  
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    console.log(`   Mode: ${dryRun ? 'DRY_RUN (simulation)' : 'LIVE (exécution réelle)'}`);
    console.log(`   TARGET_ASSET: ${process.env.TARGET_ASSET || 'PENGU'}`);
    
    // 2. Vérification des fonds AVANT
    console.log('\n2️⃣ Vérification des fonds AVANT...');
    const solBalanceBefore = await solanaConnection.getBalance(keypair.publicKey);
    
    // Vérifier PENGU balance
    const penguMint = new PublicKey(process.env.SOL_PENGU_MINT);
    const penguAta = await getAssociatedTokenAddress(penguMint, keypair.publicKey);
    
    let penguBalanceBefore = 0;
    try {
      const penguAccount = await getAccount(solanaConnection, penguAta);
      penguBalanceBefore = Number(penguAccount.amount);
    } catch (e) {
      console.log('   PENGU ATA non trouvé, balance = 0');
    }
    
    // Vérifier WSOL balance
    const wsolMint = new PublicKey(process.env.SOL_WSOL_MINT);
    const wsolAta = await getAssociatedTokenAddress(wsolMint, keypair.publicKey);
    
    let wsolBalanceBefore = 0;
    try {
      const wsolAccount = await getAccount(solanaConnection, wsolAta);
      wsolBalanceBefore = Number(wsolAccount.amount);
    } catch (e) {
      console.log('   WSOL ATA non trouvé, balance = 0');
    }
    
    console.log(`   SOL: ${solBalanceBefore / 1e9}`);
    console.log(`   PENGU: ${penguBalanceBefore / 1e6}`);
    console.log(`   WSOL: ${wsolBalanceBefore / 1e9}`);
    
    if (solBalanceBefore < 0.01e9) {
      throw new Error('SOL insuffisant pour les frais de transaction');
    }
    
    if (penguBalanceBefore < 0.001e6) {
      throw new Error('PENGU insuffisant pour le LP (minimum 0.001 PENGU)');
    }
    
    if (wsolBalanceBefore < 0.0001e9) {
      throw new Error('WSOL insuffisant pour le LP (minimum 0.0001 WSOL)');
    }
    
    // 3. Calcul des montants LP
    console.log('\n3️⃣ Calcul des montants LP...');
    
    let depositPenguAmount;
    let depositWsolAmount;
    
    if (penguAmount && wsolAmount) {
      depositPenguAmount = Math.floor(parseFloat(penguAmount) * 1e6);
      depositWsolAmount = Math.floor(parseFloat(wsolAmount) * 1e9);
      console.log(`   Montants paramétrables: ${penguAmount} PENGU, ${wsolAmount} WSOL`);
    } else {
      // Utiliser 50% de chaque balance disponible
      depositPenguAmount = Math.floor(penguBalanceBefore * 0.5);
      depositWsolAmount = Math.floor(wsolBalanceBefore * 0.5);
      console.log(`   Montants automatiques: 50% de chaque balance`);
    }
    
    console.log(`   PENGU à déposer: ${depositPenguAmount / 1e6}`);
    console.log(`   WSOL à déposer: ${depositWsolAmount / 1e9}`);
    
    // 4. Configuration du pool
    console.log('\n4️⃣ Configuration du pool...');
    
    const poolId = process.env.ORCA_PENGU_WSOL_POOL;
    if (!poolId) {
      throw new Error('Aucun pool PENGU/WSOL configuré dans .env');
    }
    
    console.log(`   Pool PENGU/WSOL: ${poolId}`);
    
    // 5. Configuration Orca
    console.log('\n5️⃣ Configuration Orca...');
    
    const whirlpoolProgramId = new PublicKey(process.env.ORCA_WHIRLPOOLS_PROGRAM);
    const whirlpoolClient = new WhirlpoolClient(whirlpoolProgramId, solanaConnection);
    const ctx = whirlpoolClient.getContext();
    
    console.log(`   Orca Program: ${whirlpoolProgramId.toBase58()}`);
    
    // 6. Résolution du pool
    console.log('\n6️⃣ Résolution du pool...');
    
    const pool = await ctx.fetcher.getPool(new PublicKey(poolId));
    if (!pool) {
      throw new Error(`Pool ${poolId} non trouvé`);
    }
    
    console.log(`   Pool trouvé: ${pool.data.whirlpoolsConfig}`);
    console.log(`   Token A: ${pool.data.tokenMintA.toBase58()}`);
    console.log(`   Token B: ${pool.data.tokenMintB.toBase58()}`);
    console.log(`   Tick Spacing: ${pool.data.tickSpacing}`);
    console.log(`   Fee Rate: ${pool.data.feeRate}`);
    
    // 7. Calcul des ticks
    console.log('\n7️⃣ Calcul des ticks...');
    
    const currentTick = 0; // Simulé
    const tickSpacing = pool.data.tickSpacing;
    const rangePercent = parseFloat(tickRange);
    
    const rangeValue = Math.floor((currentTick * rangePercent) / 100);
    const tickLower = Math.floor((currentTick - rangeValue) / tickSpacing) * tickSpacing;
    const tickUpper = Math.floor((currentTick + rangeValue) / tickSpacing) * tickSpacing;
    
    console.log(`   Current Tick: ${currentTick}`);
    console.log(`   Tick Spacing: ${tickSpacing}`);
    console.log(`   Range: ±${rangePercent}%`);
    console.log(`   Tick Lower: ${tickLower}`);
    console.log(`   Tick Upper: ${tickUpper}`);
    
    // 8. Calcul de la liquidité
    console.log('\n8️⃣ Calcul de la liquidité...');
    
    const liquidity = Math.min(depositPenguAmount, depositWsolAmount * 0.0000365 * 1e3);
    const tokenMaxA = new BN(depositPenguAmount);
    const tokenMaxB = new BN(depositWsolAmount);
    
    console.log(`   Liquidity: ${liquidity.toFixed(0)}`);
    console.log(`   Token Max A (PENGU): ${tokenMaxA.toString()}`);
    console.log(`   Token Max B (WSOL): ${tokenMaxB.toString()}`);
    
    // 9. Mode DRY_RUN ou LIVE
    if (dryRun) {
      console.log('\n9️⃣ Mode DRY_RUN - Simulation uniquement...');
      console.log(`   Pool: ${poolId}`);
      console.log(`   PENGU: ${depositPenguAmount / 1e6}`);
      console.log(`   WSOL: ${depositWsolAmount / 1e9}`);
      console.log(`   Ticks: ${tickLower} à ${tickUpper}`);
      console.log(`   Liquidity: ${liquidity.toFixed(0)}`);
      
      success = true;
      console.log('\n✅ Simulation LP PENGU/WSOL réussie !');
      return;
    }
    
    // Mode LIVE
    console.log('\n9️⃣ Mode LIVE - Exécution réelle...');
    console.log('   ⚠️  ATTENTION: Transactions réelles sur Solana !');
    
    // 10. Création du position mint et ATA
    console.log('\n🔟 Création du position mint et ATA...');
    
    const positionMint = Keypair.generate();
    const positionPda = PDAUtil.getPosition(whirlpoolProgramId, positionMint.publicKey);
    const positionTokenAta = getAssociatedTokenAddressSync(
      positionMint.publicKey,
      keypair.publicKey,
      false,
      TOKEN_PROGRAM_ID, // 👈 SPL classic
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    console.log(`   Position Mint: ${positionMint.publicKey.toBase58()}`);
    console.log(`   Position PDA: ${positionPda.publicKey.toBase58()}`);
    console.log(`   Position ATA: ${positionTokenAta.toBase58()}`);
    
    // 11. TX1: Création mint + ATA
    console.log('\n1️⃣1️⃣ TX1: Création mint + ATA...');
    
    const tx1 = new Transaction();
    
    // Compute Budget
    tx1.add(require('@solana/web3.js').ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000
    }));
    
    tx1.add(require('@solana/web3.js').ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 2000
    }));
    
    // Créer le compte mint
    const mintRent = await solanaConnection.getMinimumBalanceForRentExemption(MINT_SIZE);
    tx1.add(SystemProgram.createAccount({
      fromPubkey: keypair.publicKey,
      newAccountPubkey: positionMint.publicKey,
      lamports: mintRent,
      space: MINT_SIZE,
      programId: TOKEN_PROGRAM_ID // 👈 SPL classic
    }));
    
    // Initialiser le mint
    tx1.add(createInitializeMintInstruction(
      positionMint.publicKey,
      0, // decimals (NFT)
      keypair.publicKey, // mintAuthority
      keypair.publicKey, // freezeAuthority
      TOKEN_PROGRAM_ID // 👈 SPL classic
    ));
    
    // Créer l'ATA
    tx1.add(createAssociatedTokenAccountInstruction(
      keypair.publicKey, // payer
      positionTokenAta, // ata
      keypair.publicKey, // owner
      positionMint.publicKey, // mint
      TOKEN_PROGRAM_ID // 👈 SPL classic
    ));
    
    console.log('   TX1 construite: mint + ATA');
    
    // Envoyer TX1
    const recentBlockhash = await solanaConnection.getLatestBlockhash();
    tx1.recentBlockhash = recentBlockhash.blockhash;
    tx1.feePayer = keypair.publicKey;
    
    const tx1Signature = await solanaConnection.sendTransaction(tx1, [keypair, positionMint]);
    console.log(`   TX1 envoyée: ${tx1Signature}`);
    
    // Attendre confirmation TX1
    await solanaConnection.confirmTransaction(tx1Signature);
    console.log('   TX1 confirmée');
    
    tx1Hash = tx1Signature;
    
    // Petite pause entre les transactions
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 12. TX2: Instructions LP
    console.log('\n1️⃣2️⃣ TX2: Instructions LP...');
    
    const tx2 = new Transaction();
    
    // Compute Budget
    tx2.add(require('@solana/web3.js').ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000
    }));
    
    tx2.add(require('@solana/web3.js').ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 2000
    }));
    
    // Calculer les TickArray PDAs
    const startLower = Math.floor(tickLower / tickSpacing / 88) * tickSpacing * 88;
    const startUpper = Math.floor(tickUpper / tickSpacing / 88) * tickSpacing * 88;
    
    const lowerPda = PDAUtil.getTickArray(whirlpoolProgramId, new PublicKey(poolId), startLower);
    const upperPda = PDAUtil.getTickArray(whirlpoolProgramId, new PublicKey(poolId), startUpper);
    
    console.log(`   TickArray Lower: ${lowerPda.publicKey.toBase58()} (start: ${startLower})`);
    console.log(`   TickArray Upper: ${upperPda.publicKey.toBase58()} (start: ${startUpper})`);
    
    // Vérifier et initialiser les TickArrays si nécessaire
    try {
      const lowerAccount = await ctx.fetcher.getTickArray(lowerPda.publicKey, true);
      if (!lowerAccount) {
        console.log('   Initialisation TickArray Lower...');
        const initLowerIx = WhirlpoolIx.initializeTickArrayIx(ctx.program, {
          whirlpool: new PublicKey(poolId),
          funder: keypair.publicKey,
          startTickIndex: startLower
        });
        tx2.add(initLowerIx);
      }
    } catch (e) {
      console.log('   TickArray Lower manquant, ajout instruction...');
      const initLowerIx = WhirlpoolIx.initializeTickArrayIx(ctx.program, {
        whirlpool: new PublicKey(poolId),
        funder: keypair.publicKey,
        startTickIndex: startLower
      });
      tx2.add(initLowerIx);
    }
    
    try {
      const upperAccount = await ctx.fetcher.getTickArray(upperPda.publicKey, true);
      if (!upperAccount) {
        console.log('   Initialisation TickArray Upper...');
        const initUpperIx = WhirlpoolIx.initializeTickArrayIx(ctx.program, {
          whirlpool: new PublicKey(poolId),
          funder: keypair.publicKey,
          startTickIndex: startUpper
        });
        tx2.add(initUpperIx);
      }
    } catch (e) {
      console.log('   TickArray Upper manquant, ajout instruction...');
      const initUpperIx = WhirlpoolIx.initializeTickArrayIx(ctx.program, {
        whirlpool: new PublicKey(poolId),
        funder: keypair.publicKey,
        startTickIndex: startUpper
      });
      tx2.add(initUpperIx);
    }
    
    // Open Position
    const openPositionIx = WhirlpoolIx.openPositionIx(ctx.program, {
      whirlpool: new PublicKey(poolId),
      positionPda: positionPda.publicKey, // 👈 PDA, pas le mint !
      positionMint: positionMint.publicKey,
      positionTokenAccount: positionTokenAta,
      tickLowerIndex: new BN(tickLower),
      tickUpperIndex: new BN(tickUpper),
      funder: keypair.publicKey
    });
    
    // Increase Liquidity
    const increaseLiquidityIx = WhirlpoolIx.increaseLiquidityIx(ctx.program, {
      whirlpool: new PublicKey(poolId),
      position: positionPda.publicKey, // 👈 PDA, pas le mint !
      positionTokenAccount: positionTokenAta,
      tickArrayLower: lowerPda.publicKey,
      tickArrayUpper: upperPda.publicKey,
      tokenOwnerAccountA: penguAta,
      tokenOwnerAccountB: wsolAta,
      tokenVaultA: pool.data.tokenVaultA, // 👈 pool.data, pas pool.getData()
      tokenVaultB: pool.data.tokenVaultB,
      liquidityAmount: new BN(liquidity),
      tokenMaxA: tokenMaxA,
      tokenMaxB: tokenMaxB
    });
    
    tx2.add(openPositionIx);
    tx2.add(increaseLiquidityIx);
    
    console.log('   TX2 construite: openPosition + increaseLiquidity');
    
    // Envoyer TX2
    const recentBlockhash2 = await solanaConnection.getLatestBlockhash();
    tx2.recentBlockhash = recentBlockhash2.blockhash;
    tx2.feePayer = keypair.publicKey;
    
    const tx2Signature = await solanaConnection.sendTransaction(tx2, [keypair]);
    console.log(`   TX2 envoyée: ${tx2Signature}`);
    
    // Attendre confirmation TX2
    await solanaConnection.confirmTransaction(tx2Signature);
    console.log('   TX2 confirmée');
    
    tx2Hash = tx2Signature;
    
    // 13. Vérification des balances APRÈS
    console.log('\n1️⃣3️⃣ Vérification des balances APRÈS...');
    
    const solBalanceAfter = await solanaConnection.getBalance(keypair.publicKey);
    
    let penguBalanceAfter = 0;
    try {
      const penguAccount = await getAccount(solanaConnection, penguAta);
      penguBalanceAfter = Number(penguAccount.amount);
    } catch (e) {
      console.log('   PENGU ATA non trouvé');
    }
    
    let wsolBalanceAfter = 0;
    try {
      const wsolAccount = await getAccount(solanaConnection, wsolAta);
      wsolBalanceAfter = Number(wsolAccount.amount);
    } catch (e) {
      console.log('   WSOL ATA non trouvé');
    }
    
    console.log(`   SOL: ${solBalanceAfter / 1e9} (${(solBalanceAfter - solBalanceBefore) / 1e9} gagné)`);
    console.log(`   PENGU: ${penguBalanceAfter / 1e6} (${(penguBalanceAfter - penguBalanceBefore) / 1e6} perdu)`);
    console.log(`   WSOL: ${wsolBalanceAfter / 1e9} (${(wsolBalanceAfter - wsolBalanceBefore) / 1e9} perdu)`);
    
    // 14. Critères de succès
    console.log('\n1️⃣4️⃣ Critères de succès...');
    
    const successCriteria = [
      { name: 'TX1 confirmée', passed: !!tx1Hash },
      { name: 'TX2 confirmée', passed: !!tx2Hash },
      { name: 'PENGU converti en LP', passed: penguBalanceAfter < penguBalanceBefore },
      { name: 'WSOL converti en LP', passed: wsolBalanceAfter < wsolBalanceBefore },
      { name: 'Configuration valide', passed: !!poolId },
      { name: 'Fonds disponibles', passed: solBalanceAfter > 0.01e9 }
    ];
    
    successCriteria.forEach(criteria => {
      console.log(`${criteria.passed ? '✅' : '❌'} ${criteria.name}`);
    });
    
    success = successCriteria.every(criteria => criteria.passed);
    
  } catch (err) {
    error = err;
    console.error(`❌ Erreur: ${err.message}`);
  }
  
  // Résumé final
  const duration = Date.now() - startTime;
  console.log(`\n📊 Résumé du LP PENGU/WSOL (Corrigé):`);
  console.log(`   Durée: ${duration}ms`);
  console.log(`   Succès: ${success ? '✅' : '❌'}`);
  console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
  console.log(`   TX1 Hash: ${tx1Hash || 'N/A'}`);
  console.log(`   TX2 Hash: ${tx2Hash || 'N/A'}`);
  console.log(`   Pool: ${process.env.ORCA_PENGU_WSOL_POOL || 'N/A'}`);
  console.log(`   Address: ${keypair ? keypair.publicKey.toString() : 'N/A'}`);
  
  if (success) {
    console.log('\n🎉 LP PENGU/WSOL (Corrigé) réussi !');
    console.log('   Position NFT créée avec succès');
    console.log('   Liquidité ajoutée au pool');
  } else {
    console.log('\n💥 LP PENGU/WSOL (Corrigé) échoué !');
    console.log('   Vérifiez la configuration et les fonds');
  }
}

orcaLpLiveCorrected();
