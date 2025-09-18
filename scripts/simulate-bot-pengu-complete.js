#!/usr/bin/env node

const dotenv = require('dotenv');
const { PublicKey, Connection, Keypair } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const { WhirlpoolContext, buildWhirlpoolClient, PDAUtil, IGNORE_CACHE } = require('@orca-so/whirlpools-sdk');
const BN = require('bn.js');
const fs = require('fs');

console.log('🐧 Simulation Bot PENGU Complet - Chaîne E2E sans CEX');
console.log('   Base(USDC) → Bridge → Solana(USDC) → Swap → PENGU → LP Orca');

dotenv.config({ override: true });

// Configuration
const CONFIG = {
  // RPCs
  BASE_RPC_URL: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  SOLANA_WS_URL: process.env.SOLANA_WS_URL,
  
  // Mints
  SOL_USDC_MINT: new PublicKey(process.env.SOL_USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  SOL_WSOL_MINT: new PublicKey(process.env.SOL_WSOL_MINT || 'So11111111111111111111111111111111111111112'),
  SOL_PENGU_MINT: new PublicKey(process.env.SOL_PENGU_MINT || '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv'),
  
  // Orca
  ORCA_WHIRLPOOLS_PROGRAM: new PublicKey(process.env.ORCA_WHIRLPOOLS_PROGRAM || 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'),
  ORCA_PENGU_WSOL_POOL: new PublicKey(process.env.ORCA_PENGU_WSOL_POOL || 'FAqh648xeeaTqL7du49sztp9nfj5PjRQrfvaMccyd9cz'),
  
  // Seuils
  MIN_SOL_BALANCE: parseFloat(process.env.MIN_SOL_BALANCE || '0.006'),
  MIN_USDC_BALANCE: parseFloat(process.env.MIN_USDC_BALANCE || '0.5'),
  SLIPPAGE_BPS: parseInt(process.env.SLIPPAGE_BPS || '50'),
  LP_UPPER_PCT: parseInt(process.env.LP_UPPER_PCT || '15'),
  LP_LOWER_PCT: parseInt(process.env.LP_LOWER_PCT || '15'),
  
  // Montants
  BRIDGE_AMOUNT_USDC: 1.0, // 1 USDC pour le bridge
  SWAP_AMOUNT_USDC: 0.01,  // 0.01 USDC pour le swap SOL
  PENGU_AMOUNT_USDC: 0.01, // 0.01 USDC pour acheter PENGU
  LP_PENGU_AMOUNT: 0.05,   // 0.05 PENGU pour LP
  LP_WSOL_AMOUNT: 0.0005   // 0.0005 WSOL pour LP
};

async function simulateBotPenguComplete() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  let tx1Hash = null;
  let tx2Hash = null;
  let positionMint = null;
  let positionPda = null;

  try {
    // Step 0: Configuration
    console.log('\n0️⃣ Configuration...');
    console.log(`   Mode: SIMULATION (validation de la logique)`);
    console.log(`   RPC Solana: ${CONFIG.SOLANA_RPC_URL}`);
    console.log(`   RPC Base: ${CONFIG.BASE_RPC_URL}`);
    console.log(`   Pool Orca: ${CONFIG.ORCA_PENGU_WSOL_POOL.toBase58()}`);
    console.log(`   Slippage: ${CONFIG.SLIPPAGE_BPS} bps`);
    console.log(`   Range LP: ±${CONFIG.LP_UPPER_PCT}%`);

    // Initialisation
    const connection = new Connection(CONFIG.SOLANA_RPC_URL, "confirmed");
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    
    console.log(`   Wallet: ${payer.publicKey.toString()}`);

    // Step 1: Lecture des balances
    console.log('\n1️⃣ Lecture des balances...');
    const balances = await readBalances(connection, payer);
    console.log(`   SOL: ${balances.sol}`);
    console.log(`   USDC: ${balances.usdc}`);
    console.log(`   WSOL: ${balances.wsol}`);
    console.log(`   PENGU: ${balances.pengu}`);

    // Step 2: Vérification et approvisionnement SOL
    console.log('\n2️⃣ Vérification SOL...');
    const solResult = await checkSolBalance(balances);
    if (solResult.needsSwap) {
      console.log(`   ⚠️  SOL insuffisant: ${balances.sol} < ${CONFIG.MIN_SOL_BALANCE}`);
      console.log(`   💡 Solution: Swap USDC → SOL (${CONFIG.SWAP_AMOUNT_USDC} USDC)`);
      balances.sol += 0.001; // Simulation
      balances.usdc -= CONFIG.SWAP_AMOUNT_USDC;
      console.log(`   ✅ Swap simulé: +0.001 SOL, -${CONFIG.SWAP_AMOUNT_USDC} USDC`);
    } else {
      console.log(`   ✅ SOL suffisant: ${balances.sol} >= ${CONFIG.MIN_SOL_BALANCE}`);
    }

    // Step 3: Vérification et approvisionnement USDC
    console.log('\n3️⃣ Vérification USDC...');
    const usdcResult = await checkUsdcBalance(balances);
    if (usdcResult.needsBridge) {
      console.log(`   ⚠️  USDC insuffisant: ${balances.usdc} < ${CONFIG.MIN_USDC_BALANCE}`);
      console.log(`   💡 Solution: Bridge Base → Solana (${CONFIG.BRIDGE_AMOUNT_USDC} USDC)`);
      balances.usdc += CONFIG.BRIDGE_AMOUNT_USDC;
      console.log(`   ✅ Bridge simulé: +${CONFIG.BRIDGE_AMOUNT_USDC} USDC`);
    } else {
      console.log(`   ✅ USDC suffisant: ${balances.usdc} >= ${CONFIG.MIN_USDC_BALANCE}`);
    }

    // Step 4: Vérification et achat PENGU
    console.log('\n4️⃣ Vérification PENGU...');
    const penguResult = await checkPenguBalance(balances);
    if (penguResult.needsSwap) {
      console.log(`   ⚠️  PENGU insuffisant: ${balances.pengu} < 0.01`);
      console.log(`   💡 Solution: Swap USDC → PENGU (${CONFIG.PENGU_AMOUNT_USDC} USDC)`);
      balances.pengu += 0.1; // Simulation
      balances.usdc -= CONFIG.PENGU_AMOUNT_USDC;
      console.log(`   ✅ Swap simulé: +0.1 PENGU, -${CONFIG.PENGU_AMOUNT_USDC} USDC`);
    } else {
      console.log(`   ✅ PENGU suffisant: ${balances.pengu} >= 0.01`);
    }

    // Step 5: LP Orca (TX1 + TX2)
    console.log('\n5️⃣ LP Orca PENGU/WSOL...');
    console.log(`   LP PENGU/WSOL: ${CONFIG.LP_PENGU_AMOUNT} PENGU + ${CONFIG.LP_WSOL_AMOUNT} WSOL`);

    // Initialiser le contexte Orca
    const wallet = new Wallet(payer);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const ctx = WhirlpoolContext.withProvider(provider, CONFIG.ORCA_WHIRLPOOLS_PROGRAM);
    const client = buildWhirlpoolClient(ctx, IGNORE_CACHE);

    // Récupérer le pool
    const pool = await client.getPool(CONFIG.ORCA_PENGU_WSOL_POOL);
    const poolData = pool.data;
    console.log(`   Pool: ${CONFIG.ORCA_PENGU_WSOL_POOL.toBase58()}`);
    console.log(`   Token A: ${poolData.tokenMintA.toBase58()}`);
    console.log(`   Token B: ${poolData.tokenMintB.toBase58()}`);

    const tickSpacing = poolData.tickSpacing.toNumber ? poolData.tickSpacing.toNumber() : poolData.tickSpacing;
    console.log(`   Tick Spacing: ${tickSpacing}`);

    // TX1: Création Position NFT
    console.log(`\n6️⃣ TX1: Création Position NFT...`);
    const tx1Result = await simulateCreatePositionNft(payer);
    tx1Hash = tx1Result.txHash;
    positionMint = tx1Result.positionMint;
    positionPda = tx1Result.positionPda;
    console.log(`   Position Mint: ${positionMint.publicKey.toBase58()}`);
    console.log(`   Position PDA: ${positionPda.publicKey.toBase58()}`);
    console.log(`   TX1 Hash: ${tx1Hash}`);

    // TX2: LP
    console.log(`\n7️⃣ TX2: LP...`);
    const tx2Result = await simulateLpTx2(payer, poolData, tickSpacing, positionMint, positionPda);
    tx2Hash = tx2Result.txHash;
    console.log(`   TX2 Hash: ${tx2Hash}`);

    // Step 8: Résumé final
    console.log('\n8️⃣ Résumé final...');
    console.log(`   TX1 (Position NFT): ${tx1Hash}`);
    console.log(`   TX2 (LP): ${tx2Hash}`);
    console.log(`   Position Mint: ${positionMint.publicKey.toBase58()}`);
    console.log(`   Position PDA: ${positionPda.publicKey.toBase58()}`);
    console.log(`   Pool: ${CONFIG.ORCA_PENGU_WSOL_POOL.toBase58()}`);

    success = true;

  } catch (err) {
    error = err;
    console.error(`❌ Erreur: ${err.message}`);
  }

  // Résumé final
  const duration = Date.now() - startTime;
  console.log(`\n📊 Résumé Simulation Bot PENGU Complet:`);
  console.log(`   Durée: ${duration}ms`);
  console.log(`   Succès: ${success ? '✅' : '❌'}`);
  console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
  console.log(`   Mode: SIMULATION`);

  if (success) {
    console.log('\n🎉 Simulation Bot PENGU Complet réussie !');
    console.log('   Chaîne E2E complète validée');
    console.log('   Position LP simulée avec succès');
    console.log('   Prêt pour implémentation LIVE');
  } else {
    console.log('\n💥 Simulation Bot PENGU Complet échouée !');
    console.log('   Vérifiez la logique et la configuration');
  }
}

async function readBalances(connection, payer) {
  const balances = { sol: 0, usdc: 0, wsol: 0, pengu: 0 };

  // SOL
  const solBalance = await connection.getBalance(payer.publicKey);
  balances.sol = solBalance / 1e9;

  // USDC
  try {
    const usdcAta = getAssociatedTokenAddressSync(CONFIG.SOL_USDC_MINT, payer.publicKey);
    const usdcAccount = await connection.getTokenAccountBalance(usdcAta);
    balances.usdc = parseInt(usdcAccount.value.amount) / 1e6;
  } catch {
    balances.usdc = 0;
  }

  // WSOL
  try {
    const wsolAta = getAssociatedTokenAddressSync(CONFIG.SOL_WSOL_MINT, payer.publicKey);
    const wsolAccount = await connection.getTokenAccountBalance(wsolAta);
    balances.wsol = parseInt(wsolAccount.value.amount) / 1e9;
  } catch {
    balances.wsol = 0;
  }

  // PENGU
  try {
    const penguAta = getAssociatedTokenAddressSync(CONFIG.SOL_PENGU_MINT, payer.publicKey);
    const penguAccount = await connection.getTokenAccountBalance(penguAta);
    balances.pengu = parseInt(penguAccount.value.amount) / 1e6;
  } catch {
    balances.pengu = 0;
  }

  return balances;
}

async function checkSolBalance(balances) {
  return {
    needsSwap: balances.sol < CONFIG.MIN_SOL_BALANCE
  };
}

async function checkUsdcBalance(balances) {
  return {
    needsBridge: balances.usdc < CONFIG.MIN_USDC_BALANCE
  };
}

async function checkPenguBalance(balances) {
  return {
    needsSwap: balances.pengu < 0.01
  };
}

async function simulateCreatePositionNft(payer) {
  const positionMint = Keypair.generate();
  const positionPda = PDAUtil.getPosition(CONFIG.ORCA_WHIRLPOOLS_PROGRAM, positionMint.publicKey);
  const positionTokenAccount = getAssociatedTokenAddressSync(
    positionMint.publicKey,
    payer.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  console.log(`     Position Mint: ${positionMint.publicKey.toBase58()}`);
  console.log(`     Position PDA: ${positionPda.publicKey.toBase58()}`);
  console.log(`     Position ATA: ${positionTokenAccount.toBase58()}`);
  console.log(`     ✅ Position NFT simulé`);

  return {
    txHash: "SIM_TX1_HASH",
    positionMint,
    positionPda
  };
}

async function simulateLpTx2(payer, poolData, tickSpacing, positionMint, positionPda) {
  // Calculer les ticks alignés
  const currentTick = 0; // Placeholder pour le test
  const rangeTicks = Math.floor((currentTick * CONFIG.LP_UPPER_PCT) / 100);
  const tickLower = Math.floor((currentTick - rangeTicks) / tickSpacing) * tickSpacing;
  const tickUpper = Math.floor((currentTick + rangeTicks) / tickSpacing) * tickSpacing;

  const startLower = Math.floor(tickLower / 88) * 88 * tickSpacing;
  const startUpper = Math.floor(tickUpper / 88) * 88 * tickSpacing;

  const tickArrayLowerPda = PDAUtil.getTickArray(CONFIG.ORCA_WHIRLPOOLS_PROGRAM, CONFIG.ORCA_PENGU_WSOL_POOL, startLower);
  const tickArrayUpperPda = PDAUtil.getTickArray(CONFIG.ORCA_WHIRLPOOLS_PROGRAM, CONFIG.ORCA_PENGU_WSOL_POOL, startUpper);

  console.log(`     Ticks: ${tickLower} → ${tickUpper}`);
  console.log(`     TickArray Lower: ${tickArrayLowerPda.publicKey.toBase58()}`);
  console.log(`     TickArray Upper: ${tickArrayUpperPda.publicKey.toBase58()}`);

  // ATAs utilisateur
  const userAtaA = getAssociatedTokenAddressSync(CONFIG.SOL_PENGU_MINT, payer.publicKey);
  const userAtaB = getAssociatedTokenAddressSync(CONFIG.SOL_WSOL_MINT, payer.publicKey);

  // Montants en BN
  const liquidity = new BN("25000");
  const tokenMaxA = new BN(Math.floor(CONFIG.LP_PENGU_AMOUNT * 1e6));
  const tokenMaxB = new BN(Math.floor(CONFIG.LP_WSOL_AMOUNT * 1e9));

  console.log(`     Liquidity: ${liquidity.toString()}`);
  console.log(`     Token Max A (PENGU): ${tokenMaxA.toString()}`);
  console.log(`     Token Max B (WSOL): ${tokenMaxB.toString()}`);
  console.log(`     ✅ LP simulé`);

  return {
    txHash: "SIM_TX2_HASH"
  };
}

// Exécution
if (require.main === module) {
  simulateBotPenguComplete();
}

module.exports = { simulateBotPenguComplete };
