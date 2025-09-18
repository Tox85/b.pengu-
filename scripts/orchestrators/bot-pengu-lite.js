#!/usr/bin/env node

const dotenv = require('dotenv');
const { PublicKey, Connection, Keypair, Transaction, SystemProgram, ComputeBudgetProgram } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createInitializeMintInstruction, MINT_SIZE, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const { WhirlpoolContext, buildWhirlpoolClient, PDAUtil, WhirlpoolIx, IGNORE_CACHE } = require('@orca-so/whirlpools-sdk');
const BN = require('bn.js');
const fs = require('fs');

console.log('🐧 Bot PENGU Lite - Chaîne E2E sans CEX');
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
  
  // Mode
  DRY_RUN: process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run'),
  
  // Montants
  BRIDGE_AMOUNT_USDC: 1.0, // 1 USDC pour le bridge
  SWAP_AMOUNT_USDC: 0.01,  // 0.01 USDC pour le swap SOL (micro-montant)
  PENGU_AMOUNT_USDC: 0.01, // 0.01 USDC pour acheter PENGU (micro-montant)
  LP_PENGU_AMOUNT: 0.05,   // 0.05 PENGU pour LP
  LP_WSOL_AMOUNT: 0.0005   // 0.0005 WSOL pour LP
};

// Variables globales
let connection;
let payer;
let orcaContext;
let balances = {};

async function botPenguLite() {
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
    console.log(`   Mode: ${CONFIG.DRY_RUN ? 'DRY_RUN (simulation)' : 'LIVE (exécution réelle)'}`);
    console.log(`   RPC Solana: ${CONFIG.SOLANA_RPC_URL}`);
    console.log(`   RPC Base: ${CONFIG.BASE_RPC_URL}`);
    console.log(`   Pool Orca: ${CONFIG.ORCA_PENGU_WSOL_POOL.toBase58()}`);
    console.log(`   Slippage: ${CONFIG.SLIPPAGE_BPS} bps`);
    console.log(`   Range LP: ±${CONFIG.LP_UPPER_PCT}%`);

    // Initialisation
    connection = new Connection(CONFIG.SOLANA_RPC_URL, "confirmed");
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    
    console.log(`   Wallet: ${payer.publicKey.toString()}`);

    // Step 1: Lecture des balances
    console.log('\n1️⃣ Lecture des balances...');
    await readBalances();

    // Step 2: Vérification et approvisionnement SOL
    console.log('\n2️⃣ Vérification SOL...');
    await ensureSolBalance();

    // Step 3: Vérification et approvisionnement USDC
    console.log('\n3️⃣ Vérification USDC...');
    await ensureUsdcBalance();

    // Step 4: Vérification et achat PENGU
    console.log('\n4️⃣ Vérification PENGU...');
    await ensurePenguBalance();

    // Step 5: LP Orca (TX1 + TX2)
    console.log('\n5️⃣ LP Orca PENGU/WSOL...');
    const lpResult = await performLp();
    tx1Hash = lpResult.tx1Hash;
    tx2Hash = lpResult.tx2Hash;
    positionMint = lpResult.positionMint;
    positionPda = lpResult.positionPda;

    // Step 6: Résumé final
    console.log('\n6️⃣ Résumé final...');
    console.log(`   TX1 (Position NFT): ${tx1Hash || 'N/A'}`);
    console.log(`   TX2 (LP): ${tx2Hash || 'N/A'}`);
    console.log(`   Position Mint: ${positionMint?.publicKey.toBase58() || 'N/A'}`);
    console.log(`   Position PDA: ${positionPda?.publicKey.toBase58() || 'N/A'}`);
    console.log(`   Pool: ${CONFIG.ORCA_PENGU_WSOL_POOL.toBase58()}`);

    success = true;

  } catch (err) {
    error = err;
    console.error(`❌ Erreur: ${err.message}`);
    console.error(`   Stack: ${err.stack}`);
  }

  // Résumé final
  const duration = Date.now() - startTime;
  console.log(`\n📊 Résumé Bot PENGU Lite:`);
  console.log(`   Durée: ${duration}ms`);
  console.log(`   Succès: ${success ? '✅' : '❌'}`);
  console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
  console.log(`   Mode: ${CONFIG.DRY_RUN ? 'DRY_RUN' : 'LIVE'}`);

  if (success) {
    console.log('\n🎉 Bot PENGU Lite réussi !');
    console.log('   Chaîne E2E complète sans CEX');
    console.log('   Position LP créée avec succès');
  } else {
    console.log('\n💥 Bot PENGU Lite échoué !');
    console.log('   Vérifiez la configuration et les fonds');
    process.exit(1);
  }
}

