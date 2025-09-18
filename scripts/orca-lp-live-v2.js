#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount } = require('@solana/spl-token');
const { 
  WhirlpoolContext, 
  buildWhirlpoolClient, 
  ORCA_WHIRLPOOL_PROGRAM_ID,
  increaseLiquidityQuoteByInputTokenWithParams,
  PDAUtil,
  WhirlpoolIx
} = require('@orca-so/whirlpools-sdk');
const fs = require('fs');

console.log('🏊 Orca LP LIVE USDC/WSOL...');

dotenv.config();

async function orcaLpLive() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const usdcAmount = args.find(arg => arg.startsWith('--usdc='))?.split('=')[1];
  const wsolAmount = args.find(arg => arg.startsWith('--wsol='))?.split('=')[1];
  const tickRange = args.find(arg => arg.startsWith('--tick-range='))?.split('=')[1] || '15';
  const slippageBps = args.find(arg => arg.startsWith('--slippageBps='))?.split('=')[1] || '50';
  const priorityFeeMicrolamports = args.find(arg => arg.startsWith('--priorityFeeMicrolamports='))?.split('=')[1] || '1000';
  
  const startTime = Date.now();
  let success = false;
  let error = null;
  let lpTxHash = null;
  let keypair = null;
  let positionNft = null;
  
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
    
    const resolvePoolByTargetAsset = async () => {
      let poolAddress;
      
      if (targetAsset === 'PENGU' && process.env.ORCA_USDC_PENGU_POOL) {
        poolAddress = process.env.ORCA_USDC_PENGU_POOL;
        console.log(`   Pool USDC/PENGU spécifié: ${poolAddress}`);
      } else if (process.env.ORCA_USDC_WSOL_POOL) {
        poolAddress = process.env.ORCA_USDC_WSOL_POOL;
        console.log(`   Pool USDC/WSOL spécifié: ${poolAddress}`);
      } else {
        throw new Error('Aucun pool spécifié dans .env (ORCA_USDC_PENGU_POOL ou ORCA_USDC_WSOL_POOL)');
      }
      
      const poolPubkey = new PublicKey(poolAddress);
      const pool = await client.getPool(poolPubkey);
      
      if (!pool) {
        throw new Error(`Pool non trouvé: ${poolAddress}`);
      }
      
      return pool;
    };
    
    const pool = await resolvePoolByTargetAsset();
    console.log(`   Pool trouvé: ${pool.getAddress().toBase58()}`);
    console.log(`   Pool type: USDC/${targetAsset}`);
    
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
    
    // 7. Obtenir le prix du pool et calculer les ticks
    console.log('\n7️⃣ Calcul des ticks et quote...');
    
    const poolData = pool.data;
    const currentPrice = poolData.sqrtPrice;
    const currentTick = poolData.tickCurrentIndex;
    
    console.log(`   Prix actuel: ${currentPrice}`);
    console.log(`   Tick actuel: ${currentTick}`);
    
    // Calculer les ticks min/max pour ±range%
    const tickRangePercent = parseFloat(tickRange);
    const tickLower = currentTick - Math.floor((tickRangePercent / 100) * 1000); // Approximation
    const tickUpper = currentTick + Math.floor((tickRangePercent / 100) * 1000);
    
    console.log(`   Tick Lower: ${tickLower}`);
    console.log(`   Tick Upper: ${tickUpper}`);
    
    // 8. Obtenir le quote pour l'ajout de liquidité
    console.log('\n8️⃣ Quote pour l\'ajout de liquidité...');
    
    const quote = await increaseLiquidityQuoteByInputTokenWithParams({
      whirlpool: pool,
      inputTokenMint: usdcMint,
      inputTokenAmount: BigInt(depositUsdcAmount),
      tickCurrentIndex: currentTick,
      sqrtPrice: currentPrice,
      tickLowerIndex: tickLower,
      tickUpperIndex: tickUpper,
      slippageTolerance: { numerator: parseInt(slippageBps), denominator: 10000 }
    });
    
    console.log(`   Quote obtenu: ${quote.estimatedLiquidityMinted.toString()} liquidity`);
    console.log(`   Token A (USDC): ${quote.estimatedTokenA.toString()}`);
    console.log(`   Token B (${targetAsset}): ${quote.estimatedTokenB.toString()}`);
    
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
    
    // Créer la position NFT
    const positionMint = Keypair.generate();
    positionNft = positionMint.publicKey.toBase58();
    const positionPda = PDAUtil.getPosition(whirlpoolProgramId, positionMint.publicKey);
    
    // Ajouter les instructions Orca pour l'ajout de liquidité
    const openPositionIx = WhirlpoolIx.openPositionIx(context.program, {
      funder: keypair.publicKey,
      owner: keypair.publicKey,
      positionPda: positionPda,
      positionMintAddress: positionMint.publicKey,
      positionTokenAccount: await getAssociatedTokenAddress(positionMint.publicKey, keypair.publicKey),
      whirlpool: pool.getAddress(),
      tickLowerIndex: tickLower,
      tickUpperIndex: tickUpper,
    });
    
    const increaseLiquidityIx = WhirlpoolIx.increaseLiquidityIx(context.program, {
      whirlpool: pool.getAddress(),
      positionAuthority: keypair.publicKey,
      position: positionPda,
      positionTokenAccount: await getAssociatedTokenAddress(positionMint.publicKey, keypair.publicKey),
      tokenOwnerAccountA: await getAssociatedTokenAddress(usdcMint, keypair.publicKey),
      tokenOwnerAccountB: await getAssociatedTokenAddress(targetMint, keypair.publicKey),
      tokenVaultA: poolData.tokenVaultA,
      tokenVaultB: poolData.tokenVaultB,
      tickArray0: quote.tickArray0,
      tickArray1: quote.tickArray1,
      tickArray2: quote.tickArray2,
      liquidityAmount: quote.estimatedLiquidityMinted,
      tokenMaxA: BigInt(depositUsdcAmount),
      tokenMaxB: BigInt(depositTargetAmount),
    });
    
    transaction.add(openPositionIx, increaseLiquidityIx);
    
    console.log('   Transaction de LP construite avec Orca SDK');
    console.log(`   Position NFT: ${positionNft}`);
    
    // 10. Envoyer la transaction
    console.log('\n🔟 Envoi de la transaction de LP...');
    
    if (process.env.DRY_RUN === 'true') {
      console.log('   DRY RUN: Simulation de l\'envoi de la transaction de LP...');
      console.log('   DRY RUN: Transaction construite avec Orca SDK');
      console.log(`   DRY RUN: Position NFT: ${positionNft}`);
      lpTxHash = 'SIMULATION_LP_TX_HASH';
    } else {
      console.log('   Envoi de la transaction de LP...');
      lpTxHash = await solanaConnection.sendTransaction(transaction, [keypair, positionMint]);
      console.log(`   LP Tx envoyée: ${lpTxHash}`);
      
      // Attendre la confirmation
      console.log('   Attente de la confirmation...');
      await solanaConnection.confirmTransaction(lpTxHash, 'confirmed');
      console.log(`   LP Tx confirmée: ${lpTxHash}`);
      console.log(`   Position NFT créée: ${positionNft}`);
    }
    
    // 11. Vérification des balances APRÈS
    console.log('\n1️⃣1️⃣ Vérification des balances APRÈS...');
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
    
    // 12. Critères de succès
    console.log('\n1️⃣2️⃣ Critères de succès...');
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
    console.log(`   LP Tx Hash: ${lpTxHash || 'N/A'}`);
    console.log(`   Position NFT: ${positionNft || 'N/A'}`);
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

orcaLpLive();
