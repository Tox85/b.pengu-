#!/usr/bin/env node

const dotenv = require('dotenv');
const { PublicKey, Connection, Keypair, Transaction, SystemProgram, ComputeBudgetProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createInitializeMintInstruction, MINT_SIZE, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const { WhirlpoolContext, buildWhirlpoolClient, PDAUtil, WhirlpoolIx, IGNORE_CACHE } = require('@orca-so/whirlpools-sdk');
const BN = require('bn.js');
const fs = require('fs');

console.log('🐧 Orca LP TX2 Live - Position NFT + LP PENGU/WSOL');

dotenv.config({ override: true });

// Configuration
const CONFIG = {
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  SOL_USDC_MINT: new PublicKey(process.env.SOL_USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  SOL_WSOL_MINT: new PublicKey(process.env.SOL_WSOL_MINT || 'So11111111111111111111111111111111111111112'),
  SOL_PENGU_MINT: new PublicKey(process.env.SOL_PENGU_MINT || '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv'),
  ORCA_WHIRLPOOLS_PROGRAM: new PublicKey(process.env.ORCA_WHIRLPOOLS_PROGRAM || 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'),
  ORCA_PENGU_WSOL_POOL: new PublicKey(process.env.ORCA_PENGU_WSOL_POOL || 'FAqh648xeeaTqL7du49sztp9nfj5PjRQrfvaMccyd9cz'),
  SLIPPAGE_BPS: parseInt(process.env.SLIPPAGE_BPS || '50'),
  DRY_RUN: process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run')
};

// Parse des arguments CLI
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    penguAmount: 0.05,
    wsolAmount: 0.0005,
    tickRange: 15,
    dryRun: CONFIG.DRY_RUN,
    reusePosition: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--pengu=')) {
      config.penguAmount = parseFloat(arg.split('=')[1]);
    } else if (arg.startsWith('--wsol=')) {
      config.wsolAmount = parseFloat(arg.split('=')[1]);
    } else if (arg.startsWith('--tick-range=')) {
      config.tickRange = parseInt(arg.split('=')[1]);
    } else if (arg === '--dry-run') {
      config.dryRun = true;
    } else if (arg.startsWith('--reuse-position=')) {
      config.reusePosition = new PublicKey(arg.split('=')[1]);
    }
  }

  return config;
}