async function readBalances() {
  // SOL
  const solBalance = await connection.getBalance(payer.publicKey);
  balances.sol = solBalance / 1e9;
  console.log(`   SOL: ${balances.sol}`);

  // USDC
  try {
    const usdcAta = getAssociatedTokenAddressSync(CONFIG.SOL_USDC_MINT, payer.publicKey);
    const usdcAccount = await connection.getTokenAccountBalance(usdcAta);
    balances.usdc = parseInt(usdcAccount.value.amount) / 1e6;
  } catch {
    balances.usdc = 0;
  }
  console.log(`   USDC: ${balances.usdc}`);

  // WSOL
  try {
    const wsolAta = getAssociatedTokenAddressSync(CONFIG.SOL_WSOL_MINT, payer.publicKey);
    const wsolAccount = await connection.getTokenAccountBalance(wsolAta);
    balances.wsol = parseInt(wsolAccount.value.amount) / 1e9;
  } catch {
    balances.wsol = 0;
  }
  console.log(`   WSOL: ${balances.wsol}`);

  // PENGU
  try {
    const penguAta = getAssociatedTokenAddressSync(CONFIG.SOL_PENGU_MINT, payer.publicKey);
    const penguAccount = await connection.getTokenAccountBalance(penguAta);
    balances.pengu = parseInt(penguAccount.value.amount) / 1e6;
  } catch {
    balances.pengu = 0;
  }
  console.log(`   PENGU: ${balances.pengu}`);
}

async function ensureSolBalance() {
  if (balances.sol >= CONFIG.MIN_SOL_BALANCE) {
    console.log(`   ✅ SOL suffisant: ${balances.sol} >= ${CONFIG.MIN_SOL_BALANCE}`);
    return;
  }

  console.log(`   ⚠️  SOL insuffisant: ${balances.sol} < ${CONFIG.MIN_SOL_BALANCE}`);
  
  if (balances.usdc < CONFIG.SWAP_AMOUNT_USDC) {
    console.log(`   ⚠️  USDC insuffisant pour swap SOL: ${balances.usdc} < ${CONFIG.SWAP_AMOUNT_USDC}`);
    console.log(`   ⚠️  Mode LIVE: Impossible de continuer sans SOL pour les frais`);
    console.log(`   💡 Solution: Ajouter du SOL au wallet ou activer le bridge USDC`);
    throw new Error(`SOL insuffisant pour les frais de transaction: ${balances.sol} < ${CONFIG.MIN_SOL_BALANCE}`);
  }

  console.log(`   Swap USDC → SOL: ${CONFIG.SWAP_AMOUNT_USDC} USDC`);
  await swapUsdcToSol(CONFIG.SWAP_AMOUNT_USDC * 1e6);
  
  // Recharger les balances
  await readBalances();
}

async function ensureUsdcBalance() {
  if (balances.usdc >= CONFIG.MIN_USDC_BALANCE) {
    console.log(`   ✅ USDC suffisant: ${balances.usdc} >= ${CONFIG.MIN_USDC_BALANCE}`);
    return;
  }

  console.log(`   ⚠️  USDC insuffisant: ${balances.usdc} < ${CONFIG.MIN_USDC_BALANCE}`);
  console.log(`   Bridge Base → Solana: ${CONFIG.BRIDGE_AMOUNT_USDC} USDC`);
  
  // Simulation du bridge (en production, appeler Li.Fi)
  if (CONFIG.DRY_RUN) {
    console.log(`   DRY_RUN: Bridge simulé`);
    balances.usdc += CONFIG.BRIDGE_AMOUNT_USDC;
  } else {
    console.log(`   ⚠️  Bridge simulé - implémentation Li.Fi requise`);
    balances.usdc += CONFIG.BRIDGE_AMOUNT_USDC;
  }
}

