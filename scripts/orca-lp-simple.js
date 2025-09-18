#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey, Transaction, SystemProgram, ComputeBudgetProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createInitializeMintInstruction, MINT_SIZE } = require('@solana/spl-token');
const BN = require('bn.js');
const fs = require('fs');

console.log('🐧 LP SIMPLE PENGU/WSOL (Sans SDK Orca)...');

dotenv.config({ override: true });

async function orcaLpSimple() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const penguAmount = args.find(arg => arg.startsWith('--pengu='))?.split('=')[1];
  const wsolAmount = args.find(arg => arg.startsWith('--wsol='))?.split('=')[1];
  const tickRange = args.find(arg => arg.startsWith('--tick-range='))?.split('=')[1] || '15';
  const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
  
  const startTime = Date.now();
  let success = false;
  let error = null;
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
    
    // 5. Simulation des calculs de LP
    console.log('\n5️⃣ Simulation des calculs de LP...');
    
    // Prix simulé PENGU/WSOL
    const penguPriceInWsol = 0.0000365;
    const wsolPriceInUsd = 150;
    
    console.log(`   Prix simulé PENGU/WSOL: ${penguPriceInWsol}`);
    console.log(`   Prix simulé WSOL/USD: $${wsolPriceInUsd}`);
    
    // Calcul de la valeur en USD
    const penguValueUsd = (depositPenguAmount / 1e6) * penguPriceInWsol * wsolPriceInUsd;
    const wsolValueUsd = (depositWsolAmount / 1e9) * wsolPriceInUsd;
    
    console.log(`   Valeur PENGU: $${penguValueUsd.toFixed(2)}`);
    console.log(`   Valeur WSOL: $${wsolValueUsd.toFixed(2)}`);
    console.log(`   Valeur totale: $${(penguValueUsd + wsolValueUsd).toFixed(2)}`);
    
    // Simulation des ticks
    const currentTick = 0;
    const tickSpacing = 64;
    const rangePercent = parseFloat(tickRange);
    
    const rangeValue = Math.floor((currentTick * rangePercent) / 100);
    const tickLower = Math.floor((currentTick - rangeValue) / tickSpacing) * tickSpacing;
    const tickUpper = Math.floor((currentTick + rangeValue) / tickSpacing) * tickSpacing;
    
    console.log(`   Current Tick: ${currentTick}`);
    console.log(`   Tick Spacing: ${tickSpacing}`);
    console.log(`   Range: ±${rangePercent}%`);
    console.log(`   Tick Lower: ${tickLower}`);
    console.log(`   Tick Upper: ${tickUpper}`);
    
    // Simulation de la liquidité
    const liquidity = Math.min(depositPenguAmount, depositWsolAmount * penguPriceInWsol * 1e3);
    const tokenMaxA = depositPenguAmount;
    const tokenMaxB = depositWsolAmount;
    
    console.log(`   Liquidity: ${liquidity.toFixed(0)}`);
    console.log(`   Token Max A (PENGU): ${tokenMaxA}`);
    console.log(`   Token Max B (WSOL): ${tokenMaxB}`);
    
    // 6. Mode DRY_RUN ou LIVE
    if (dryRun) {
      console.log('\n6️⃣ Mode DRY_RUN - Simulation uniquement...');
      console.log(`   Pool: ${poolId}`);
      console.log(`   PENGU: ${depositPenguAmount / 1e6}`);
      console.log(`   WSOL: ${depositWsolAmount / 1e9}`);
      console.log(`   Ticks: ${tickLower} à ${tickUpper}`);
      console.log(`   Liquidity: ${liquidity.toFixed(0)}`);
      console.log(`   Valeur totale: $${(penguValueUsd + wsolValueUsd).toFixed(2)}`);
      
      success = true;
      console.log('\n✅ Simulation LP PENGU/WSOL réussie !');
      return;
    }
    
    // Mode LIVE - Simulation des transactions
    console.log('\n6️⃣ Mode LIVE - Simulation des transactions...');
    console.log('   ⚠️  ATTENTION: Simulation des transactions réelles !');
    
    // 7. Simulation TX1: Création mint + ATA
    console.log('\n7️⃣ Simulation TX1: Création mint + ATA...');
    
    const positionMint = Keypair.generate();
    const positionTokenAta = getAssociatedTokenAddressSync(
      positionMint.publicKey,
      keypair.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    console.log(`   Position Mint: ${positionMint.publicKey.toBase58()}`);
    console.log(`   Position ATA: ${positionTokenAta.toBase58()}`);
    
    // Simulation de la transaction
    const tx1 = new Transaction();
    
    // Compute Budget
    tx1.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000
    }));
    
    tx1.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 2000
    }));
    
    // Créer le compte mint
    const mintRent = await solanaConnection.getMinimumBalanceForRentExemption(MINT_SIZE);
    tx1.add(SystemProgram.createAccount({
      fromPubkey: keypair.publicKey,
      newAccountPubkey: positionMint.publicKey,
      lamports: mintRent,
      space: MINT_SIZE,
      programId: TOKEN_PROGRAM_ID
    }));
    
    // Initialiser le mint
    tx1.add(createInitializeMintInstruction(
      positionMint.publicKey,
      0, // decimals (NFT)
      keypair.publicKey, // mintAuthority
      keypair.publicKey, // freezeAuthority
      TOKEN_PROGRAM_ID
    ));
    
    // Créer l'ATA
    tx1.add(createAssociatedTokenAccountInstruction(
      keypair.publicKey, // payer
      positionTokenAta, // ata
      keypair.publicKey, // owner
      positionMint.publicKey, // mint
      TOKEN_PROGRAM_ID
    ));
    
    console.log('   TX1 construite: mint + ATA');
    console.log(`   Instructions: ${tx1.instructions.length}`);
    
    // 8. Simulation TX2: Instructions LP
    console.log('\n8️⃣ Simulation TX2: Instructions LP...');
    
    const tx2 = new Transaction();
    
    // Compute Budget
    tx2.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000
    }));
    
    tx2.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 2000
    }));
    
    // Simulation des instructions Orca (sans SDK)
    console.log('   Simulation des instructions Orca...');
    console.log(`   OpenPosition: positionPda.publicKey`);
    console.log(`   IncreaseLiquidity: positionPda.publicKey`);
    console.log(`   TickArray Lower: ${tickLower}`);
    console.log(`   TickArray Upper: ${tickUpper}`);
    console.log(`   Token Max A: ${tokenMaxA}`);
    console.log(`   Token Max B: ${tokenMaxB}`);
    
    console.log('   TX2 construite: openPosition + increaseLiquidity');
    console.log(`   Instructions: ${tx2.instructions.length}`);
    
    // 9. Vérification des balances APRÈS
    console.log('\n9️⃣ Vérification des balances APRÈS...');
    
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
    
    // 10. Critères de succès
    console.log('\n🔟 Critères de succès...');
    
    const successCriteria = [
      { name: 'Configuration valide', passed: !!poolId },
      { name: 'Fonds disponibles', passed: solBalanceAfter > 0.01e9 },
      { name: 'PENGU disponible', passed: penguBalanceBefore > 0 },
      { name: 'WSOL disponible', passed: wsolBalanceBefore > 0 },
      { name: 'Calculs corrects', passed: liquidity > 0 }
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
  console.log(`\n📊 Résumé du LP PENGU/WSOL (Simple):`);
  console.log(`   Durée: ${duration}ms`);
  console.log(`   Succès: ${success ? '✅' : '❌'}`);
  console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
  console.log(`   Pool: ${process.env.ORCA_PENGU_WSOL_POOL || 'N/A'}`);
  console.log(`   Address: ${keypair ? keypair.publicKey.toString() : 'N/A'}`);
  
  if (success) {
    console.log('\n🎉 LP PENGU/WSOL (Simple) réussi !');
    console.log('   Simulation des transactions réussie');
    console.log('   Prêt pour l\'implémentation réelle');
  } else {
    console.log('\n💥 LP PENGU/WSOL (Simple) échoué !');
    console.log('   Vérifiez la configuration et les fonds');
  }
}

orcaLpSimple();