async function orcaLpTx2Live() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  let tx1Hash = null;
  let tx2Hash = null;
  let positionMint = null;
  let positionPda = null;

  try {
    const args = parseArgs();
    
    console.log('\n0️⃣ Configuration...');
    console.log(`   Mode: ${args.dryRun ? 'DRY_RUN (simulation)' : 'LIVE (exécution réelle)'}`);
    console.log(`   PENGU: ${args.penguAmount}`);
    console.log(`   WSOL: ${args.wsolAmount}`);
    console.log(`   Tick Range: ±${args.tickRange}%`);
    console.log(`   Pool: ${CONFIG.ORCA_PENGU_WSOL_POOL.toBase58()}`);

    // Initialisation
    const connection = new Connection(CONFIG.SOLANA_RPC_URL, "confirmed");
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    
    console.log(`   Wallet: ${payer.publicKey.toString()}`);

    // Contexte Orca
    const wallet = new Wallet(payer);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const ctx = WhirlpoolContext.withProvider(provider, CONFIG.ORCA_WHIRLPOOLS_PROGRAM);
    const client = buildWhirlpoolClient(ctx, IGNORE_CACHE);

    // Récupérer le pool
    console.log('\n1️⃣ Récupération du pool...');
    const pool = await client.getPool(CONFIG.ORCA_PENGU_WSOL_POOL);
    const poolData = pool.data;
    
    console.log(`   Pool: ${CONFIG.ORCA_PENGU_WSOL_POOL.toBase58()}`);
    console.log(`   Token A: ${poolData.tokenMintA.toBase58()}`);
    console.log(`   Token B: ${poolData.tokenMintB.toBase58()}`);
    console.log(`   Tick Spacing: ${poolData.tickSpacing.toNumber ? poolData.tickSpacing.toNumber() : poolData.tickSpacing}`);

    // Déterminer l'ordre des tokens
    const isTokenASol = poolData.tokenMintA.equals(CONFIG.SOL_WSOL_MINT);
    const isTokenBPengu = poolData.tokenMintB.equals(CONFIG.SOL_PENGU_MINT);
    
    if (!isTokenASol || !isTokenBPengu) {
      throw new Error(`Pool token order incorrect: A=${poolData.tokenMintA.toBase58()}, B=${poolData.tokenMintB.toBase58()}`);
    }

    console.log(`   Ordre: WSOL (A) / PENGU (B)`);

    // ATAs utilisateur
    console.log('\n2️⃣ Vérification des ATAs...');
    const userAtaA = getAssociatedTokenAddressSync(CONFIG.SOL_WSOL_MINT, payer.publicKey, false, TOKEN_PROGRAM_ID);
    const userAtaB = getAssociatedTokenAddressSync(CONFIG.SOL_PENGU_MINT, payer.publicKey, false, TOKEN_PROGRAM_ID);

    console.log(`   WSOL ATA: ${userAtaA.toBase58()}`);
    console.log(`   PENGU ATA: ${userAtaB.toBase58()}`);

    // Vérifier les soldes
    try {
      const wsolAccount = await connection.getTokenAccountBalance(userAtaA);
      const wsolBalance = parseInt(wsolAccount.value.amount) / 1e9;
      console.log(`   WSOL: ${wsolBalance}`);
      
      if (wsolBalance < args.wsolAmount) {
        throw new Error(`WSOL insuffisant: ${wsolBalance} < ${args.wsolAmount}`);
      }
    } catch (error) {
      throw new Error(`WSOL ATA non trouvé ou erreur: ${error.message}`);
    }

    try {
      const penguAccount = await connection.getTokenAccountBalance(userAtaB);
      const penguBalance = parseInt(penguAccount.value.amount) / 1e6;
      console.log(`   PENGU: ${penguBalance}`);
      
      if (penguBalance < args.penguAmount) {
        throw new Error(`PENGU insuffisant: ${penguBalance} < ${args.penguAmount}`);
      }
    } catch (error) {
      throw new Error(`PENGU ATA non trouvé ou erreur: ${error.message}`);
    }

    // Position
    console.log('\n3️⃣ Gestion de la position...');
    if (args.reusePosition) {
      console.log(`   Réutilisation position: ${args.reusePosition.toBase58()}`);
      positionMint = { publicKey: args.reusePosition };
      positionPda = PDAUtil.getPosition(CONFIG.ORCA_WHIRLPOOLS_PROGRAM, args.reusePosition);
      
      // Vérifier que l'ATA existe
      const positionTokenAccount = getAssociatedTokenAddressSync(
        args.reusePosition,
        payer.publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      const ataInfo = await connection.getAccountInfo(positionTokenAccount);
      if (!ataInfo) {
        throw new Error(`ATA de position non trouvée: ${positionTokenAccount.toBase58()}`);
      }
      
      console.log(`   Position PDA: ${positionPda.publicKey.toBase58()}`);
      console.log(`   Position ATA: ${positionTokenAccount.toBase58()}`);
    } else {
      console.log(`   Création nouvelle position...`);
      const tx1Result = await createPositionNft(connection, payer, args.dryRun);
      tx1Hash = tx1Result.txHash;
      positionMint = tx1Result.positionMint;
      positionPda = tx1Result.positionPda;
    }

    // Ticks
    console.log('\n4️⃣ Calcul des ticks...');
    const tickSpacing = poolData.tickSpacing.toNumber ? poolData.tickSpacing.toNumber() : poolData.tickSpacing;
    
    // Utiliser le tick courant du pool ou 0 pour le test
    let currentTick = 0;
    if (poolData.sqrtPrice) {
      try {
        // Convertir sqrtPrice en tick de manière sécurisée
        const sqrtPrice = poolData.sqrtPrice.toNumber ? poolData.sqrtPrice.toNumber() : poolData.sqrtPrice;
        currentTick = Math.floor(Math.log(sqrtPrice) / Math.log(1.0001));
      } catch (error) {
        console.log(`   ⚠️  Erreur calcul tick, utilisation de 0: ${error.message}`);
        currentTick = 0;
      }
    }
    const rangeTicks = Math.floor((currentTick * args.tickRange) / 100);
    
    const tickLower = Math.floor((currentTick - rangeTicks) / tickSpacing) * tickSpacing;
    const tickUpper = Math.floor((currentTick + rangeTicks) / tickSpacing) * tickSpacing;

    const startLower = Math.floor(tickLower / 88) * 88 * tickSpacing;
    const startUpper = Math.floor(tickUpper / 88) * 88 * tickSpacing;

    const tickArrayLowerPda = PDAUtil.getTickArray(CONFIG.ORCA_WHIRLPOOLS_PROGRAM, CONFIG.ORCA_PENGU_WSOL_POOL, startLower);
    const tickArrayUpperPda = PDAUtil.getTickArray(CONFIG.ORCA_WHIRLPOOLS_PROGRAM, CONFIG.ORCA_PENGU_WSOL_POOL, startUpper);

    console.log(`   Current Tick: ${currentTick}`);
    console.log(`   Tick Range: ${tickLower} → ${tickUpper}`);
    console.log(`   TickArray Lower: ${tickArrayLowerPda.publicKey.toBase58()}`);
    console.log(`   TickArray Upper: ${tickArrayUpperPda.publicKey.toBase58()}`);

    // Montants en BN
    const liquidity = new BN("25000"); // Liquidity fixe pour le test
    const tokenMaxA = new BN(Math.floor(args.wsolAmount * 1e9)); // WSOL en lamports
    const tokenMaxB = new BN(Math.floor(args.penguAmount * 1e6)); // PENGU en unités de base

    console.log(`   Liquidity: ${liquidity.toString()}`);
    console.log(`   Token Max A (WSOL): ${tokenMaxA.toString()}`);
    console.log(`   Token Max B (PENGU): ${tokenMaxB.toString()}`);

    // TX2: OpenPosition + IncreaseLiquidity
    console.log('\n5️⃣ TX2: OpenPosition + IncreaseLiquidity...');
    const tx2Result = await performLpTx2(
      connection, ctx, pool, poolData, 
      positionMint, positionPda,
      tickLower, tickUpper,
      tickArrayLowerPda, tickArrayUpperPda,
      userAtaA, userAtaB,
      liquidity, tokenMaxA, tokenMaxB,
      args.dryRun, payer
    );
    tx2Hash = tx2Result.txHash;

    // Résumé final
    console.log('\n6️⃣ Résumé final...');
    console.log(`   TX1 (Position NFT): ${tx1Hash || 'N/A (réutilisée)'}`);
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
  console.log(`\n📊 Résumé Orca LP TX2 Live:`);
  console.log(`   Durée: ${duration}ms`);
  console.log(`   Succès: ${success ? '✅' : '❌'}`);
  console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
  console.log(`   Mode: ${CONFIG.DRY_RUN ? 'DRY_RUN' : 'LIVE'}`);

  if (success) {
    console.log('\n🎉 Orca LP TX2 Live réussi !');
    console.log('   Position LP créée avec succès');
  } else {
    console.log('\n💥 Orca LP TX2 Live échoué !');
    process.exit(1);
  }
}

async function createPositionNft(connection, payer, dryRun) {
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

  if (dryRun) {
    console.log(`     DRY_RUN: Position NFT simulé`);
    return {
      txHash: "DRY_RUN_TX1_HASH",
      positionMint,
      positionPda
    };
  }

  const tx = new Transaction();
  
  // Compute Budget
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }));

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

