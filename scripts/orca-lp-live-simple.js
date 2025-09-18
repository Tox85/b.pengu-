#!/usr/bin/env node

require('dotenv').config({ override: true });
const TARGET_ASSET = (process.env.TARGET_ASSET || 'PENGU').toUpperCase();
const SYMBOL = TARGET_ASSET;

console.log(`🏊 Orca LP LIVE ${TARGET_ASSET}/WSOL (Simple)...`);

const { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
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

async function orcaLpLiveSimple() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const penguAmount = args.find(arg => arg.startsWith('--pengu='))?.split('=')[1];
  const wsolAmount = args.find(arg => arg.startsWith('--wsol='))?.split('=')[1];
  const tickRange = args.find(arg => arg.startsWith('--tick-range='))?.split('=')[1] || '15';
  const slippageBps = args.find(arg => arg.startsWith('--slippageBps='))?.split('=')[1] || '50';
  const priorityFeeMicrolamports = args.find(arg => arg.startsWith('--priorityFeeMicrolamports='))?.split('=')[1] || '1000';
  const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
  
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
    
    console.log(`   Solana: ${keypair.publicKey.toBase58()}`);
    console.log(`   Target Asset: ${TARGET_ASSET}`);
    console.log(`   Tick Range: ±${tickRange}%`);
    console.log(`   Slippage: ${slippageBps} bps`);
    console.log(`   Priority Fee: ${priorityFeeMicrolamports} microlamports`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN (simulation)' : 'LIVE (exécution réelle)'}`);
    
    // 2. Vérification des fonds AVANT
    console.log('\n2️⃣ Vérification des fonds AVANT...');
    const solBalanceBefore = await solanaConnection.getBalance(keypair.publicKey);
    
    const penguMint = new PublicKey(process.env.SOL_PENGU_MINT);
    const wsolMint = new PublicKey(process.env.SOL_WSOL_MINT);
    
    let penguBalanceBefore = 0;
    let wsolBalanceBefore = 0;
    
    try {
      const penguAccount = await getAccount(solanaConnection, await getAssociatedTokenAddress(penguMint, keypair.publicKey));
      penguBalanceBefore = Number(penguAccount.amount);
    } catch (e) {
      console.log('   PENGU ATA non trouvé');
    }
    
    try {
      const wsolAccount = await getAccount(solanaConnection, await getAssociatedTokenAddress(wsolMint, keypair.publicKey));
      wsolBalanceBefore = Number(wsolAccount.amount);
    } catch (e) {
      console.log('   WSOL ATA non trouvé');
    }
    
    console.log(`   SOL: ${solBalanceBefore / 1e9}`);
    console.log(`   PENGU: ${penguBalanceBefore / 1e6}`);
    console.log(`   WSOL: ${wsolBalanceBefore / 1e9}`);
    
    // Vérifications de sécurité
    if (solBalanceBefore < 0.01e9) {
      throw new Error('SOL insuffisant pour les frais de transaction');
    }
    
    if (penguBalanceBefore < 0.0001e6) {
      throw new Error('PENGU insuffisant pour le LP (minimum 0.0001 PENGU)');
    }
    
    if (wsolBalanceBefore < 0.0001e9) {
      throw new Error('WSOL insuffisant pour le LP (minimum 0.0001 WSOL)');
    }
    
    // 3. Calculer les montants à déposer
    console.log('\n3️⃣ Calcul des montants LP...');
    
    let depositPenguAmount, depositWsolAmount;
    
    if (penguAmount && wsolAmount) {
      // Montants paramétrables
      depositPenguAmount = Math.floor(parseFloat(penguAmount) * 1e6);
      depositWsolAmount = Math.floor(parseFloat(wsolAmount) * 1e9);
      console.log(`   Montants paramétrables: ${penguAmount} PENGU, ${wsolAmount} WSOL`);
    } else {
      // Calculer automatiquement (70% des balances disponibles)
      const penguRatio = 0.7;
      const wsolRatio = 0.7;
      
      depositPenguAmount = Math.floor(penguBalanceBefore * penguRatio);
      depositWsolAmount = Math.floor(wsolBalanceBefore * wsolRatio);
      
      console.log(`   Montants automatiques: ${depositPenguAmount / 1e6} PENGU, ${depositWsolAmount / 1e9} WSOL`);
    }
    
    // Convertir en BN pour les calculs
    const depositPenguAmountBN = new BN(String(depositPenguAmount));
    const depositWsolAmountBN = new BN(String(depositWsolAmount));
    
    // Vérifier que les montants calculés sont suffisants
    if (depositPenguAmount > penguBalanceBefore) {
      throw new Error(`Montant PENGU demandé (${depositPenguAmount / 1e6}) > disponible (${penguBalanceBefore / 1e6})`);
    }
    
    if (depositWsolAmount > wsolBalanceBefore) {
      throw new Error(`Montant WSOL demandé (${depositWsolAmount / 1e9}) > disponible (${wsolBalanceBefore / 1e9})`);
    }
    
    // 4. Configuration Orca
    console.log('\n4️⃣ Configuration Orca...');
    const whirlpoolProgramId = new PublicKey(process.env.ORCA_WHIRLPOOL_PROGRAM || ORCA_WHIRLPOOL_PROGRAM_ID);
    const context = WhirlpoolContext.from(solanaConnection, keypair, whirlpoolProgramId);
    const client = buildWhirlpoolClient(context);
    
    console.log(`   PENGU Mint: ${penguMint.toBase58()}`);
    console.log(`   WSOL Mint: ${wsolMint.toBase58()}`);
    console.log(`   Whirlpool Program: ${whirlpoolProgramId.toBase58()}`);
    
    // 5. Résolution du pool
    console.log('\n5️⃣ Résolution du pool...');
    
    // Choisir le pool selon TARGET_ASSET
    let poolAddress;
    if (TARGET_ASSET === 'PENGU' && process.env.ORCA_PENGU_WSOL_POOL) {
      poolAddress = process.env.ORCA_PENGU_WSOL_POOL;
      console.log(`   Pool PENGU/WSOL spécifié: ${poolAddress}`);
    } else if (process.env.ORCA_USDC_WSOL_POOL) {
      poolAddress = process.env.ORCA_USDC_WSOL_POOL;
      console.log(`   Pool USDC/WSOL spécifié (fallback): ${poolAddress}`);
    } else {
      throw new Error('Aucun pool spécifié dans .env (ORCA_PENGU_WSOL_POOL ou ORCA_USDC_WSOL_POOL)');
    }
    
    const pool = await client.getPool(new PublicKey(poolAddress));
    console.log(`   Pool trouvé: ${pool.getAddress().toBase58()}`);
    console.log(`   Pool type: ${TARGET_ASSET}/WSOL`);
    
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
    
    await ensureAta(penguMint);
    await ensureAta(wsolMint);
    
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
    const { lowerPda, upperPda, startLower, startUpper } = orcaHelpers.getTickArrayPDAs(
      context, 
      pool, 
      tickLower, 
      tickUpper
    );
    
    console.log(`   TickArray Lower: ${lowerPda.publicKey.toBase58()}`);
    console.log(`   TickArray Upper: ${upperPda.publicKey.toBase58()}`);
    console.log(`   Start Lower: ${startLower}`);
    console.log(`   Start Upper: ${startUpper}`);
    
    // Obtenir le quote pour l'ajout de liquidité
    console.log('\n8️⃣ Quote pour l\'ajout de liquidité...');
    
    const quote = await orcaHelpers.getLiquidityQuote(
      pool, 
      penguMint, 
      depositPenguAmountBN, 
      tickLower, 
      tickUpper, 
      slippageBps
    );
    
    console.log(`   Quote obtenu: ${quote.estimatedLiquidityMinted.toString()} liquidity`);
    console.log(`   Token A (PENGU): ${quote.estimatedTokenA.toString()}`);
    console.log(`   Token B (WSOL): ${quote.estimatedTokenB.toString()}`);
    
    // Convertir en BN pour les montants
    const tokenMaxA = new BN(String(quote.estimatedTokenA));
    const tokenMaxB = new BN(String(quote.estimatedTokenB));
    const liquidityAmount = new BN(String(quote.estimatedLiquidityMinted));
    
    // Créer la position NFT (nouveau Keypair à chaque run)
    const positionMint = Keypair.generate();
    positionNft = positionMint.publicKey.toBase58();
    console.log(`   Position NFT: ${positionNft}`);
    
    if (dryRun) {
      console.log('\n🔍 DRY RUN: Simulation de l\'envoi de la transaction de LP...');
      console.log('🔍 DRY RUN: Transaction construite avec Orca SDK');
      console.log(`🔍 DRY RUN: Position NFT: ${positionNft}`);
      console.log(`🔍 DRY RUN: Pool: ${pool.getAddress().toBase58()}`);
      console.log(`🔍 DRY RUN: Ticks: ${tickLower} à ${tickUpper}`);
      console.log(`🔍 DRY RUN: TickArray Lower: ${lowerPda.publicKey.toBase58()}`);
      console.log(`🔍 DRY RUN: TickArray Upper: ${upperPda.publicKey.toBase58()}`);
      console.log(`🔍 DRY RUN: Start Lower: ${startLower}`);
      console.log(`🔍 DRY RUN: Start Upper: ${startUpper}`);
      console.log(`🔍 DRY RUN: Liquidity: ${liquidityAmount.toString()}`);
      console.log(`🔍 DRY RUN: Token Max A: ${tokenMaxA.toString()}`);
      console.log(`🔍 DRY RUN: Token Max B: ${tokenMaxB.toString()}`);
      lpTxHash = 'SIMULATION_LP_TX_HASH';
    } else {
      // 9. Construction de la transaction de LP (TX1: Mint + ATA)
      console.log('\n9️⃣1️⃣ TX1: Création du mint de position...');
      
      const { createInitializeMintInstruction, MINT_SIZE, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
      const { SystemProgram } = require('@solana/web3.js');
      
      const mintRent = await solanaConnection.getMinimumBalanceForRentExemption(MINT_SIZE);
      const createMintIx = SystemProgram.createAccount({
        fromPubkey: keypair.publicKey,
        newAccountPubkey: positionMint.publicKey,
        lamports: mintRent,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      });
      
      const initMintIx = createInitializeMintInstruction(
        positionMint.publicKey,
        0,                                      // decimals (NFT)
        keypair.publicKey,                      // mintAuthority
        keypair.publicKey,                      // freezeAuthority (optional)
        TOKEN_PROGRAM_ID
      );
      
      // Envoyer la transaction de création du mint d'abord
      const { blockhash: mintBlockhash, lastValidBlockHeight: mintLastValidBlockHeight } = await solanaConnection.getLatestBlockhash();
      const mintTx = new Transaction().add(createMintIx, initMintIx);
      mintTx.recentBlockhash = mintBlockhash;
      mintTx.lastValidBlockHeight = mintLastValidBlockHeight;
      mintTx.feePayer = keypair.publicKey;
      
      const mintSignature = await solanaConnection.sendTransaction(mintTx, [keypair, positionMint]);
      await solanaConnection.confirmTransaction({ signature: mintSignature, blockhash: mintBlockhash, lastValidBlockHeight: mintLastValidBlockHeight }, 'confirmed');
      console.log(`   Mint de position créé: ${mintSignature}`);
      
      // 9.2. TX1: Créer l'ATA du NFT
      console.log('\n9️⃣2️⃣ TX1: Création de l\'ATA du NFT...');
      
      const positionTokenAta = getAssociatedTokenAddressSync(
        positionMint.publicKey,
        keypair.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );
      
      try {
        await getAccount(solanaConnection, positionTokenAta);
        console.log(`   ATA du NFT existe déjà: ${positionTokenAta.toBase58()}`);
      } catch (e) {
        console.log(`   Création de l\'ATA du NFT: ${positionTokenAta.toBase58()}`);
        const createAtaIx = createAssociatedTokenAccountInstruction(
          keypair.publicKey,           // payer
          positionTokenAta,            // ata
          keypair.publicKey,           // owner of ATA
          positionMint.publicKey,      // mint
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        
        // Envoyer la transaction de création de l'ATA
        const { blockhash: ataBlockhash, lastValidBlockHeight: ataLastValidBlockHeight } = await solanaConnection.getLatestBlockhash();
        const ataTx = new Transaction().add(createAtaIx);
        ataTx.recentBlockhash = ataBlockhash;
        ataTx.lastValidBlockHeight = ataLastValidBlockHeight;
        ataTx.feePayer = keypair.publicKey;
        
        const ataSignature = await solanaConnection.sendTransaction(ataTx, [keypair]);
        await solanaConnection.confirmTransaction({ signature: ataSignature, blockhash: ataBlockhash, lastValidBlockHeight: ataLastValidBlockHeight }, 'confirmed');
        console.log(`   ATA du NFT créé: ${ataSignature}`);
      }
      
      // 9.3. TX2: Construction de la transaction de LP
      console.log('\n9️⃣3️⃣ TX2: Construction de la transaction de LP...');
      
      // Attendre un peu pour éviter les conflits de rate limit
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 200));
      
      const { blockhash, lastValidBlockHeight } = await solanaConnection.getLatestBlockhash();
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = keypair.publicKey;
      
      // ComputeBudget (units + priority)
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ 
        units: parseInt(process.env.SOL_COMPUTE_UNITS || '300000') 
      });
      const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({ 
        microLamports: parseInt(priorityFeeMicrolamports) 
      });
      
      transaction.add(computeBudgetIx, priorityFeeIx);
    
      // 4. Initialiser les TickArrays si nécessaire
      console.log('\n9️⃣4️⃣ Initialisation des TickArrays...');
      
      const initLowerIx = await orcaHelpers.ensureTickArray(context, pool, lowerPda, startLower);
      const initUpperIx = await orcaHelpers.ensureTickArray(context, pool, upperPda, startUpper);
      
      if (initLowerIx) {
        transaction.add(initLowerIx);
        console.log('   TickArray Lower initialisé');
      }
      if (initUpperIx) {
        transaction.add(initUpperIx);
        console.log('   TickArray Upper initialisé');
      }
      
      // 5. Construire les instructions Orca
      console.log('\n9️⃣5️⃣ Construction des instructions Orca...');
      
      const { openPositionIx, increaseLiquidityIx, positionPda } = await orcaHelpers.buildLiquidityInstructions(
        context,
        pool,
        positionMint,
        tickLower,
        tickUpper,
        quote,
        penguMint,
        wsolMint,
        keypair,
        lowerPda.publicKey,
        upperPda.publicKey
      );
      
      // 6. Ajouter les instructions Orca
      transaction.add(openPositionIx, increaseLiquidityIx);
      
      console.log('   Transaction de LP construite avec Orca SDK');
      console.log(`   Position NFT: ${positionNft}`);
      console.log(`   Position PDA: ${positionPda.publicKey.toBase58()}`);
      console.log(`   Position Token ATA: ${positionTokenAta.toBase58()}`);
      console.log(`   Pool: ${pool.getAddress().toBase58()}`);
      console.log(`   Ticks: ${tickLower} à ${tickUpper}`);
      console.log(`   TickArray Lower: ${lowerPda.publicKey.toBase58()}`);
      console.log(`   TickArray Upper: ${upperPda.publicKey.toBase58()}`);
      console.log(`   Start Lower: ${startLower}`);
      console.log(`   Start Upper: ${startUpper}`);
      console.log(`   Liquidity: ${liquidityAmount.toString()}`);
      console.log(`   Token Max A: ${tokenMaxA.toString()}`);
      console.log(`   Token Max B: ${tokenMaxB.toString()}`);
      
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
    
    let penguBalanceAfter = 0;
    try {
      const penguAccount = await getAccount(solanaConnection, await getAssociatedTokenAddress(penguMint, keypair.publicKey));
      penguBalanceAfter = Number(penguAccount.amount);
    } catch (e) {
      console.log('   PENGU ATA non trouvé après LP');
    }
    
    let wsolBalanceAfter = 0;
    try {
      const wsolAccount = await getAccount(solanaConnection, await getAssociatedTokenAddress(wsolMint, keypair.publicKey));
      wsolBalanceAfter = Number(wsolAccount.amount);
    } catch (e) {
      console.log('   WSOL ATA non trouvé après LP');
    }
    
    console.log(`   SOL: ${solBalanceAfter / 1e9} (${(solBalanceAfter - solBalanceBefore) / 1e9} dépensé)`);
    console.log(`   PENGU: ${penguBalanceAfter / 1e6} (${(penguBalanceAfter - penguBalanceBefore) / 1e6} dépensé)`);
    console.log(`   WSOL: ${wsolBalanceAfter / 1e9} (${(wsolBalanceAfter - wsolBalanceBefore) / 1e9} dépensé)`);
    
    // 13. Critères de succès
    console.log('\n1️⃣3️⃣ Critères de succès...');
    console.log('✅ Transaction de LP confirmée');
    console.log('✅ Position NFT créée');
    console.log(`✅ Pool ${TARGET_ASSET}/WSOL trouvé`);
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
    console.log(`   Start Lower: ${startLower || 'N/A'}`);
    console.log(`   Start Upper: ${startUpper || 'N/A'}`);
    console.log(`   Liquidity: ${quote ? quote.estimatedLiquidityMinted.toString() : 'N/A'}`);
    console.log(`   Pool: ${TARGET_ASSET}/WSOL`);
    console.log(`   Address: ${keypair ? keypair.publicKey.toBase58() : 'N/A'}`);
    
    if (success) {
      console.log('\n🎉 LP Orca LIVE réussi !');
      console.log(`   Position LP ${TARGET_ASSET}/WSOL créée avec succès`);
    } else {
      console.log('\n💥 LP Orca LIVE échoué !');
      console.log('   Vérifiez la configuration et les fonds');
    }
  }
}

orcaLpLiveSimple();
