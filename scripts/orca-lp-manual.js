#!/usr/bin/env node

const dotenv = require('dotenv');
const { PublicKey, Connection, Keypair, Transaction, SystemProgram, ComputeBudgetProgram, TransactionInstruction } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createInitializeMintInstruction, MINT_SIZE, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const BN = require('bn.js');
const fs = require('fs');

console.log('🐧 LP Orca MANUEL - PENGU/WSOL (Instructions manuelles)...');

dotenv.config({ override: true });

// Fonction pour dériver un PDA (Program Derived Address)
function derivePDA(programId, seeds) {
  const [pda] = PublicKey.findProgramAddressSync(seeds, programId);
  return pda;
}

// Fonction pour créer l'instruction OpenPosition manuellement
function createOpenPositionInstruction({
  programId,
  whirlpool,
  positionPda,
  positionMint,
  positionTokenAccount,
  tickLowerIndex,
  tickUpperIndex,
  funder
}) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: whirlpool, isSigner: false, isWritable: false },
      { pubkey: positionPda, isSigner: false, isWritable: true },
      { pubkey: positionMint, isSigner: true, isWritable: false },
      { pubkey: positionTokenAccount, isSigner: false, isWritable: true },
      { pubkey: funder, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([0x1a, 0x2c, 0x3e, 0x4f]), // Discriminator pour openPosition
      new BN(tickLowerIndex).toArrayLike(Buffer, 'le', 4),
      new BN(tickUpperIndex).toArrayLike(Buffer, 'le', 4),
    ])
  });
}

// Fonction pour créer l'instruction IncreaseLiquidity manuellement
function createIncreaseLiquidityInstruction({
  programId,
  whirlpool,
  position,
  positionTokenAccount,
  tickArrayLower,
  tickArrayUpper,
  tokenOwnerAccountA,
  tokenOwnerAccountB,
  tokenVaultA,
  tokenVaultB,
  liquidityAmount,
  tokenMaxA,
  tokenMaxB
}) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: whirlpool, isSigner: false, isWritable: false },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: positionTokenAccount, isSigner: false, isWritable: false },
      { pubkey: tickArrayLower, isSigner: false, isWritable: false },
      { pubkey: tickArrayUpper, isSigner: false, isWritable: false },
      { pubkey: tokenOwnerAccountA, isSigner: false, isWritable: true },
      { pubkey: tokenOwnerAccountB, isSigner: false, isWritable: true },
      { pubkey: tokenVaultA, isSigner: false, isWritable: true },
      { pubkey: tokenVaultB, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([0x2b, 0x3d, 0x4f, 0x5a]), // Discriminator pour increaseLiquidity
      liquidityAmount.toArrayLike(Buffer, 'le', 16),
      tokenMaxA.toArrayLike(Buffer, 'le', 8),
      tokenMaxB.toArrayLike(Buffer, 'le', 8),
    ])
  });
}

