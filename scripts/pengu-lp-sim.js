#!/usr/bin/env node

require('dotenv').config({ override: true });
const TARGET_ASSET = (process.env.TARGET_ASSET || 'PENGU').toUpperCase();

console.log(`🏊 LP Simulation PENGU/WSOL (${process.env.DRY_RUN==='true'?'DRY RUN':'LIVE'})`);

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');
const axios = require('axios');

// Parse command line arguments
const args = process.argv.slice(2);
const penguAmount = args.find(arg => arg.startsWith('--pengu='))?.split('=')[1];
const wsolAmount = args.find(arg => arg.startsWith('--wsol='))?.split('=')[1];
const tickRange = args.find(arg => arg.startsWith('--tick-range='))?.split('=')[1] || '15';
const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';

async function penguLpSimulation() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  let keypair = null;
  let poolInfo = null;
  let positionInfo = null;
  
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toBase58()}`);
    console.log(`   Target Asset: ${TARGET_ASSET}`);
    console.log(`   Tick Range: ±${tickRange}%`);
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
    
    // Vérifier que les montants calculés sont suffisants
    if (depositPenguAmount > penguBalanceBefore) {
      throw new Error(`Montant PENGU demandé (${depositPenguAmount / 1e6}) > disponible (${penguBalanceBefore / 1e6})`);
    }
    
    if (depositWsolAmount > wsolBalanceBefore) {
      throw new Error(`Montant WSOL demandé (${depositWsolAmount / 1e9}) > disponible (${wsolBalanceBefore / 1e9})`);
    }
    
    // 4. Récupérer les informations du pool PENGU/WSOL
    console.log('\n4️⃣ Récupération des informations du pool...');
    
    const poolAddress = process.env.ORCA_PENGU_WSOL_POOL;
    if (!poolAddress) {
      throw new Error('ORCA_PENGU_WSOL_POOL non défini dans .env');
    }
    
    console.log(`   Pool PENGU/WSOL: ${poolAddress}`);
    
    // Simulation des données du pool (sans SDK Orca)
    poolInfo = {
      address: poolAddress,
      tokenA: {
        mint: penguMint.toBase58(),
        symbol: 'PENGU',
        decimals: 6
      },
      tokenB: {
        mint: wsolMint.toBase58(),
        symbol: 'WSOL',
        decimals: 9
      },
      tickSpacing: 64, // Valeur typique pour PENGU/WSOL
      sqrtPrice: '79228162514264337593543950336', // Prix simulé
      liquidity: '1000000000000', // Liquidité simulée
      tickCurrentIndex: 0 // Tick actuel simulé
    };
    
    console.log(`   Token A: ${poolInfo.tokenA.symbol} (${poolInfo.tokenA.mint})`);
    console.log(`   Token B: ${poolInfo.tokenB.symbol} (${poolInfo.tokenB.mint})`);
    console.log(`   Tick Spacing: ${poolInfo.tickSpacing}`);
    console.log(`   Prix actuel: ${poolInfo.sqrtPrice}`);
    console.log(`   Liquidité: ${poolInfo.liquidity}`);
    
    // 5. Calcul des ticks et TickArrays
    console.log('\n5️⃣ Calcul des ticks et TickArrays...');
    
    const tickRangePercent = parseFloat(tickRange);
    const currentTick = poolInfo.tickCurrentIndex;
    const tickSpacing = poolInfo.tickSpacing;
    
    // Calculer les ticks alignés
    const rangeTicks = Math.floor((tickRangePercent / 100) * 1000);
    const tickLower = Math.floor((currentTick - rangeTicks) / tickSpacing) * tickSpacing;
    const tickUpper = Math.ceil((currentTick + rangeTicks) / tickSpacing) * tickSpacing;
    
    console.log(`   Tick Lower: ${tickLower}`);
    console.log(`   Tick Upper: ${tickUpper}`);
    console.log(`   Range: ±${tickRangePercent}%`);
    
    // Calculer les startTick pour les TickArrays
    const startTick = (tick) => Math.floor(tick / tickSpacing / 88) * tickSpacing * 88;
    const startLower = startTick(tickLower);
    const startUpper = startTick(tickUpper);
    
    console.log(`   Start Lower: ${startLower}`);
    console.log(`   Start Upper: ${startUpper}`);
    
    // 6. Simulation de la position NFT
    console.log('\n6️⃣ Simulation de la position NFT...');
    
    const positionMint = 'SIMULATED_POSITION_MINT_' + Date.now();
    const positionPda = 'SIMULATED_POSITION_PDA_' + Date.now();
    const positionTokenAta = 'SIMULATED_POSITION_ATA_' + Date.now();
    
    console.log(`   Position Mint: ${positionMint}`);
    console.log(`   Position PDA: ${positionPda}`);
    console.log(`   Position Token ATA: ${positionTokenAta}`);
    
    // 7. Simulation de la liquidité
    console.log('\n7️⃣ Simulation de la liquidité...');
    
    // Calculer la liquidité simulée basée sur les montants
    const simulatedLiquidity = Math.floor((depositPenguAmount + depositWsolAmount) * 0.8);
    const priceImpact = Math.random() * 0.1; // 0-0.1% impact simulé
    
    console.log(`   Liquidité simulée: ${simulatedLiquidity}`);
    console.log(`   Price Impact: ${priceImpact.toFixed(4)}%`);
    console.log(`   PENGU déposé: ${depositPenguAmount / 1e6}`);
    console.log(`   WSOL déposé: ${depositWsolAmount / 1e9}`);
    
    // 8. Simulation des frais
    console.log('\n8️⃣ Simulation des frais...');
    
    const computeUnits = parseInt(process.env.SOL_COMPUTE_UNITS || '300000');
    const priorityFee = parseInt(process.env.SOL_MICRO_LAMPORTS || '2000');
    const estimatedFees = (computeUnits * priorityFee) / 1e6; // Convertir en SOL
    
    console.log(`   Compute Units: ${computeUnits}`);
    console.log(`   Priority Fee: ${priorityFee} microLamports`);
    console.log(`   Frais estimés: ${estimatedFees} SOL`);
    
    // 9. Résumé de la simulation
    console.log('\n9️⃣ Résumé de la simulation...');
    
    positionInfo = {
      positionMint,
      positionPda,
      positionTokenAta,
      tickLower,
      tickUpper,
      startLower,
      startUpper,
      liquidity: simulatedLiquidity,
      penguAmount: depositPenguAmount,
      wsolAmount: depositWsolAmount,
      priceImpact,
      estimatedFees
    };
    
    console.log('✅ Simulation LP PENGU/WSOL terminée');
    console.log(`   Pool: ${poolInfo.address}`);
    console.log(`   Position: ${positionInfo.positionMint}`);
    console.log(`   Ticks: ${positionInfo.tickLower} à ${positionInfo.tickUpper}`);
    console.log(`   Liquidité: ${positionInfo.liquidity}`);
    console.log(`   Montants: ${positionInfo.penguAmount / 1e6} PENGU + ${positionInfo.wsolAmount / 1e9} WSOL`);
    console.log(`   Frais: ${positionInfo.estimatedFees} SOL`);
    
    success = true;
    
  } catch (err) {
    error = err;
    console.error('❌ Erreur:', err.message);
  } finally {
    const duration = Date.now() - startTime;
    console.log('\n📊 Résumé de la simulation LP:');
    console.log(`   Durée: ${duration}ms`);
    console.log(`   Succès: ${success ? '✅' : '❌'}`);
    console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
    console.log(`   Pool: ${poolInfo ? poolInfo.address : 'N/A'}`);
    console.log(`   Position: ${positionInfo ? positionInfo.positionMint : 'N/A'}`);
    console.log(`   Ticks: ${positionInfo ? `${positionInfo.tickLower} à ${positionInfo.tickUpper}` : 'N/A'}`);
    console.log(`   Liquidité: ${positionInfo ? positionInfo.liquidity : 'N/A'}`);
    console.log(`   PENGU: ${positionInfo ? positionInfo.penguAmount / 1e6 : 'N/A'}`);
    console.log(`   WSOL: ${positionInfo ? positionInfo.wsolAmount / 1e9 : 'N/A'}`);
    console.log(`   Address: ${keypair?.publicKey?.toBase58() || 'N/A'}`);
    
    if (success) {
      console.log('\n🎉 Simulation LP PENGU/WSOL réussie !');
      console.log('   Prêt pour le mode LIVE');
    } else {
      console.log('\n💥 Simulation LP PENGU/WSOL échouée !');
      console.log('   Vérifiez la configuration et les fonds');
    }
  }
}

penguLpSimulation();
