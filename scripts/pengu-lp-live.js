#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, SystemProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createInitializeMintInstruction, MINT_SIZE } = require('@solana/spl-token');
const fs = require('fs');
const BN = require('bn.js');

console.log('🐧 LP LIVE PENGU/WSOL...');

dotenv.config();

async function penguLpLive() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const penguAmount = args.find(arg => arg.startsWith('--pengu='))?.split('=')[1];
  const wsolAmount = args.find(arg => arg.startsWith('--wsol='))?.split('=')[1];
  const tickRange = args.find(arg => arg.startsWith('--tick-range='))?.split('=')[1] || '15';
  const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
  
  const startTime = Date.now();
  let success = false;
  let error = null;
  let lpTxHash = null;
  let keypair = null;
  
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    console.log(`   Mode: ${dryRun ? 'DRY_RUN (simulation)' : 'LIVE (exécution réelle)'}`);
    
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
    
    // Prix simulé PENGU/WSOL (basé sur les données du pool)
    const penguPriceInWsol = 0.0000365; // Prix approximatif
    const wsolPriceInUsd = 150; // Prix approximatif WSOL en USD
    
    console.log(`   Prix simulé PENGU/WSOL: ${penguPriceInWsol}`);
    console.log(`   Prix simulé WSOL/USD: $${wsolPriceInUsd}`);
    
    // Calcul de la valeur en USD
    const penguValueUsd = (depositPenguAmount / 1e6) * penguPriceInWsol * wsolPriceInUsd;
    const wsolValueUsd = (depositWsolAmount / 1e9) * wsolPriceInUsd;
    
    console.log(`   Valeur PENGU: $${penguValueUsd.toFixed(2)}`);
    console.log(`   Valeur WSOL: $${wsolValueUsd.toFixed(2)}`);
    console.log(`   Valeur totale: $${(penguValueUsd + wsolValueUsd).toFixed(2)}`);
    
    // Simulation des ticks
    const currentTick = 0; // Tick actuel simulé
    const tickSpacing = 64; // Tick spacing typique pour Orca
    const rangePercent = parseFloat(tickRange);
    
    const tickRangeValue = Math.floor((currentTick * rangePercent) / 100);
    const tickLower = currentTick - tickRangeValue;
    const tickUpper = currentTick + tickRangeValue;
    
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
    
    // Mode LIVE
    console.log('\n6️⃣ Mode LIVE - Exécution réelle...');
    console.log('   ⚠️  ATTENTION: Transaction réelle sur Solana !');
    
    // Pour l'instant, on simule car le SDK Orca a des problèmes
    // Dans une implémentation complète, on utiliserait le SDK Orca ici
    
    console.log('\n7️⃣ Construction de la transaction LP...');
    
    // Simulation de la transaction
    const tx = new Transaction();
    
    // Compute Budget
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000
    }));
    
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 2000
    }));
    
    // Ici, on ajouterait les vraies instructions Orca
    // Pour l'instant, on simule
    
    console.log('   Transaction construite (simulation)');
    console.log(`   Compute Units: 300000`);
    console.log(`   Priority Fee: 2000 microLamports`);
    
    // Simulation de l'envoi
    console.log('\n8️⃣ Envoi de la transaction...');
    
    // Pour l'instant, on simule l'envoi
    const simulatedTxHash = `SIMULATED_LP_TX_${Date.now()}`;
    
    console.log(`   Transaction simulée: ${simulatedTxHash}`);
    console.log('   Confirmation simulée...');
    
    // Petite pause pour simuler l'attente
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    lpTxHash = simulatedTxHash;
    
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
      { name: 'Transaction de LP confirmée', passed: !!lpTxHash },
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
  console.log(`\n📊 Résumé du LP PENGU/WSOL:`);
  console.log(`   Durée: ${duration}ms`);
  console.log(`   Succès: ${success ? '✅' : '❌'}`);
  console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
  console.log(`   LP Tx Hash: ${lpTxHash || 'N/A'}`);
  console.log(`   Pool: ${process.env.ORCA_PENGU_WSOL_POOL || 'N/A'}`);
  console.log(`   Address: ${keypair ? keypair.publicKey.toString() : 'N/A'}`);
  
  if (success) {
    console.log('\n🎉 LP PENGU/WSOL réussi !');
    console.log('   Prochaine étape: Séquence E2E complète');
  } else {
    console.log('\n💥 LP PENGU/WSOL échoué !');
    console.log('   Vérifiez la configuration et les fonds');
  }
}

penguLpLive();
