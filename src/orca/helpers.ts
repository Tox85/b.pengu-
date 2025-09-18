import { 
  Connection, 
  PublicKey, 
  Keypair, 
  SystemProgram,
  Transaction,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { 
  WhirlpoolContext, 
  WhirlpoolClient, 
  PDAUtil, 
  WhirlpoolIx,
  PoolUtil,
  PriceMath,
  Percentage
} from '@orca-so/whirlpools-sdk';
import BN from 'bn.js';
import { SOLANA_CONFIG } from '../config/solana.js';
import { PoolMeta } from './discovery.js';

/**
 * Résout le pool Orca (utilise pool.data, pas getData())
 */
export async function resolvePool(
  ctx: WhirlpoolContext, 
  poolId: PublicKey
): Promise<any> {
  try {
    console.log(`🔍 Résolution du pool: ${poolId.toBase58()}`);
    
    const pool = await ctx.fetcher.getPool(poolId);
    if (!pool) {
      throw new Error(`Pool ${poolId.toBase58()} non trouvé`);
    }
    
    console.log(`   Pool trouvé: ${pool.data.whirlpoolsConfig}`);
    console.log(`   Token A: ${pool.data.tokenMintA.toBase58()}`);
    console.log(`   Token B: ${pool.data.tokenMintB.toBase58()}`);
    console.log(`   Tick Spacing: ${pool.data.tickSpacing}`);
    console.log(`   Fee Rate: ${pool.data.feeRate}`);
    
    return pool;
  } catch (error) {
    console.error('❌ Erreur résolution pool:', error);
    throw error;
  }
}

/**
 * Aligne les ticks au spacing (snap au multiple de spacing)
 */
export function alignTicks(
  currentTick: number, 
  spacing: number, 
  rangePct: number
): { tickLower: number; tickUpper: number } {
  const rangeValue = Math.floor((currentTick * rangePct) / 100);
  const tickLower = Math.floor((currentTick - rangeValue) / spacing) * spacing;
  const tickUpper = Math.floor((currentTick + rangeValue) / spacing) * spacing;
  
  console.log(`   Ticks alignés: ${tickLower} → ${tickUpper} (spacing: ${spacing})`);
  
  return { tickLower, tickUpper };
}

/**
 * Calcule les PDAs des TickArrays
 */
export function getTickArrayPDAs(
  programId: PublicKey,
  poolAddress: PublicKey,
  tickLower: number,
  tickUpper: number,
  spacing: number
): { lowerPda: any; upperPda: any; startLower: number; startUpper: number } {
  
  // Calculer startIndex = Math.floor(tick/spacing/88)*spacing*88
  const startLower = Math.floor(tickLower / spacing / 88) * spacing * 88;
  const startUpper = Math.floor(tickUpper / spacing / 88) * spacing * 88;
  
  const lowerPda = PDAUtil.getTickArray(programId, poolAddress, startLower);
  const upperPda = PDAUtil.getTickArray(programId, poolAddress, startUpper);
  
  console.log(`   TickArray Lower: ${lowerPda.publicKey.toBase58()} (start: ${startLower})`);
  console.log(`   TickArray Upper: ${upperPda.publicKey.toBase58()} (start: ${startUpper})`);
  
  return { lowerPda, upperPda, startLower, startUpper };
}

/**
 * Initialise un TickArray s'il n'existe pas
 */
export async function ensureTickArray(
  ctx: WhirlpoolContext,
  pool: any,
  tickArrayPda: any,
  startIndex: number,
  funder: PublicKey
): Promise<any[]> {
  const instructions = [];
  
  try {
    console.log(`🔍 Vérification TickArray: ${tickArrayPda.publicKey.toBase58()}`);
    
    const account = await ctx.fetcher.getTickArray(tickArrayPda.publicKey, true);
    
    if (!account) {
      console.log('   TickArray manquant, création...');
      
      const initIx = WhirlpoolIx.initializeTickArrayIx(ctx.program, {
        whirlpool: pool.address,
        funder: funder,
        startTickIndex: startIndex
      });
      
      instructions.push(initIx);
      console.log(`   Instruction d'init TickArray ajoutée (start: ${startIndex})`);
    } else {
      console.log('   TickArray existe déjà');
    }
    
  } catch (error) {
    console.error('❌ Erreur TickArray:', error);
    throw error;
  }
  
  return instructions;
}

/**
 * Obtient un quote de liquidité
 */
export async function getLiquidityQuote(
  ctx: WhirlpoolContext,
  pool: any,
  tickLower: number,
  tickUpper: number,
  inputMint: PublicKey,
  inputAmount: BN,
  slippageBps: number
): Promise<any> {
  try {
    console.log(`💰 Calcul du quote de liquidité...`);
    console.log(`   Input: ${inputAmount.toString()} (${inputMint.toBase58()})`);
    console.log(`   Range: ${tickLower} → ${tickUpper}`);
    console.log(`   Slippage: ${slippageBps} bps`);
    
    // Utiliser le SDK Orca pour le quote
    const quote = await PoolUtil.increaseLiquidityQuoteByInputToken(
      pool,
      inputMint,
      inputAmount,
      new BN(tickLower),
      new BN(tickUpper),
      Percentage.fromFraction(slippageBps, 10000)
    );
    
    console.log(`   Quote réussi:`);
    console.log(`   Liquidity: ${quote.liquidityAmount.toString()}`);
    console.log(`   Token Max A: ${quote.tokenMaxA.toString()}`);
    console.log(`   Token Max B: ${quote.tokenMaxB.toString()}`);
    
    return quote;
    
  } catch (error) {
    console.error('❌ Erreur quote SDK, fallback...', error);
    
    // Fallback simple
    const fallbackQuote = {
      liquidityAmount: inputAmount.div(new BN(2)),
      tokenMaxA: inputAmount,
      tokenMaxB: inputAmount.div(new BN(2))
    };
    
    console.log(`   Fallback quote: ${fallbackQuote.liquidityAmount.toString()}`);
    return fallbackQuote;
  }
}

/**
 * Construit les instructions de liquidité
 */
export function buildLiquidityIxs(
  ctx: WhirlpoolContext,
  pool: any,
  positionMint: Keypair,
  positionPda: any,
  positionTokenAta: PublicKey,
  userUsdcAta: PublicKey,
  userWsolAta: PublicKey,
  tickLower: number,
  tickUpper: number,
  liquidityAmount: BN,
  tokenMaxA: BN,
  tokenMaxB: BN,
  tickArrayLower: PublicKey,
  tickArrayUpper: PublicKey
): { openPositionIx: any; increaseLiquidityIx: any } {
  
  console.log(`🔨 Construction des instructions de liquidité...`);
  console.log(`   Position Mint: ${positionMint.publicKey.toBase58()}`);
  console.log(`   Position PDA: ${positionPda.publicKey.toBase58()}`);
  console.log(`   Position ATA: ${positionTokenAta.toBase58()}`);
  
  // Open Position
  const openPositionIx = WhirlpoolIx.openPositionIx(ctx.program, {
    whirlpool: pool.address,
    positionPda: positionPda.publicKey, // 👈 PDA, pas le mint !
    positionMint: positionMint.publicKey,
    positionTokenAccount: positionTokenAta,
    tickLowerIndex: new BN(tickLower),
    tickUpperIndex: new BN(tickUpper),
    funder: ctx.wallet.publicKey
  });
  
  // Increase Liquidity
  const increaseLiquidityIx = WhirlpoolIx.increaseLiquidityIx(ctx.program, {
    whirlpool: pool.address,
    position: positionPda.publicKey, // 👈 PDA, pas le mint !
    positionTokenAccount: positionTokenAta,
    tickArrayLower: tickArrayLower,
    tickArrayUpper: tickArrayUpper,
    tokenOwnerAccountA: userUsdcAta,
    tokenOwnerAccountB: userWsolAta,
    tokenVaultA: pool.data.tokenVaultA, // 👈 pool.data, pas pool.getData()
    tokenVaultB: pool.data.tokenVaultB,
    liquidityAmount: liquidityAmount,
    tokenMaxA: tokenMaxA,
    tokenMaxB: tokenMaxB
  });
  
  console.log(`   Instructions construites avec succès`);
  
  return { openPositionIx, increaseLiquidityIx };
}

/**
 * Crée un mint de position (SPL classic)
 */
export function createPositionMint(): Keypair {
  const positionMint = Keypair.generate();
  console.log(`🪙 Position mint créé: ${positionMint.publicKey.toBase58()}`);
  return positionMint;
}

/**
 * Construit la transaction TX1 (mint + ATA)
 */
export function buildTx1(
  connection: Connection,
  payer: PublicKey,
  positionMint: Keypair,
  positionTokenAta: PublicKey
): Transaction {
  const tx = new Transaction();
  
  // Compute Budget
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({
    units: SOLANA_CONFIG.COMPUTE_UNITS
  }));
  
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: SOLANA_CONFIG.PRIORITY_FEE_MICROLAMPORTS
  }));
  
  // Créer le compte mint
  const mintRent = connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  tx.add(SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: positionMint.publicKey,
    lamports: mintRent,
    space: MINT_SIZE,
    programId: TOKEN_PROGRAM_ID // 👈 SPL classic
  }));
  
  // Initialiser le mint
  tx.add(createInitializeMintInstruction(
    positionMint.publicKey,
    0, // decimals (NFT)
    payer, // mintAuthority
    payer, // freezeAuthority
    TOKEN_PROGRAM_ID // 👈 SPL classic
  ));
  
  // Créer l'ATA
  tx.add(createAssociatedTokenAccountInstruction(
    payer, // payer
    positionTokenAta, // ata
    payer, // owner
    positionMint.publicKey, // mint
    TOKEN_PROGRAM_ID // 👈 SPL classic
  ));
  
  console.log(`🔨 TX1 construite: mint + ATA`);
  
  return tx;
}