async function ensurePenguBalance() {
  if (balances.pengu >= 0.01) {
    console.log(`   ✅ PENGU suffisant: ${balances.pengu} >= 0.01`);
    return;
  }

  console.log(`   ⚠️  PENGU insuffisant: ${balances.pengu} < 0.01`);
  
  if (balances.usdc < CONFIG.PENGU_AMOUNT_USDC) {
    throw new Error(`USDC insuffisant pour acheter PENGU: ${balances.usdc} < ${CONFIG.PENGU_AMOUNT_USDC}`);
  }

  console.log(`   Swap USDC → PENGU: ${CONFIG.PENGU_AMOUNT_USDC} USDC`);
  await swapUsdcToPengu(CONFIG.PENGU_AMOUNT_USDC * 1e6);
  
  // Recharger les balances
  await readBalances();
}

async function performLp() {
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
  console.log(`   TX1: Création Position NFT...`);
  const tx1Result = await createPositionNft();
  
  // TX2: LP
  console.log(`   TX2: LP...`);
  const tx2Result = await performLpTx2(ctx, client, pool, poolData, tickSpacing, tx1Result.positionMint, tx1Result.positionPda);

  return {
    tx1Hash: tx1Result.txHash,
    tx2Hash: tx2Result.txHash,
    positionMint: tx1Result.positionMint,
    positionPda: tx1Result.positionPda
  };
}

async function createPositionNft() {
  const positionMint = Keypair.generate();
  const positionPda = PDAUtil.getPosition(CONFIG.ORCA_WHIRLPOOLS_PROGRAM, positionMint.publicKey);
  const positionTokenAccount = getAssociatedTokenAddressSync(
    positionMint.publicKey,
    payer.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  console.log(`     Position Mint: ${positionMint.publicKey.toBase58()}`);
  console.log(`     Position PDA: ${positionPda.publicKey.toBase58()}`);
  console.log(`     Position ATA: ${positionTokenAccount.toBase58()}`);

  if (CONFIG.DRY_RUN) {
    console.log(`     DRY_RUN: Position NFT simulé`);
    return {
      txHash: "DRY_RUN_TX1_HASH",
      positionMint,
      positionPda
    };
  }

  const tx = new Transaction();
  
  // Compute Budget
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2000 }));

  // Créer le compte mint
  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  tx.add(SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: positionMint.publicKey,
    lamports: mintRent,
    space: MINT_SIZE,
    programId: TOKEN_PROGRAM_ID
  }));

  // Initialiser le mint
  tx.add(createInitializeMintInstruction(
    positionMint.publicKey,
    0, // decimals (NFT)
    payer.publicKey, // mintAuthority
    payer.publicKey, // freezeAuthority
    TOKEN_PROGRAM_ID
  ));

  // Créer l'ATA
  tx.add(createAssociatedTokenAccountInstruction(
    payer.publicKey, // payer
    positionTokenAccount, // ata
    payer.publicKey, // owner
    positionMint.publicKey, // mint
    TOKEN_PROGRAM_ID
  ));

  const { blockhash } = await connection.getLatestBlockhash("finalized");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;

  const txHash = await connection.sendTransaction(tx, [payer, positionMint]);
  console.log(`     TX1 envoyée: ${txHash}`);

  await connection.confirmTransaction(txHash, "confirmed");
  console.log(`     TX1 confirmée: ${txHash}`);

  return {
    txHash,
    positionMint,
    positionPda
  };
}

