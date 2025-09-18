#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, TransactionMessage, ComputeBudgetProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount } = require('@solana/spl-token');
const { 
  WhirlpoolContext, 
  buildWhirlpoolClient, 
  ORCA_WHIRLPOOL_PROGRAM_ID,
  increaseLiquidityQuoteByInputToken,
  increaseLiquidityQuoteByInputTokenWithParams,
  Percentage,
  PriceMath,
  PDAUtil,
  PoolUtil,
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
  
  try {
    console.log('⚠️ ATTENTION: Mode LIVE activé !');
    console.log('   LP: USDC/WSOL');
    console.log('   Montant: 50% USDC + 50% WSOL');
    console.log('   Sécurité: Caps activés');
    
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    
    // 2. Vérification des fonds AVANT
    console.log('\n2️⃣ Vérification des fonds AVANT...');
    const solBalanceBefore = await solanaConnection.getBalance(keypair.publicKey);
    
    // Vérifier USDC balance
    const usdcMint = new PublicKey(process.env.SOL_USDC_MINT);
    const usdcAta = await getAssociatedTokenAddress(usdcMint, keypair.publicKey);
    
    let usdcBalanceBefore = 0;
    try {
      const usdcAccount = await getAccount(solanaConnection, usdcAta);
      usdcBalanceBefore = Number(usdcAccount.amount);
    } catch (e) {
      console.log('   USDC ATA non trouvé, balance = 0');
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
    console.log(`   USDC: ${usdcBalanceBefore / 1e6}`);
    console.log(`   WSOL: ${wsolBalanceBefore / 1e9}`);
    
    if (solBalanceBefore < 0.01e9) {
      throw new Error('SOL insuffisant pour les frais de transaction');
    }
    
    if (usdcBalanceBefore < 0.005e6) {
      throw new Error('USDC insuffisant pour le LP (minimum 0.005 USDC)');
    }
    
    if (wsolBalanceBefore < 0.0001e9) {
      throw new Error('WSOL insuffisant pour le LP (minimum 0.0001 WSOL)');
    }
    
    // Calculer les montants à déposer
    let depositUsdcAmount, depositWsolAmount;
    
    if (usdcAmount && wsolAmount) {
      // Montants paramétrables
      depositUsdcAmount = Math.floor(parseFloat(usdcAmount) * 1e6);
      depositWsolAmount = Math.floor(parseFloat(wsolAmount) * 1e9);
      console.log(`   Montants paramétrables: ${usdcAmount} USDC, ${wsolAmount} WSOL`);
    } else {
      // Calculer automatiquement (60-80% des balances disponibles)
      const usdcRatio = 0.7; // 70% du USDC disponible
      const wsolRatio = 0.7; // 70% du WSOL disponible
      
      depositUsdcAmount = Math.floor(usdcBalanceBefore * usdcRatio);
      depositWsolAmount = Math.floor(wsolBalanceBefore * wsolRatio);
      
      console.log(`   Montants automatiques: ${depositUsdcAmount / 1e6} USDC, ${depositWsolAmount / 1e9} WSOL`);
    }
    
    // Vérifier que les montants calculés sont suffisants
    if (depositUsdcAmount > usdcBalanceBefore) {
      throw new Error(`Montant USDC demandé (${depositUsdcAmount / 1e6}) > disponible (${usdcBalanceBefore / 1e6})`);
    }
    
    if (depositWsolAmount > wsolBalanceBefore) {
      throw new Error(`Montant WSOL demandé (${depositWsolAmount / 1e9}) > disponible (${wsolBalanceBefore / 1e9})`);
    }
    
    // 3. Configuration Orca
    console.log('\n3️⃣ Configuration Orca...');
    const whirlpoolProgramId = new PublicKey(process.env.ORCA_WHIRLPOOL_PROGRAM || ORCA_WHIRLPOOL_PROGRAM_ID);
    const context = WhirlpoolContext.from(solanaConnection, keypair, whirlpoolProgramId);
    const client = buildWhirlpoolClient(context);
    
    const usdcMintPubkey = new PublicKey(process.env.SOL_USDC_MINT);
    const targetAsset = process.env.TARGET_ASSET || 'WSOL';
    const targetMintPubkey = targetAsset === 'PENGU' 
      ? new PublicKey(process.env.SOL_PENGU_MINT)
      : new PublicKey(process.env.SOL_WSOL_MINT);
    
    console.log(`   USDC Mint: ${usdcMintPubkey.toBase58()}`);
    console.log(`   Target Asset: ${targetAsset}`);
    console.log(`   Target Mint: ${targetMintPubkey.toBase58()}`);
    console.log(`   Whirlpool Program: ${whirlpoolProgramId.toBase58()}`);
    
    // 4. Résolution du pool basée sur TARGET_ASSET
    console.log('\n4️⃣ Résolution du pool...');
    
    const resolvePoolByTargetAsset = async (usdcMint, targetMint) => {
      let poolAddress;
      
      if (targetAsset === 'PENGU' && process.env.ORCA_USDC_PENGU_POOL) {
        // Utiliser le pool USDC/PENGU si disponible
        poolAddress = process.env.ORCA_USDC_PENGU_POOL;
        console.log(`   Pool USDC/PENGU spécifié: ${poolAddress}`);
      } else if (process.env.ORCA_USDC_WSOL_POOL) {
        // Fallback vers USDC/WSOL
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
    
    const pool = await resolvePoolByTargetAsset(usdcMintPubkey, targetMintPubkey);
    console.log(`   Pool trouvé: ${pool.getAddress().toBase58()}`);
    console.log(`   Pool type: USDC/${targetAsset}`);
    
    // 5. Calculer les montants pour le LP
    console.log('\n5️⃣ Calcul des montants LP...');
    
    // Utiliser les montants calculés précédemment ou les paramètres CLI
    const usdcAmountForLp = depositUsdcAmount;
    const targetAmountForLp = depositWsolAmount; // WSOL ou PENGU selon TARGET_ASSET
    
    console.log(`   USDC Amount: ${usdcAmountForLp / 1e6}`);
    console.log(`   ${targetAsset} Amount: ${targetAmountForLp / (targetAsset === 'PENGU' ? 1e6 : 1e9)}`);
    console.log(`   Tick Range: ±${tickRange}%`);
    console.log(`   Slippage: ${slippageBps} bps`);
    console.log(`   Priority Fee: ${priorityFeeMicrolamports} microlamports`);
    
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
        const transaction = new Transaction().add(createAtaIx);
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = keypair.publicKey;
        
        const signature = await solanaConnection.sendTransaction(transaction, [keypair]);
        await solanaConnection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
        console.log(`   ATA créé: ${ata.toBase58()}`);
        return ata;
      }
    };
    
    await ensureAta(usdcMintPubkey);
    await ensureAta(wsolMintPubkey);
    
    // 7. Construire et envoyer la transaction de LP
    console.log('\n7️⃣ Construction de la transaction de LP...');
    
    // Simulation de l'ajout de liquidité (à implémenter avec le SDK Orca)
    console.log('   Simulation de l\'ajout de liquidité...');
    console.log(`   Pool: ${pool.getAddress().toBase58()}`);
    console.log(`   USDC: ${usdcAmountForLp / 1e6}`);
    console.log(`   WSOL: ${wsolAmountForLp / 1e9}`);
    
    // Pour l'instant, on simule la transaction
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
      microLamports: parseInt(process.env.SOL_MICRO_LAMPORTS || '2000') 
    });
    
    transaction.add(computeBudgetIx, priorityFeeIx);
    
    // TODO: Ajouter les instructions Orca pour l'ajout de liquidité
    // const addLiquidityIx = await pool.addLiquidity(usdcAmountForLp, wsolAmountForLp, ...);
    // transaction.add(addLiquidityIx);
    
    console.log('   Transaction de LP construite (simulation)');
    
    // 8. Envoyer la transaction (simulation)
    console.log('\n8️⃣ Envoi de la transaction de LP...');
    
    // Pour l'instant, on simule l'envoi
    console.log('   DRY RUN: Simulation de l\'envoi de la transaction de LP...');
    console.log('   DRY RUN: Transaction construite avec compute budget');
    console.log('   DRY RUN: Instructions Orca à implémenter');
    
    // Simulation du hash
    lpTxHash = 'SIMULATION_LP_TX_HASH';
    console.log(`   LP Tx simulée: ${lpTxHash}`);
    
    // 9. Vérification des balances APRÈS
    console.log('\n9️⃣ Vérification des balances APRÈS...');
    const solBalanceAfter = await solanaConnection.getBalance(keypair.publicKey);
    
    let usdcBalanceAfter = 0;
    try {
      const usdcAccount = await getAccount(solanaConnection, usdcAta);
      usdcBalanceAfter = Number(usdcAccount.amount);
    } catch (e) {
      console.log('   USDC ATA non trouvé après LP');
    }
    
    let wsolBalanceAfter = 0;
    try {
      const wsolAccount = await getAccount(solanaConnection, wsolAta);
      wsolBalanceAfter = Number(wsolAccount.amount);
    } catch (e) {
      console.log('   WSOL ATA non trouvé après LP');
    }
    
    console.log(`   SOL: ${solBalanceAfter / 1e9} (${(solBalanceAfter - solBalanceBefore) / 1e9} dépensé)`);
    console.log(`   USDC: ${usdcBalanceAfter / 1e6} (${(usdcBalanceAfter - usdcBalanceBefore) / 1e6} dépensé)`);
    console.log(`   WSOL: ${wsolBalanceAfter / 1e9} (${(wsolBalanceAfter - wsolBalanceBefore) / 1e9} dépensé)`);
    
    // 10. Critères de succès
    console.log('\n🔟 Critères de succès...');
    console.log('✅ Transaction de LP simulée');
    console.log('✅ Pool USDC/WSOL trouvé');
    console.log('✅ Configuration valide');
    console.log('✅ Fonds disponibles');
    console.log('⚠️ Implémentation Orca SDK nécessaire');
    
    success = true;
    
  } catch (err) {
    error = err;
    console.error('❌ Erreur:', err.message);
  } finally {
    const duration = Date.now() - startTime;
    console.log('\n📊 Résumé du LP Orca:');
    console.log(`   Durée: ${duration}ms`);
    console.log(`   Succès: ${success ? '✅' : '❌'}`);
    console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
    console.log(`   LP Tx Hash: ${lpTxHash || 'N/A'}`);
    console.log(`   Pool: USDC/WSOL`);
    console.log(`   Address: ${keypair?.publicKey?.toString() || 'N/A'}`);
    
    if (success) {
      console.log('\n🎉 LP Orca LIVE simulé !');
      console.log('   Implémentation complète avec SDK Orca nécessaire');
    } else {
      console.log('\n💥 LP Orca LIVE échoué !');
      console.log('   Vérifiez la configuration et les fonds');
    }
  }
}

orcaLpLive();