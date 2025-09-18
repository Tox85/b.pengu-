#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, SystemProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createInitializeMintInstruction, MINT_SIZE } = require('@solana/spl-token');
const { 
  WhirlpoolContext, 
  buildWhirlpoolClient, 
  ORCA_WHIRLPOOL_PROGRAM_ID
} = require('@orca-so/whirlpools-sdk');
const fs = require('fs');
const path = require('path');
const BN = require('bn.js');

// Import des helpers Orca
const orcaHelpers = require(path.join(__dirname, '..', 'lib', 'orca', 'helpers'));

console.log('🐧 Orca LP LIVE PENGU/WSOL...');

dotenv.config();

async function orcaLpPenguWsol() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const penguAmount = args.find(arg => arg.startsWith('--pengu='))?.split('=')[1];
  const wsolAmount = args.find(arg => arg.startsWith('--wsol='))?.split('=')[1];
  const tickRange = args.find(arg => arg.startsWith('--tick-range='))?.split('=')[1] || '15';
  const slippageBps = args.find(arg => arg.startsWith('--slippageBps='))?.split('=')[1] || '50';
  const priorityFeeMicrolamports = args.find(arg => arg.startsWith('--priorityFeeMicrolamports='))?.split('=')[1] || '1000';
  const dryRun = args.includes('--dry-run');
  
  const startTime = Date.now();
  let success = false;
  let error = null;
  let lpTxHash = null;
  let keypair = null;
  let positionNft = null;
  let pool = null;
  let tickLower = null;
  let tickUpper = null;
  let quote = null;
  let lowerPda = null;
  let upperPda = null;
  let startLower = null;
  let startUpper = null;
  
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    
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
    
    // 3. Configuration Orca
    console.log('\n3️⃣ Configuration Orca...');
    const orcaWhirlpoolsProgram = new PublicKey(process.env.ORCA_WHIRLPOOLS_PROGRAM);
    console.log(`   Orca Program: ${orcaWhirlpoolsProgram.toBase58()}`);
    
    // Créer le contexte Orca
    const ctx = WhirlpoolContext.from(
      orcaWhirlpoolsProgram,
      solanaConnection,
      keypair
    );
    
    const client = buildWhirlpoolClient(ctx);
    
    // 4. Résolution du pool PENGU/WSOL
    console.log('\n4️⃣ Résolution du pool PENGU/WSOL...');
    
    // Utiliser le pool configuré ou chercher automatiquement
    let poolId;
    if (process.env.ORCA_PENGU_WSOL_POOL) {
      poolId = new PublicKey(process.env.ORCA_PENGU_WSOL_POOL);
      console.log(`   Pool PENGU/WSOL configuré: ${poolId.toBase58()}`);
    } else {
      throw new Error('Aucun pool PENGU/WSOL configuré dans .env');
    }
    
    // Récupérer les données du pool
    pool = await client.getPool(poolId);
    console.log(`   Pool trouvé: ${pool.getData().tokenMintA.toBase58()}/${pool.getData().tokenMintB.toBase58()}`);
    console.log(`   Tick Spacing: ${pool.getData().tickSpacing}`);
    console.log(`   Current Tick: ${pool.getData().tickCurrentIndex}`);
    
    // 5. Calcul des montants de dépôt
    console.log('\n5️⃣ Calcul des montants de dépôt...');
    
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
    
    // 6. Vérification des ATAs
    console.log('\n6️⃣ Vérification des ATAs...');
    
    const ensureAta = async (mint) => {
      const ata = await getAssociatedTokenAddress(mint, keypair.publicKey);
      try {
        await getAccount(solanaConnection, ata);
        console.log(`   ATA pour ${mint.toBase58()} existe déjà`);
        return ata;
      } catch (e) {
        console.log(`   Création de l'ATA pour ${mint.toBase58()}...`);
        const createAtaIx = createAssociatedTokenAccountInstruction(
          keypair.publicKey,
          ata,
          keypair.publicKey,
          mint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        return { ata, instruction: createAtaIx };
      }
    };
    
    const penguAtaInfo = await ensureAta(penguMint);
    const wsolAtaInfo = await ensureAta(wsolMint);
    
    // 7. Calcul des ticks
    console.log('\n7️⃣ Calcul des ticks...');
    
    const currentTick = pool.getData().tickCurrentIndex;
    const tickSpacing = pool.getData().tickSpacing;
    const rangePercent = parseFloat(tickRange);
    
    const { tickLower: calculatedTickLower, tickUpper: calculatedTickUpper } = orcaHelpers.calculateAlignedTicks(
      currentTick,
      tickSpacing,
      rangePercent
    );
    
    tickLower = calculatedTickLower;
    tickUpper = calculatedTickUpper;
    
    console.log(`   Current Tick: ${currentTick}`);
    console.log(`   Tick Spacing: ${tickSpacing}`);
    console.log(`   Range: ±${rangePercent}%`);
    console.log(`   Tick Lower: ${tickLower}`);
    console.log(`   Tick Upper: ${tickUpper}`);
    
    // 8. Dérivation des TickArrays
    console.log('\n8️⃣ Dérivation des TickArrays...');
    
    const { lowerPda: calculatedLowerPda, upperPda: calculatedUpperPda, startLower: calculatedStartLower, startUpper: calculatedStartUpper } = orcaHelpers.getTickArrayPDAs(
      ctx,
      pool,
      tickLower,
      tickUpper
    );
    
    lowerPda = calculatedLowerPda;
    upperPda = calculatedUpperPda;
    startLower = calculatedStartLower;
    startUpper = calculatedStartUpper;
    
    console.log(`   TickArray Lower: ${lowerPda.publicKey.toBase58()}`);
    console.log(`   TickArray Upper: ${upperPda.publicKey.toBase58()}`);
    console.log(`   Start Lower: ${startLower}`);
    console.log(`   Start Upper: ${startUpper}`);
    
    // 9. Quote de liquidité
    console.log('\n9️⃣ Quote de liquidité...');
    
    quote = await orcaHelpers.getLiquidityQuote(
      pool,
      penguMint,
      depositPenguAmount,
      tickLower,
      tickUpper,
      parseInt(slippageBps)
    );
    
    console.log(`   Liquidity: ${quote.liquidityAmount.toString()}`);
    console.log(`   Token Max A: ${quote.tokenMaxA.toString()}`);
    console.log(`   Token Max B: ${quote.tokenMaxB.toString()}`);
    
    // 10. Création du NFT de position
    console.log('\n🔟 Création du NFT de position...');
    
    const positionMint = orcaHelpers.createPositionMint();
    const positionPda = orcaHelpers.getPositionPda(ctx, positionMint.publicKey);
    const positionTokenAta = getAssociatedTokenAddressSync(
      positionMint.publicKey,
      keypair.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    console.log(`   Position Mint: ${positionMint.publicKey.toBase58()}`);
    console.log(`   Position PDA: ${positionPda.publicKey.toBase58()}`);
    console.log(`   Position Token ATA: ${positionTokenAta.toBase58()}`);
    
    // 11. Construction des instructions
    console.log('\n1️⃣1️⃣ Construction des instructions...');
    
    if (dryRun) {
      console.log('   🧪 Mode DRY_RUN - Simulation uniquement');
      console.log(`   TickArray Lower: ${lowerPda.publicKey.toBase58()}`);
      console.log(`   TickArray Upper: ${upperPda.publicKey.toBase58()}`);
      console.log(`   Start Lower: ${startLower}`);
      console.log(`   Start Upper: ${startUpper}`);
      console.log(`   Liquidity: ${quote.liquidityAmount.toString()}`);
      console.log(`   Token Max A: ${quote.tokenMaxA.toString()}`);
      console.log(`   Token Max B: ${quote.tokenMaxB.toString()}`);
      
      success = true;
      console.log('\n✅ Simulation LP PENGU/WSOL réussie !');
      return;
    }
    
    // Mode LIVE
    console.log('   ⚠️  Mode LIVE - Transaction réelle');
    
    // TX1: Création du mint et ATA de position
    console.log('\n1️⃣2️⃣ TX1: Création du mint et ATA de position...');
    
    const tx1 = new Transaction();
    
    // Compute Budget
    tx1.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: parseInt(process.env.SOL_COMPUTE_UNITS) || 200000
    }));
    
    tx1.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: parseInt(priorityFeeMicrolamports)
    }));
    
    // Créer le mint de position
    const mintRent = await solanaConnection.getMinimumBalanceForRentExemption(82); // MINT_SIZE
    const createMintIx = SystemProgram.createAccount({
      fromPubkey: keypair.publicKey,
      newAccountPubkey: positionMint.publicKey,
      lamports: mintRent,
      space: 82,
      programId: TOKEN_PROGRAM_ID
    });
    
    const initMintIx = createInitializeMintInstruction(
      positionMint.publicKey,
      0, // decimals (NFT)
      keypair.publicKey, // mintAuthority
      keypair.publicKey, // freezeAuthority
      TOKEN_PROGRAM_ID
    );
    
    const createPositionAtaIx = createAssociatedTokenAccountInstruction(
      keypair.publicKey,
      positionTokenAta,
      keypair.publicKey,
      positionMint.publicKey,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    tx1.add(createMintIx);
    tx1.add(initMintIx);
    tx1.add(createPositionAtaIx);
    
    // Ajouter les instructions d'ATA si nécessaire
    if (penguAtaInfo.instruction) {
      tx1.add(penguAtaInfo.instruction);
    }
    if (wsolAtaInfo.instruction) {
      tx1.add(wsolAtaInfo.instruction);
    }
    
    // Signer et envoyer TX1
    tx1.recentBlockhash = (await solanaConnection.getLatestBlockhash()).blockhash;
    tx1.feePayer = keypair.publicKey;
    tx1.sign(keypair, positionMint);
    
    console.log('   Envoi de TX1...');
    const tx1Signature = await solanaConnection.sendTransaction(tx1, [keypair, positionMint]);
    console.log(`   TX1 envoyée: ${tx1Signature}`);
    
    // Attendre la confirmation
    await solanaConnection.confirmTransaction(tx1Signature);
    console.log('   TX1 confirmée');
    
    // Petite pause pour éviter les problèmes de nonce
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // TX2: Instructions de LP
    console.log('\n1️⃣3️⃣ TX2: Instructions de LP...');
    
    const tx2 = new Transaction();
    
    // Compute Budget
    tx2.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: parseInt(process.env.SOL_COMPUTE_UNITS) || 200000
    }));
    
    tx2.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: parseInt(priorityFeeMicrolamports)
    }));
    
    // Initialiser les TickArrays si nécessaire
    const lowerTickArrayIx = await orcaHelpers.ensureTickArray(ctx, pool, lowerPda, startLower);
    if (lowerTickArrayIx) {
      tx2.add(lowerTickArrayIx);
    }
    
    const upperTickArrayIx = await orcaHelpers.ensureTickArray(ctx, pool, upperPda, startUpper);
    if (upperTickArrayIx) {
      tx2.add(upperTickArrayIx);
    }
    
    // Construire les instructions de LP
    const { openPositionIx, increaseLiquidityIx } = orcaHelpers.buildLiquidityInstructions(
      ctx,
      pool,
      positionPda,
      positionMint.publicKey,
      positionTokenAta,
      penguAtaInfo.ata || penguAtaInfo,
      wsolAtaInfo.ata || wsolAtaInfo,
      tickLower,
      tickUpper,
      quote.liquidityAmount,
      quote.tokenMaxA,
      quote.tokenMaxB
    );
    
    tx2.add(openPositionIx);
    tx2.add(increaseLiquidityIx);
    
    // Signer et envoyer TX2
    tx2.recentBlockhash = (await solanaConnection.getLatestBlockhash()).blockhash;
    tx2.feePayer = keypair.publicKey;
    tx2.sign(keypair);
    
    console.log('   Envoi de TX2...');
    const tx2Signature = await solanaConnection.sendTransaction(tx2, [keypair]);
    console.log(`   TX2 envoyée: ${tx2Signature}`);
    
    // Attendre la confirmation
    await solanaConnection.confirmTransaction(tx2Signature);
    console.log('   TX2 confirmée');
    
    lpTxHash = tx2Signature;
    positionNft = positionMint.publicKey.toBase58();
    
    // 14. Vérification des balances APRÈS
    console.log('\n1️⃣4️⃣ Vérification des balances APRÈS...');
    
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
    
    // 15. Critères de succès
    console.log('\n1️⃣5️⃣ Critères de succès...');
    
    const successCriteria = [
      { name: 'Transaction de LP confirmée', passed: !!lpTxHash },
      { name: 'PENGU converti en LP', passed: penguBalanceAfter < penguBalanceBefore },
      { name: 'WSOL converti en LP', passed: wsolBalanceAfter < wsolBalanceBefore },
      { name: 'Configuration valide', passed: !!pool },
      { name: 'Fonds disponibles', passed: solBalanceAfter > 0.01e9 }
    ];
    
    successCriteria.forEach(criteria => {
      console.log(`${criteria.passed ? '✅' : '❌'} ${criteria.name}`);
    });
    
    success = successCriteria.every(criteria => criteria.passed);
    
  } catch (err) {
    error = err;
    console.error(`❌ Erreur: ${err.message}`);
    
    // Logs détaillés en cas d'erreur
    if (err.logs) {
      console.log('\n📋 Logs de la transaction:');
      err.logs.forEach(log => console.log(`   ${log}`));
    }
  }
  
  // Résumé final
  const duration = Date.now() - startTime;
  console.log(`\n📊 Résumé du LP PENGU/WSOL:`);
  console.log(`   Durée: ${duration}ms`);
  console.log(`   Succès: ${success ? '✅' : '❌'}`);
  console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
  console.log(`   LP Tx Hash: ${lpTxHash || 'N/A'}`);
  console.log(`   Position NFT: ${positionNft || 'N/A'}`);
  console.log(`   Pool: ${pool ? pool.getData().address.toBase58() : 'N/A'}`);
  console.log(`   Ticks: ${tickLower && tickUpper ? `${tickLower}-${tickUpper}` : 'N/A'}`);
  console.log(`   Liquidity: ${quote ? quote.liquidityAmount.toString() : 'N/A'}`);
  console.log(`   Address: ${keypair ? keypair.publicKey.toString() : 'N/A'}`);
  
  if (success) {
    console.log('\n🎉 LP PENGU/WSOL LIVE réussi !');
    console.log('   Prochaine étape: Surveillance du LP');
  } else {
    console.log('\n💥 LP PENGU/WSOL LIVE échoué !');
    console.log('   Vérifiez la configuration et les fonds');
  }
}

orcaLpPenguWsol();