/**
 * Construit la transaction TX2 (LP instructions)
 */
export function buildTx2(
  ctx: WhirlpoolContext,
  pool: any,
  positionMint: Keypair,
  positionPda: any,
  positionTokenAta: PublicKey,
  userUsdcAta: PublicKey,
  userWsolAta: PublicKey,
  tickLower: number,
  tickUpper: number,
  liquidityAmount: BN,
  tokenMaxA: BN,
  tokenMaxB: BN,
  tickArrayLower: PublicKey,
  tickArrayUpper: PublicKey
): Transaction {
  const tx = new Transaction();
  
  // Compute Budget
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({
    units: SOLANA_CONFIG.COMPUTE_UNITS
  }));
  
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: SOLANA_CONFIG.PRIORITY_FEE_MICROLAMPORTS
  }));
  
  // Instructions de liquidité
  const { openPositionIx, increaseLiquidityIx } = buildLiquidityIxs(
    ctx, pool, positionMint, positionPda, positionTokenAta,
    userUsdcAta, userWsolAta, tickLower, tickUpper,
    liquidityAmount, tokenMaxA, tokenMaxB,
    tickArrayLower, tickArrayUpper
  );
  
  tx.add(openPositionIx);
  tx.add(increaseLiquidityIx);
  
  console.log(`🔨 TX2 construite: openPosition + increaseLiquidity`);
  
  return tx;
}