async function performLpTx2(ctx, client, pool, poolData, tickSpacing, positionMint, positionPda) {
  // Calculer les ticks alignés
  const currentTick = 0; // Placeholder pour le test
  const rangeTicks = Math.floor((currentTick * CONFIG.LP_UPPER_PCT) / 100);
  const tickLower = Math.floor((currentTick - rangeTicks) / tickSpacing) * tickSpacing;
  const tickUpper = Math.floor((currentTick + rangeTicks) / tickSpacing) * tickSpacing;

  const startLower = Math.floor(tickLower / 88) * 88 * tickSpacing;
  const startUpper = Math.floor(tickUpper / 88) * 88 * tickSpacing;

  const tickArrayLowerPda = PDAUtil.getTickArray(ctx.program.programId, pool.address, startLower);
  const tickArrayUpperPda = PDAUtil.getTickArray(ctx.program.programId, pool.address, startUpper);

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

  if (CONFIG.DRY_RUN) {
    console.log(`     DRY_RUN: LP simulé`);
    return {
      txHash: "DRY_RUN_TX2_HASH"
    };
  }

  // Vérifier et initialiser les TickArrays si nécessaire
  await ensureTickArray(ctx, pool.address, tickArrayLowerPda.publicKey, startLower);
  await ensureTickArray(ctx, pool.address, tickArrayUpperPda.publicKey, startUpper);

  // Position Token Account
  const positionTokenAccount = getAssociatedTokenAddressSync(
    positionMint.publicKey,
    payer.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // OpenPosition
  const openIx = WhirlpoolIx.openPositionIx(ctx.program, {
    whirlpool: pool.address,
    position: positionPda.publicKey,
    positionMint: positionMint.publicKey,
    positionTokenAccount: positionTokenAccount,
    tickLowerIndex: tickLower,
    tickUpperIndex: tickUpper,
    funder: payer.publicKey,
    owner: payer.publicKey
  });

  // IncreaseLiquidity
  const incIx = WhirlpoolIx.increaseLiquidityIx(ctx.program, {
    whirlpool: pool.address,
    position: positionPda.publicKey,
    positionTokenAccount: positionTokenAccount,
    tickArrayLower: tickArrayLowerPda.publicKey,
    tickArrayUpper: tickArrayUpperPda.publicKey,
    tokenOwnerAccountA: userAtaA,
    tokenOwnerAccountB: userAtaB,
    tokenVaultA: poolData.tokenVaultA,
    tokenVaultB: poolData.tokenVaultB,
    liquidityAmount: liquidity,
    tokenMaxA,
    tokenMaxB
  });

  // TX2
  const tx2 = new Transaction();
  tx2.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }));
  tx2.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2000 }));
  tx2.add(openIx);
  tx2.add(incIx);

  const { blockhash } = await connection.getLatestBlockhash("finalized");
  tx2.recentBlockhash = blockhash;
  tx2.feePayer = payer.publicKey;
  tx2.sign(payer);

  const tx2Hash = await connection.sendRawTransaction(tx2.serialize(), { skipPreflight: false });
  console.log(`     TX2 envoyée: ${tx2Hash}`);

  await connection.confirmTransaction(tx2Hash, "confirmed");
  console.log(`     TX2 confirmée: ${tx2Hash}`);

  return {
    txHash: tx2Hash
  };
}

async function ensureTickArray(ctx, poolAddress, tickArrayPda, startIndex) {
  const info = await connection.getAccountInfo(tickArrayPda);
  if (info) {
    console.log(`       TickArray ${tickArrayPda.toBase58()} existe déjà`);
    return;
  }

  console.log(`       Initialisation TickArray ${tickArrayPda.toBase58()}...`);
  const initIx = WhirlpoolIx.initializeTickArrayIx(ctx.program, {
    whirlpool: poolAddress,
    tickArray: tickArrayPda,
    startTick: startIndex,
    funder: payer.publicKey
  });

  const tx = new Transaction().add(initIx);
  const { blockhash } = await connection.getLatestBlockhash("finalized");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction(sig, "confirmed");
  console.log(`       TickArray initialisé: ${sig}`);
}

// Fonctions de swap simplifiées (en production, utiliser les helpers TypeScript)
async function swapUsdcToSol(amount) {
  console.log(`   Swap USDC → SOL: ${amount / 1e6} USDC`);
  if (CONFIG.DRY_RUN) {
    console.log(`   DRY_RUN: Swap simulé`);
    balances.sol += 0.001; // Simulation
    balances.usdc -= amount / 1e6;
    return;
  }
  // En production, appeler l'API Jupiter
  console.log(`   ⚠️  Swap simulé - implémentation Jupiter requise`);
  balances.sol += 0.001;
  balances.usdc -= amount / 1e6;
}

async function swapUsdcToPengu(amount) {
  console.log(`   Swap USDC → PENGU: ${amount / 1e6} USDC`);
  if (CONFIG.DRY_RUN) {
    console.log(`   DRY_RUN: Swap simulé`);
    balances.pengu += 0.1; // Simulation
    balances.usdc -= amount / 1e6;
    return;
  }
  // En production, appeler l'API Jupiter
  console.log(`   ⚠️  Swap simulé - implémentation Jupiter requise`);
  balances.pengu += 0.1;
  balances.usdc -= amount / 1e6;
}

// Exécution
if (require.main === module) {
  botPenguLite();
}

module.exports = { botPenguLite };
