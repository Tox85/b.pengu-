#!/usr/bin/env node

const dotenv = require('dotenv');
const { PublicKey, Connection, Keypair, Transaction, SystemProgram, ComputeBudgetProgram } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createInitializeMintInstruction, MINT_SIZE, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const { WhirlpoolContext, buildWhirlpoolClient, PDAUtil, WhirlpoolIx, IGNORE_CACHE } = require('@orca-so/whirlpools-sdk');
const BN = require('bn.js');
const fs = require('fs');

console.log('🐧 Test Bot PENGU Minimal - LP Orca uniquement');
console.log('   Test de la partie LP avec les fonds existants');

dotenv.config({ override: true });

// Configuration
const CONFIG = {
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  SOL_PENGU_MINT: new PublicKey(process.env.SOL_PENGU_MINT || '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv'),
  SOL_WSOL_MINT: new PublicKey(process.env.SOL_WSOL_MINT || 'So11111111111111111111111111111111111111112'),
  ORCA_WHIRLPOOLS_PROGRAM: new PublicKey(process.env.ORCA_WHIRLPOOLS_PROGRAM || 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'),
  ORCA_PENGU_WSOL_POOL: new PublicKey(process.env.ORCA_PENGU_WSOL_POOL || 'FAqh648xeeaTqL7du49sztp9nfj5PjRQrfvaMccyd9cz'),
  DRY_RUN: process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run'),
  LP_PENGU_AMOUNT: 0.01,   // 0.01 PENGU pour LP (micro-montant)
  LP_WSOL_AMOUNT: 0.0001   // 0.0001 WSOL pour LP (micro-montant)
};

async function testBotPenguMinimal() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  let tx1Hash = null;
  let tx2Hash = null;
  let positionMint = null;
  let positionPda = null;

  try {
    // Initialisation
    console.log('\n0️⃣ Configuration...');
    console.log(`   Mode: ${CONFIG.DRY_RUN ? 'DRY_RUN (simulation)' : 'LIVE (exécution réelle)'}`);
    console.log(`   RPC Solana: ${CONFIG.SOLANA_RPC_URL}`);
    console.log(`   Pool Orca: ${CONFIG.ORCA_PENGU_WSOL_POOL.toBase58()}`);

    const connection = new Connection(CONFIG.SOLANA_RPC_URL, "confirmed");
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    
    console.log(`   Wallet: ${payer.publicKey.toString()}`);

    // Vérifier les balances
    console.log('\n1️⃣ Vérification des balances...');
    const solBalance = await connection.getBalance(payer.publicKey);
    console.log(`   SOL: ${solBalance / 1e9}`);

    if (solBalance < 0.005e9) {
      throw new Error(`SOL insuffisant pour les frais: ${solBalance / 1e9} < 0.005`);
    }

    // Vérifier PENGU
    try {
      const penguAta = getAssociatedTokenAddressSync(CONFIG.SOL_PENGU_MINT, payer.publicKey);
      const penguAccount = await connection.getTokenAccountBalance(penguAta);
      const penguBalance = parseInt(penguAccount.value.amount) / 1e6;
      console.log(`   PENGU: ${penguBalance}`);
      
      if (penguBalance < CONFIG.LP_PENGU_AMOUNT) {
        throw new Error(`PENGU insuffisant pour LP: ${penguBalance} < ${CONFIG.LP_PENGU_AMOUNT}`);
      }
    } catch (err) {
      throw new Error(`PENGU non trouvé: ${err.message}`);
    }

    // Vérifier WSOL
    try {
      const wsolAta = getAssociatedTokenAddressSync(CONFIG.SOL_WSOL_MINT, payer.publicKey);
      const wsolAccount = await connection.getTokenAccountBalance(wsolAta);
      const wsolBalance = parseInt(wsolAccount.value.amount) / 1e9;
      console.log(`   WSOL: ${wsolBalance}`);
      
      if (wsolBalance < CONFIG.LP_WSOL_AMOUNT) {
        throw new Error(`WSOL insuffisant pour LP: ${wsolBalance} < ${CONFIG.LP_WSOL_AMOUNT}`);
      }
    } catch (err) {
      throw new Error(`WSOL non trouvé: ${err.message}`);
    }

    // LP Orca
    console.log('\n2️⃣ LP Orca PENGU/WSOL...');
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
    console.log(`\n3️⃣ TX1: Création Position NFT...`);
    const tx1Result = await createPositionNft(connection, payer);
    tx1Hash = tx1Result.txHash;
    positionMint = tx1Result.positionMint;
    positionPda = tx1Result.positionPda;
    
    // TX2: LP
    console.log(`\n4️⃣ TX2: LP...`);
    const tx2Result = await performLpTx2(connection, ctx, client, pool, poolData, tickSpacing, positionMint, positionPda);
    tx2Hash = tx2Result.txHash;

    // Résumé final
    console.log('\n5️⃣ Résumé final...');
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
  console.log(`\n📊 Résumé Test Bot PENGU Minimal:`);
  console.log(`   Durée: ${duration}ms`);
  console.log(`   Succès: ${success ? '✅' : '❌'}`);
  console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
  console.log(`   Mode: ${CONFIG.DRY_RUN ? 'DRY_RUN' : 'LIVE'}`);

  if (success) {
    console.log('\n🎉 Test Bot PENGU Minimal réussi !');
    console.log('   Position LP créée avec succès');
  } else {
    console.log('\n💥 Test Bot PENGU Minimal échoué !');
    process.exit(1);
  }
}

async function createPositionNft(connection, payer) {
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

async function performLpTx2(connection, ctx, client, pool, poolData, tickSpacing, positionMint, positionPda) {
  // Calculer les ticks alignés
  const currentTick = 0; // Placeholder pour le test
  const rangeTicks = Math.floor((currentTick * 15) / 100);
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
  await ensureTickArray(connection, ctx, pool.address, tickArrayLowerPda.publicKey, startLower);
  await ensureTickArray(connection, ctx, pool.address, tickArrayUpperPda.publicKey, startUpper);

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

async function ensureTickArray(connection, ctx, poolAddress, tickArrayPda, startIndex) {
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
  testBotPenguMinimal();
}

module.exports = { testBotPenguMinimal };