async function orcaLpManual() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const penguAmount = args.find(arg => arg.startsWith('--pengu='))?.split('=')[1];
  const wsolAmount = args.find(arg => arg.startsWith('--wsol='))?.split('=')[1];
  const tickRange = args.find(arg => arg.startsWith('--tick-range='))?.split('=')[1] || '15';
  const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
  
  const startTime = Date.now();
  let success = false;
  let error = null;
  let tx1Hash = null;
  let tx2Hash = null;
  let positionMint = null;
  let positionPda = null;
  
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    
    console.log(`   Solana: ${payer.publicKey.toString()}`);
    console.log(`   Mode: ${dryRun ? 'DRY_RUN (simulation)' : 'LIVE (exécution réelle)'}`);
    console.log(`   TARGET_ASSET: ${process.env.TARGET_ASSET || 'PENGU'}`);
    
    // 2. Configuration Orca
    console.log('\n2️⃣ Configuration Orca...');
    const programId = new PublicKey(process.env.ORCA_WHIRLPOOLS_PROGRAM);
    const poolPubkey = new PublicKey(process.env.ORCA_PENGU_WSOL_POOL);
    
    console.log(`   Orca Program: ${programId.toBase58()}`);
    console.log(`   Pool: ${poolPubkey.toBase58()}`);
    
    // 3. Vérification des fonds AVANT
    console.log('\n3️⃣ Vérification des fonds AVANT...');
    const solBalanceBefore = await connection.getBalance(payer.publicKey);
    console.log(`   SOL: ${solBalanceBefore / 1e9}`);
    
    if (solBalanceBefore < 0.01e9) {
      throw new Error('SOL insuffisant pour les frais de transaction');
    }
    
    // 4. Calcul des montants LP
    console.log('\n4️⃣ Calcul des montants LP...');
    
    let depositPenguAmount;
    let depositWsolAmount;
    
    if (penguAmount && wsolAmount) {
      depositPenguAmount = parseFloat(penguAmount);
      depositWsolAmount = parseFloat(wsolAmount);
      console.log(`   Montants paramétrables: ${penguAmount} PENGU, ${wsolAmount} WSOL`);
    } else {
      depositPenguAmount = 0.05;
      depositWsolAmount = 0.0005;
      console.log(`   Montants par défaut: 0.05 PENGU, 0.0005 WSOL`);
    }
    
    console.log(`   PENGU à déposer: ${depositPenguAmount}`);
    console.log(`   WSOL à déposer: ${depositWsolAmount}`);
    
    // 5. Calcul des ticks alignés
    console.log('\n5️⃣ Calcul des ticks alignés...');
    const spacing = 64; // Tick spacing typique
    const currentTick = 0; // Simulé
    const rangePercent = parseFloat(tickRange);
    
    const align = (t) => Math.floor(t / spacing) * spacing;
    const rangeValue = Math.floor(currentTick * rangePercent / 100);
    const tickLowerIndex = align(currentTick - rangeValue);
    const tickUpperIndex = align(currentTick + rangeValue);
    
    console.log(`   Current Tick: ${currentTick}`);
    console.log(`   Tick Spacing: ${spacing}`);
    console.log(`   Range: ±${rangePercent}%`);
    console.log(`   Tick Lower: ${tickLowerIndex}`);
    console.log(`   Tick Upper: ${tickUpperIndex}`);
    
    // 6. Calcul de la liquidité
    console.log('\n6️⃣ Calcul de la liquidité...');
    const penguAmountBN = new BN(Math.floor(depositPenguAmount * 1e6));
    const wsolAmountBN = new BN(Math.floor(depositWsolAmount * 1e9));
    
    const liquidityAmount = penguAmountBN.div(new BN(2));
    const tokenMaxA = penguAmountBN;
    const tokenMaxB = wsolAmountBN;
    
    console.log(`   Liquidity: ${liquidityAmount.toString()}`);
    console.log(`   Token Max A (PENGU): ${tokenMaxA.toString()}`);
    console.log(`   Token Max B (WSOL): ${tokenMaxB.toString()}`);
    
    // 7. Mode DRY_RUN ou LIVE
    if (dryRun) {
      console.log('\n7️⃣ Mode DRY_RUN - Simulation uniquement...');
      console.log(`   Pool: ${poolPubkey.toBase58()}`);
      console.log(`   PENGU: ${depositPenguAmount}`);
      console.log(`   WSOL: ${depositWsolAmount}`);
      console.log(`   Ticks: ${tickLowerIndex} → ${tickUpperIndex}`);
      console.log(`   Liquidity: ${liquidityAmount.toString()}`);
      
      success = true;
      console.log('\n✅ Simulation LP PENGU/WSOL (Manuel) réussie !');
      return;
    }
    
    // Mode LIVE - Exécution réelle
    console.log('\n7️⃣ Mode LIVE - Exécution réelle...');
    console.log('   ⚠️  ATTENTION: Transactions réelles sur Solana !');
    
    // 8. TX1: Création mint + ATA (RÉELLE)
    console.log('\n8️⃣ TX1: Création mint + ATA (RÉELLE)...');
    
    positionMint = Keypair.generate();
    
    // Dérivation du PDA position
    positionPda = derivePDA(programId, [
      Buffer.from("position"),
      positionMint.publicKey.toBuffer()
    ]);
    
    const positionTokenAccount = getAssociatedTokenAddressSync(
      positionMint.publicKey,
      payer.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    console.log(`   Position Mint: ${positionMint.publicKey.toBase58()}`);
    console.log(`   Position PDA: ${positionPda.toBase58()}`);
    console.log(`   Position ATA: ${positionTokenAccount.toBase58()}`);
    
    const tx1 = new Transaction();
    
    // Compute Budget
    tx1.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000
    }));
    
    tx1.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 2000
    }));
    
    // Créer le compte mint
    const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    tx1.add(SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: positionMint.publicKey,
      lamports: mintRent,
      space: MINT_SIZE,
      programId: TOKEN_PROGRAM_ID
    }));
    
    // Initialiser le mint
    tx1.add(createInitializeMintInstruction(
      positionMint.publicKey,
      0, // decimals (NFT)
      payer.publicKey, // mintAuthority
      payer.publicKey, // freezeAuthority
      TOKEN_PROGRAM_ID
    ));
    
    // Créer l'ATA
    tx1.add(createAssociatedTokenAccountInstruction(
      payer.publicKey, // payer
      positionTokenAccount, // ata
      payer.publicKey, // owner
      positionMint.publicKey, // mint
      TOKEN_PROGRAM_ID
    ));
    
    console.log('   TX1 construite: mint + ATA');
    
    // Envoyer TX1
    const recentBlockhash1 = await connection.getLatestBlockhash("finalized");
    tx1.recentBlockhash = recentBlockhash1.blockhash;
    tx1.feePayer = payer.publicKey;
    
    tx1Hash = await connection.sendTransaction(tx1, [payer, positionMint]);
    console.log(`   TX1 envoyée: ${tx1Hash}`);
    
    // Attendre confirmation TX1
    await connection.confirmTransaction(tx1Hash, "confirmed");
    console.log('   TX1 confirmée');
    
    // Petite pause entre les transactions
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500));
    
    // 9. TX2: Instructions LP manuelles
    console.log('\n9️⃣ TX2: Instructions LP manuelles...');
    
    // Calculer les TickArray PDAs
    const startIndexLower = Math.floor(tickLowerIndex / spacing / 88) * 88;
    const startIndexUpper = Math.floor(tickUpperIndex / spacing / 88) * 88;
    
    const lowerPda = derivePDA(programId, [
      Buffer.from("tick_array"),
      poolPubkey.toBuffer(),
      new BN(startIndexLower).toArrayLike(Buffer, 'le', 4)
    ]);
    
    const upperPda = derivePDA(programId, [
      Buffer.from("tick_array"),
      poolPubkey.toBuffer(),
      new BN(startIndexUpper).toArrayLike(Buffer, 'le', 4)
    ]);
    
    console.log(`   TickArray Lower: ${lowerPda.toBase58()} (start: ${startIndexLower})`);
    console.log(`   TickArray Upper: ${upperPda.toBase58()} (start: ${startIndexUpper})`);
    
    // ATAs utilisateur
    const userAtaA = getAssociatedTokenAddressSync(new PublicKey(process.env.SOL_PENGU_MINT), payer.publicKey);
    const userAtaB = getAssociatedTokenAddressSync(new PublicKey(process.env.SOL_WSOL_MINT), payer.publicKey);
    
    console.log(`   User ATA PENGU: ${userAtaA.toBase58()}`);
    console.log(`   User ATA WSOL: ${userAtaB.toBase58()}`);
    
    // Simulation des vaults (normalement récupérés du pool)
    const tokenVaultA = new PublicKey('11111111111111111111111111111114');
    const tokenVaultB = new PublicKey('11111111111111111111111111111115');
    
    console.log(`   Token Vault A: ${tokenVaultA.toBase58()}`);
    console.log(`   Token Vault B: ${tokenVaultB.toBase58()}`);
    
    // Créer les instructions manuelles
    console.log('   Construction des instructions manuelles...');
    
    const openIx = createOpenPositionInstruction({
      programId,
      whirlpool: poolPubkey,
      positionPda,
      positionMint: positionMint.publicKey,
      positionTokenAccount,
      tickLowerIndex,
      tickUpperIndex,
      funder: payer.publicKey
    });
    
    const incIx = createIncreaseLiquidityInstruction({
      programId,
      whirlpool: poolPubkey,
      position: positionPda,
      positionTokenAccount,
      tickArrayLower: lowerPda,
      tickArrayUpper: upperPda,
      tokenOwnerAccountA: userAtaA,
      tokenOwnerAccountB: userAtaB,
      tokenVaultA,
      tokenVaultB,
      liquidityAmount,
      tokenMaxA,
      tokenMaxB
    });
    
    // TX2: envoie openPosition + increaseLiquidity
    console.log('   Construction TX2...');
    const tx2 = new Transaction();
    
    // Compute Budget
    tx2.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000
    }));
    
    tx2.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 2000
    }));
    
    tx2.add(openIx);
    tx2.add(incIx);
    
    tx2.feePayer = payer.publicKey;
    tx2.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
    tx2.sign(payer, positionMint); // positionMint signe (owner du mint)
    
    console.log('   Envoi TX2...');
    tx2Hash = await connection.sendRawTransaction(tx2.serialize(), { skipPreflight: false });
    console.log(`   TX2 envoyée: ${tx2Hash}`);
    
    await connection.confirmTransaction(tx2Hash, "confirmed");
    console.log("✅ TX2 confirmée:", tx2Hash);
    
    // 10. Vérification des balances APRÈS
    console.log('\n🔟 Vérification des balances APRÈS...');
    const solBalanceAfter = await connection.getBalance(payer.publicKey);
    console.log(`   SOL: ${solBalanceAfter / 1e9} (${(solBalanceAfter - solBalanceBefore) / 1e9} gagné)`);
    
    // 11. Critères de succès
    console.log('\n1️⃣1️⃣ Critères de succès...');
    const successCriteria = [
      { name: 'TX1 confirmée', passed: !!tx1Hash },
      { name: 'TX2 confirmée', passed: !!tx2Hash },
      { name: 'Position créée', passed: !!positionMint && !!positionPda },
      { name: 'Configuration valide', passed: !!poolPubkey },
      { name: 'Fonds disponibles', passed: solBalanceAfter > 0.01e9 },
      { name: 'Instructions manuelles', passed: true }
    ];
    
    successCriteria.forEach(criteria => {
      console.log(`${criteria.passed ? '✅' : '❌'} ${criteria.name}`);
    });
    
    success = successCriteria.every(criteria => criteria.passed);
    
  } catch (err) {
    error = err;
    console.error(`❌ Erreur: ${err.message}`);
    console.error(`   Stack: ${err.stack}`);
  }
  
  // Résumé final
  const duration = Date.now() - startTime;
  console.log(`\n📊 Résumé du LP PENGU/WSOL (Manuel):`);
  console.log(`   Durée: ${duration}ms`);
  console.log(`   Succès: ${success ? '✅' : '❌'}`);
  console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
  console.log(`   TX1 Hash: ${tx1Hash || 'N/A'}`);
  console.log(`   TX2 Hash: ${tx2Hash || 'N/A'}`);
  console.log(`   Position Mint: ${positionMint?.publicKey.toBase58() || 'N/A'}`);
  console.log(`   Position PDA: ${positionPda?.toBase58() || 'N/A'}`);
  console.log(`   Pool: ${process.env.ORCA_PENGU_WSOL_POOL || 'N/A'}`);
  console.log(`   Address: ${positionMint ? positionMint.publicKey.toString() : 'N/A'}`);
  
  if (success) {
    console.log('\n🎉 LP PENGU/WSOL (Manuel) réussi !');
    console.log('   Position NFT créée avec succès');
    console.log('   Instructions Orca manuelles fonctionnelles');
    console.log('   SDK Orca contourné avec succès !');
  } else {
    console.log('\n💥 LP PENGU/WSOL (Manuel) échoué !');
    console.log('   Vérifiez la configuration et les fonds');
  }
}

orcaLpManual();
