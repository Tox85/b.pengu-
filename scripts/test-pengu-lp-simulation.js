#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');

console.log('🐧 Simulation LP PENGU/WSOL...');

dotenv.config();

// Forcer la variable d'environnement
process.env.ORCA_PENGU_WSOL_POOL = 'FAqh648xeeaTqL7du49sztp9nfj5PjRQrfvaMccyd9cz';

async function testPenguLpSimulation() {
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    console.log(`   Pool ID: ${process.env.ORCA_PENGU_WSOL_POOL}`);
    
    // 2. Vérification des fonds
    console.log('\n2️⃣ Vérification des fonds...');
    const solBalance = await solanaConnection.getBalance(keypair.publicKey);
    
    const penguMint = new PublicKey(process.env.SOL_PENGU_MINT);
    const wsolMint = new PublicKey(process.env.SOL_WSOL_MINT);
    
    const penguAta = await getAssociatedTokenAddress(penguMint, keypair.publicKey);
    const wsolAta = await getAssociatedTokenAddress(wsolMint, keypair.publicKey);
    
    let penguBalance = 0;
    let wsolBalance = 0;
    
    try {
      const penguAccount = await getAccount(solanaConnection, penguAta);
      penguBalance = Number(penguAccount.amount);
    } catch (e) {
      console.log('   PENGU ATA non trouvé');
    }
    
    try {
      const wsolAccount = await getAccount(solanaConnection, wsolAta);
      wsolBalance = Number(wsolAccount.amount);
    } catch (e) {
      console.log('   WSOL ATA non trouvé');
    }
    
    console.log(`   SOL: ${solBalance / 1e9}`);
    console.log(`   PENGU: ${penguBalance / 1e6}`);
    console.log(`   WSOL: ${wsolBalance / 1e9}`);
    
    // 3. Simulation du LP
    console.log('\n3️⃣ Simulation du LP PENGU/WSOL...');
    
    // Montants pour LP (50% de chaque balance)
    const penguAmount = Math.floor(penguBalance * 0.5);
    const wsolAmount = Math.floor(wsolBalance * 0.5);
    
    console.log(`   Montants pour LP:`);
    console.log(`   - PENGU: ${penguAmount / 1e6} (50% du balance)`);
    console.log(`   - WSOL: ${wsolAmount / 1e9} (50% du balance)`);
    
    // Simulation des calculs de LP
    console.log('\n4️⃣ Simulation des calculs de LP...');
    
    // Prix simulé PENGU/WSOL (basé sur les données du pool)
    const penguPriceInWsol = 0.0000365; // Prix approximatif basé sur les données du pool
    const wsolPriceInUsd = 150; // Prix approximatif WSOL en USD
    
    console.log(`   Prix simulé PENGU/WSOL: ${penguPriceInWsol}`);
    console.log(`   Prix simulé WSOL/USD: $${wsolPriceInUsd}`);
    
    // Calcul de la valeur en USD
    const penguValueUsd = (penguAmount / 1e6) * penguPriceInWsol * wsolPriceInUsd;
    const wsolValueUsd = (wsolAmount / 1e9) * wsolPriceInUsd;
    
    console.log(`   Valeur PENGU: $${penguValueUsd.toFixed(2)}`);
    console.log(`   Valeur WSOL: $${wsolValueUsd.toFixed(2)}`);
    console.log(`   Valeur totale: $${(penguValueUsd + wsolValueUsd).toFixed(2)}`);
    
    // Simulation des ticks
    console.log('\n5️⃣ Simulation des ticks...');
    
    const currentTick = 0; // Tick actuel simulé
    const tickSpacing = 64; // Tick spacing typique pour Orca
    const rangePercent = 15; // ±15%
    
    const tickRange = Math.floor((currentTick * rangePercent) / 100);
    const tickLower = currentTick - tickRange;
    const tickUpper = currentTick + tickRange;
    
    console.log(`   Current Tick: ${currentTick}`);
    console.log(`   Tick Spacing: ${tickSpacing}`);
    console.log(`   Range: ±${rangePercent}%`);
    console.log(`   Tick Lower: ${tickLower}`);
    console.log(`   Tick Upper: ${tickUpper}`);
    
    // Simulation de la liquidité
    console.log('\n6️⃣ Simulation de la liquidité...');
    
    const liquidity = Math.min(penguAmount, wsolAmount * penguPriceInWsol * 1e3); // Liquidity simulée
    const tokenMaxA = penguAmount;
    const tokenMaxB = wsolAmount;
    
    console.log(`   Liquidity: ${liquidity.toFixed(0)}`);
    console.log(`   Token Max A (PENGU): ${tokenMaxA}`);
    console.log(`   Token Max B (WSOL): ${tokenMaxB}`);
    
    // Simulation des frais
    console.log('\n7️⃣ Simulation des frais...');
    
    const computeUnits = 200000;
    const priorityFee = 1000; // microLamports
    const estimatedFee = (computeUnits * priorityFee) / 1e6; // SOL
    
    console.log(`   Compute Units: ${computeUnits}`);
    console.log(`   Priority Fee: ${priorityFee} microLamports`);
    console.log(`   Frais estimés: ${estimatedFee.toFixed(6)} SOL`);
    
    // Vérification de la faisabilité
    console.log('\n8️⃣ Vérification de la faisabilité...');
    
    const minSolForFees = 0.01; // 0.01 SOL minimum pour les frais
    const hasEnoughSol = solBalance >= minSolForFees * 1e9;
    const hasEnoughPengu = penguAmount >= 1000; // 0.001 PENGU minimum
    const hasEnoughWsol = wsolAmount >= 100000; // 0.0001 WSOL minimum
    
    console.log(`   SOL suffisant pour frais: ${hasEnoughSol ? '✅' : '❌'} (${solBalance / 1e9} SOL)`);
    console.log(`   PENGU suffisant: ${hasEnoughPengu ? '✅' : '❌'} (${penguAmount / 1e6} PENGU)`);
    console.log(`   WSOL suffisant: ${hasEnoughWsol ? '✅' : '❌'} (${wsolAmount / 1e9} WSOL)`);
    
    if (hasEnoughSol && hasEnoughPengu && hasEnoughWsol) {
      console.log('\n✅ Simulation LP PENGU/WSOL réussie !');
      console.log('   Tous les critères sont remplis');
      console.log('   Le LP est techniquement faisable');
      console.log('   Prochaine étape: Implémentation réelle du LP');
      
      // Résumé des paramètres
      console.log('\n📋 Paramètres du LP:');
      console.log(`   Pool ID: ${process.env.ORCA_PENGU_WSOL_POOL}`);
      console.log(`   PENGU Amount: ${penguAmount / 1e6}`);
      console.log(`   WSOL Amount: ${wsolAmount / 1e9}`);
      console.log(`   Tick Range: ${tickLower} à ${tickUpper}`);
      console.log(`   Liquidity: ${liquidity.toFixed(0)}`);
      console.log(`   Valeur totale: $${(penguValueUsd + wsolValueUsd).toFixed(2)}`);
      
    } else {
      console.log('\n❌ Simulation LP PENGU/WSOL échouée !');
      console.log('   Certains critères ne sont pas remplis');
      console.log('   Vérifiez les fonds et la configuration');
    }
    
    console.log('\n✅ Simulation LP PENGU/WSOL terminée !');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

testPenguLpSimulation();