async function performLpTx2(connection, ctx, pool, poolData, positionMint, positionPda, tickLower, tickUpper, tickArrayLowerPda, tickArrayUpperPda, userAtaA, userAtaB, liquidity, tokenMaxA, tokenMaxB, dryRun, payer) {
  // Position Token Account
  const positionTokenAccount = getAssociatedTokenAddressSync(
    positionMint.publicKey,
    payer.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  if (dryRun) {
    console.log(`     DRY_RUN: LP simulé`);
    console.log(`     OpenPosition: position=${positionPda.publicKey.toBase58()}`);
    console.log(`     IncreaseLiquidity: position=${positionPda.publicKey.toBase58()}`);
    return {
      txHash: "DRY_RUN_TX2_HASH"
    };
  }

  // Vérifier et initialiser les TickArrays si nécessaire
  const startLower = Math.floor(tickLower / 88) * 88 * (poolData.tickSpacing.toNumber ? poolData.tickSpacing.toNumber() : poolData.tickSpacing);
  const startUpper = Math.floor(tickUpper / 88) * 88 * (poolData.tickSpacing.toNumber ? poolData.tickSpacing.toNumber() : poolData.tickSpacing);
  
  await ensureTickArray(connection, ctx, pool.address, tickArrayLowerPda.publicKey, startLower, payer);
  await ensureTickArray(connection, ctx, pool.address, tickArrayUpperPda.publicKey, startUpper, payer);

  // OpenPosition
  const openIx = WhirlpoolIx.openPositionIx(ctx.program, {
    whirlpool: pool.address,
    position: positionPda.publicKey, // 👈 PDA, pas le mint
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
    position: positionPda.publicKey, // 👈 PDA, pas le mint
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
  tx2.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }));
  tx2.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }));
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

async function ensureTickArray(connection, ctx, poolAddress, tickArrayPda, startIndex, payer) {
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

// Exécution
if (require.main === module) {
  orcaLpTx2Live();
}

module.exports = { orcaLpTx2Live };
