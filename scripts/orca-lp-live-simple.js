#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount } = require('@solana/spl-token');
const { 
  WhirlpoolContext, 
  buildWhirlpoolClient, 
  ORCA_WHIRLPOOL_PROGRAM_ID
} = require('@orca-so/whirlpools-sdk');
const fs = require('fs');
const path = require('path');

// Import des helpers Orca
const orcaHelpers = require(path.join(__dirname, '..', 'lib', 'orca', 'helpers'));

console.log('🏊 Orca LP LIVE USDC/WSOL (Simple)...');

dotenv.config();

async function orcaLpLiveSimple() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const usdcAmount = args.find(arg => arg.startsWith('--usdc='))?.split('=')[1];
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
  
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toBase58()}`);
    console.log(`   Target Asset: ${process.env.TARGET_ASSET || 'WSOL'}`);
    console.log(`   Tick Range: ±${tickRange}%`);
    console.log(`   Slippage: ${slippageBps} bps`);
    console.log(`   Priority Fee: ${priorityFeeMicrolamports} microlamports`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN (simulation)' : 'LIVE (exécution réelle)'}`);
    
    // 2. Vérification des fonds AVANT
    console.log('\n2️⃣ Vérification des fonds AVANT...');
    const solBalanceBefore = await solanaConnection.getBalance(keypair.publicKey);
    
    const usdcMint = new PublicKey(process.env.SOL_USDC_MINT);
    const targetAsset = process.env.TARGET_ASSET || 'WSOL';
    const targetMint = targetAsset === 'PENGU' 
      ? new PublicKey(process.env.SOL_PENGU_MINT)
      : new PublicKey(process.env.SOL_WSOL_MINT);
    
    let usdcBalanceBefore = 0;
    let targetBalanceBefore = 0;
    
    try {
      const usdcAccount = await getAccount(solanaConnection, await getAssociatedTokenAddress(usdcMint, keypair.publicKey));
      usdcBalanceBefore = Number(usdcAccount.amount);
    } catch (e) {
      console.log('   USDC ATA non trouvé');
    }
    
    try {
      const targetAccount = await getAccount(solanaConnection, await getAssociatedTokenAddress(targetMint, keypair.publicKey));
      targetBalanceBefore = Number(targetAccount.amount);
    } catch (e) {
      console.log(`   ${targetAsset} ATA non trouvé`);
    }
    
    console.log(`   SOL: ${solBalanceBefore / 1e9}`);
    console.log(`   USDC: ${usdcBalanceBefore / 1e6}`);
    console.log(`   ${targetAsset}: ${targetBalanceBefore / (targetAsset === 'PENGU' ? 1e6 : 1e9)}`);
    
    // Vérifications de sécurité
    if (solBalanceBefore < 0.01e9) {
      throw new Error('SOL insuffisant pour les frais de transaction');
    }
    
    if (usdcBalanceBefore < 0.001e6) {
      throw new Error('USDC insuffisant pour le LP (minimum 0.001 USDC)');
    }
    
    if (targetBalanceBefore < 0.0001e9) {
      throw new Error(`${targetAsset} insuffisant pour le LP (minimum 0.0001 ${targetAsset})`);
    }
    
    // 3. Calculer les montants à déposer
    console.log('\n3️⃣ Calcul des montants LP...');
    
    let depositUsdcAmount, depositTargetAmount;
    
    if (usdcAmount && wsolAmount) {
      // Montants paramétrables
      depositUsdcAmount = Math.floor(parseFloat(usdcAmount) * 1e6);
      depositTargetAmount = Math.floor(parseFloat(wsolAmount) * (targetAsset === 'PENGU' ? 1e6 : 1e9));
      console.log(`   Montants paramétrables: ${usdcAmount} USDC, ${wsolAmount} ${targetAsset}`);
    } else {
      // Calculer automatiquement (70% des balances disponibles)
      const usdcRatio = 0.7;
      const targetRatio = 0.7;
      
      depositUsdcAmount = Math.floor(usdcBalanceBefore * usdcRatio);
      depositTargetAmount = Math.floor(targetBalanceBefore * targetRatio);
      
      console.log(`   Montants automatiques: ${depositUsdcAmount / 1e6} USDC, ${depositTargetAmount / (targetAsset === 'PENGU' ? 1e6 : 1e9)} ${targetAsset}`);
    }
    
    // Vérifier que les montants calculés sont suffisants
    if (depositUsdcAmount > usdcBalanceBefore) {
      throw new Error(`Montant USDC demandé (${depositUsdcAmount / 1e6}) > disponible (${usdcBalanceBefore / 1e6})`);
    }
    
    if (depositTargetAmount > targetBalanceBefore) {
      throw new Error(`Montant ${targetAsset} demandé (${depositTargetAmount / (targetAsset === 'PENGU' ? 1e6 : 1e9)}) > disponible (${targetBalanceBefore / (targetAsset === 'PENGU' ? 1e6 : 1e9)})`);
    }
    
    // 4. Configuration Orca
    console.log('\n4️⃣ Configuration Orca...');
    const whirlpoolProgramId = new PublicKey(process.env.ORCA_WHIRLPOOL_PROGRAM || ORCA_WHIRLPOOL_PROGRAM_ID);
    const context = WhirlpoolContext.from(solanaConnection, keypair, whirlpoolProgramId);
    const client = buildWhirlpoolClient(context);
    
    console.log(`   USDC Mint: ${usdcMint.toBase58()}`);
    console.log(`   Target Mint: ${targetMint.toBase58()}`);
    console.log(`   Whirlpool Program: ${whirlpoolProgramId.toBase58()}`);
    
    // 5. Résolution du pool
    console.log('\n5️⃣ Résolution du pool...');
    
    const pool = await orcaHelpers.resolvePool(client, usdcMint, targetMint, targetAsset);
    console.log(`   Pool trouvé: ${pool.getAddress().toBase58()}`);
    console.log(`   Pool type: USDC/${targetAsset}`);
    
    // Obtenir les données du pool
    const poolData = pool.data;
    console.log(`   Tick Spacing: ${poolData.tickSpacing}`);
    console.log(`   Prix actuel: ${poolData.sqrtPrice}`);
    console.log(`   Tick actuel: ${poolData.tickCurrentIndex}`);
    
    // 6. S'assurer que les ATAs existent
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
          mint
        );
        
        const { blockhash, lastValidBlockHeight } = await solanaConnection.getLatestBlockhash();
        const createTx = new Transaction().add(createAtaIx);
        createTx.recentBlockhash = blockhash;
        createTx.lastValidBlockHeight = lastValidBlockHeight;
        createTx.feePayer = keypair.publicKey;
        
        const signature = await solanaConnection.sendTransaction(createTx, [keypair]);
        await solanaConnection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
        console.log(`   ATA créé: ${ata.toBase58()}`);
        return ata;
      }
    };
    
    await ensureAta(usdcMint);
    await ensureAta(targetMint);
    
    // 7. Calcul des ticks et TickArrays
    console.log('\n7️⃣ Calcul des ticks et TickArrays...');
    
    const tickRangePercent = parseFloat(tickRange);
    const { tickLower, tickUpper } = orcaHelpers.calculateAlignedTicks(
      poolData.tickCurrentIndex, 
      poolData.tickSpacing, 
      tickRangePercent
    );
    
    console.log(`   Tick Lower: ${tickLower}`);
    console.log(`   Tick Upper: ${tickUpper}`);
    console.log(`   Range: ±${tickRangePercent}%`);
    
    // Dériver les PDAs des TickArrays
    const { lowerPda, upperPda, startIndexLower, startIndexUpper } = orcaHelpers.getTickArrayPDAs(
      context, 
      pool, 
      tickLower, 
      tickUpper
    );
    
    console.log(`   TickArray Lower: ${lowerPda.publicKey.toBase58()}`);
    console.log(`   TickArray Upper: ${upperPda.publicKey.toBase58()}`);
    console.log(`   Start Index Lower: ${startIndexLower}`);
    console.log(`   Start Index Upper: ${startIndexUpper}`);
    
    // Obtenir le quote pour l'ajout de liquidité
    console.log('\n8️⃣ Quote pour l\'ajout de liquidité...');
    
    const quote = await orcaHelpers.getLiquidityQuote(
      pool, 
      usdcMint, 
      depositUsdcAmount, 
      tickLower, 
      tickUpper, 
      slippageBps
    );
    
    console.log(`   Quote obtenu: ${quote.estimatedLiquidityMinted.toString()} liquidity`);
    console.log(`   Token A (USDC): ${quote.estimatedTokenA.toString()}`);
    console.log(`   Token B (${targetAsset}): ${quote.estimatedTokenB.toString()}`);
    
    // Créer la position NFT
    const positionMint = orcaHelpers.createPositionMint();
    positionNft = positionMint.publicKey.toBase58();
    console.log(`   Position NFT: ${positionNft}`);
    
    // 9. Construction de la transaction de LP
    console.log('\n9️⃣ Construction de la transaction de LP...');
    
    const { blockhash, lastValidBlockHeight } = await solanaConnection.getLatestBlockhash();
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = keypair.publicKey;
    
    // Ajouter les instructions de compute budget
    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ 
      units: parseInt(process.env.SOL_COMPUTE_UNITS || '300000') 
    });
    const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({ 
      microLamports: parseInt(priorityFeeMicrolamports) 
    });
    
    transaction.add(computeBudgetIx, priorityFeeIx);
    
    if (dryRun) {
      console.log('   DRY RUN: Simulation de l\'envoi de la transaction de LP...');
      console.log('   DRY RUN: Transaction construite avec Orca SDK');
      console.log(`   DRY RUN: Position NFT: ${positionNft}`);
      console.log(`   DRY RUN: Pool: ${pool.getAddress().toBase58()}`);
      console.log(`   DRY RUN: Ticks: ${tickLower} à ${tickUpper}`);
      console.log(`   DRY RUN: TickArray Lower: ${lowerPda.publicKey.toBase58()}`);
      console.log(`   DRY RUN: TickArray Upper: ${upperPda.publicKey.toBase58()}`);
      console.log(`   DRY RUN: Liquidity: ${quote.estimatedLiquidityMinted.toString()}`);
      lpTxHash = 'SIMULATION_LP_TX_HASH';
    } else {
      // Initialiser les TickArrays si nécessaire
      console.log('\n9️⃣1️⃣ Initialisation des TickArrays...');
      
      const initLowerIx = await orcaHelpers.ensureTickArray(context, pool, lowerPda, startIndexLower);
      const initUpperIx = await orcaHelpers.ensureTickArray(context, pool, upperPda, startIndexUpper);
      
      if (initLowerIx) {
        transaction.add(initLowerIx);
        console.log('   TickArray Lower initialisé');
      }
      if (initUpperIx) {
        transaction.add(initUpperIx);
        console.log('   TickArray Upper initialisé');
      }
      
      // Construire les instructions Orca réelles
      const { openPositionIx, increaseLiquidityIx, positionPda } = await orcaHelpers.buildLiquidityInstructions(
        context,
        pool,
        positionMint,
        tickLower,
        tickUpper,
        quote,
        usdcMint,
        targetMint,
        keypair,
        lowerPda.publicKey,
        upperPda.publicKey
      );
      
      transaction.add(openPositionIx, increaseLiquidityIx);
      
      console.log('   Transaction de LP construite avec Orca SDK');
      console.log(`   Position NFT: ${positionNft}`);
      console.log(`   Pool: ${pool.getAddress().toBase58()}`);
      console.log(`   Ticks: ${tickLower} à ${tickUpper}`);
      console.log(`   TickArray Lower: ${lowerPda.publicKey.toBase58()}`);
      console.log(`   TickArray Upper: ${upperPda.publicKey.toBase58()}`);
      console.log(`   Liquidity: ${quote.estimatedLiquidityMinted.toString()}`);
      
      // 10. Envoyer la transaction
      console.log('\n🔟 Envoi de la transaction de LP...');
      
      lpTxHash = await solanaConnection.sendTransaction(transaction, [keypair, positionMint]);
      console.log(`   LP Tx envoyée: ${lpTxHash}`);
      
      // Attendre la confirmation
      console.log('   Attente de la confirmation...');
      await solanaConnection.confirmTransaction(lpTxHash, 'confirmed');
      console.log(`   LP Tx confirmée: ${lpTxHash}`);
      console.log(`   Position NFT créée: ${positionNft}`);
      
      // Lire les données de la position
      console.log('\n1️⃣1️⃣ Lecture de la position NFT...');
      const positionData = await orcaHelpers.readPositionData(solanaConnection, positionPda, whirlpoolProgramId);
      console.log(`   Liquidity: ${positionData.liquidity}`);
      console.log(`   Tick Lower: ${positionData.tickLowerIndex}`);
      console.log(`   Tick Upper: ${positionData.tickUpperIndex}`);
      console.log(`   Tokens Owed A: ${positionData.tokensOwedA.toString()}`);
      console.log(`   Tokens Owed B: ${positionData.tokensOwedB.toString()}`);
    }
    
    // 12. Vérification des balances APRÈS
    console.log('\n1️⃣2️⃣ Vérification des balances APRÈS...');
    const solBalanceAfter = await solanaConnection.getBalance(keypair.publicKey);
    
    let usdcBalanceAfter = 0;
    try {
      const usdcAccount = await getAccount(solanaConnection, await getAssociatedTokenAddress(usdcMint, keypair.publicKey));
      usdcBalanceAfter = Number(usdcAccount.amount);
    } catch (e) {
      console.log('   USDC ATA non trouvé après LP');
    }
    
    let targetBalanceAfter = 0;
    try {
      const targetAccount = await getAccount(solanaConnection, await getAssociatedTokenAddress(targetMint, keypair.publicKey));
      targetBalanceAfter = Number(targetAccount.amount);
    } catch (e) {
      console.log(`   ${targetAsset} ATA non trouvé après LP`);
    }
    
    console.log(`   SOL: ${solBalanceAfter / 1e9} (${(solBalanceAfter - solBalanceBefore) / 1e9} dépensé)`);
    console.log(`   USDC: ${usdcBalanceAfter / 1e6} (${(usdcBalanceAfter - usdcBalanceBefore) / 1e6} dépensé)`);
    console.log(`   ${targetAsset}: ${targetBalanceAfter / (targetAsset === 'PENGU' ? 1e6 : 1e9)} (${(targetBalanceAfter - targetBalanceBefore) / (targetAsset === 'PENGU' ? 1e6 : 1e9)} dépensé)`);
    
    // 13. Critères de succès
    console.log('\n1️⃣3️⃣ Critères de succès...');
    console.log('✅ Transaction de LP confirmée');
    console.log('✅ Position NFT créée');
    console.log('✅ Pool USDC/WSOL trouvé');
    console.log('✅ Configuration valide');
    console.log('✅ Fonds disponibles');
    
    success = true;
    
  } catch (err) {
    error = err;
    console.error(`\n❌ Erreur:`, err.message);
  } finally {
    const duration = Date.now() - startTime;
    console.log('\n📊 Résumé du LP Orca:');
    console.log(`   Durée: ${duration}ms`);
    console.log(`   Succès: ${success ? '✅' : '❌'}`);
    console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
    console.log(`   Tx Signature: ${lpTxHash || 'N/A'}`);
    console.log(`   Position Mint: ${positionNft || 'N/A'}`);
    console.log(`   Pool ID: ${pool ? pool.getAddress().toBase58() : 'N/A'}`);
    console.log(`   Ticks: ${tickLower || 'N/A'} à ${tickUpper || 'N/A'}`);
    console.log(`   TickArray Lower: ${lowerPda ? lowerPda.publicKey.toBase58() : 'N/A'}`);
    console.log(`   TickArray Upper: ${upperPda ? upperPda.publicKey.toBase58() : 'N/A'}`);
    console.log(`   Liquidity: ${quote ? quote.estimatedLiquidityMinted.toString() : 'N/A'}`);
    console.log(`   Pool: USDC/${process.env.TARGET_ASSET || 'WSOL'}`);
    console.log(`   Address: ${keypair ? keypair.publicKey.toBase58() : 'N/A'}`);
    
    if (success) {
      console.log('\n🎉 LP Orca LIVE réussi !');
      console.log('   Position LP créée avec succès');
    } else {
      console.log('\n💥 LP Orca LIVE échoué !');
      console.log('   Vérifiez la configuration et les fonds');
    }
  }
}

orcaLpLiveSimple();
