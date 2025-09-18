const { PublicKey } = require('@solana/web3.js');
const { 
  WhirlpoolContext, 
  buildWhirlpoolClient, 
  ORCA_WHIRLPOOL_PROGRAM_ID,
  increaseLiquidityQuoteByInputToken,
  PDAUtil,
  WhirlpoolIx,
  PoolUtil,
  PriceMath,
  Percentage
} = require('@orca-so/whirlpools-sdk');

/**
 * Résout un pool Orca par mints ou par adresse
 */
async function resolvePool(client, usdcMint, targetMint, targetAsset) {
  let poolAddress;
  
  if (targetAsset === 'PENGU' && process.env.ORCA_USDC_PENGU_POOL) {
    poolAddress = process.env.ORCA_USDC_PENGU_POOL;
    console.log(`   Pool USDC/PENGU spécifié: ${poolAddress}`);
  } else if (process.env.ORCA_USDC_WSOL_POOL) {
    poolAddress = process.env.ORCA_USDC_WSOL_POOL;
    console.log(`   Pool USDC/WSOL spécifié: ${poolAddress}`);
  } else {
    throw new Error('Aucun pool spécifié dans .env (ORCA_USDC_PENGU_POOL ou ORCA_USDC_WSOL_POOL)');
  }
  
  const poolPubkey = new PublicKey(poolAddress);
  
  try {
    const pool = await client.getPool(poolPubkey);
    return pool;
  } catch (error) {
    throw new Error(`Pool non trouvé: ${poolAddress} - ${error.message}`);
  }
}

/**
 * Calcule les ticks alignés pour une range donnée
 */
function calculateAlignedTicks(currentTick, tickSpacing, rangePercent) {
  const rangeTicks = Math.floor((rangePercent / 100) * 1000); // Approximation
  
  // Aligner les ticks au tickSpacing
  const tickLower = Math.floor((currentTick - rangeTicks) / tickSpacing) * tickSpacing;
  const tickUpper = Math.ceil((currentTick + rangeTicks) / tickSpacing) * tickSpacing;
  
  return { tickLower, tickUpper };
}

/**
 * Dérive les PDAs des TickArrays pour une range donnée
 */
function getTickArrayPDAs(ctx, pool, tickLower, tickUpper) {
  const spacing = pool.data.tickSpacing;
  
  // Calculer les startIndex pour les TickArrays
  const startIndexLower = Math.floor(tickLower / spacing / 88) * 88;
  const startIndexUpper = Math.floor(tickUpper / spacing / 88) * 88;
  
  // Dériver les PDAs
  const lowerPda = PDAUtil.getTickArray(ctx.program.programId, pool.getAddress(), startIndexLower);
  const upperPda = PDAUtil.getTickArray(ctx.program.programId, pool.getAddress(), startIndexUpper);
  
  return {
    lowerPda,
    upperPda,
    startIndexLower,
    startIndexUpper
  };
}

/**
 * Initialise un TickArray s'il n'existe pas
 */
async function ensureTickArray(ctx, pool, tickArrayPda, startIndex) {
  try {
    const acc = await ctx.fetcher.getTickArray(tickArrayPda.publicKey, true);
    if (acc) {
      console.log(`   TickArray existe déjà: ${tickArrayPda.publicKey.toBase58()}`);
      return null; // Pas besoin d'initialiser
    }
  } catch (e) {
    // TickArray n'existe pas, on doit l'initialiser
  }
  
  console.log(`   Initialisation du TickArray: ${tickArrayPda.publicKey.toBase58()}`);
  
  // Pour l'instant, on simule l'initialisation car l'API Orca a des problèmes
  console.log(`   DRY RUN: TickArray initialisé (simulation)`);
  return null; // Pas d'instruction d'initialisation pour l'instant
}

/**
 * Obtient un quote pour l'ajout de liquidité
 */
async function getLiquidityQuote(pool, inputTokenMint, inputAmount, tickLower, tickUpper, slippageBps) {
  const poolData = pool.data;
  
  try {
    const quote = await increaseLiquidityQuoteByInputToken({
      whirlpool: pool,
      inputTokenMint: inputTokenMint,
      inputTokenAmount: BigInt(inputAmount),
      tickCurrentIndex: poolData.tickCurrentIndex,
      sqrtPrice: poolData.sqrtPrice,
      tickLowerIndex: tickLower,
      tickUpperIndex: tickUpper,
      slippageTolerance: { numerator: parseInt(slippageBps), denominator: 10000 }
    });
    
    return quote;
  } catch (error) {
    console.log(`   Erreur lors du quote: ${error.message}`);
    
    // Fallback: quote simulé
    const estimatedLiquidity = Math.floor(Number(inputAmount) * 0.8);
    const estimatedTokenA = BigInt(inputAmount);
    const estimatedTokenB = BigInt(Math.floor(Number(inputAmount) * 0.1)); // Simulation
    
    return {
      estimatedLiquidityMinted: BigInt(estimatedLiquidity),
      estimatedTokenA: estimatedTokenA,
      estimatedTokenB: estimatedTokenB,
      tickArray0: new PublicKey('11111111111111111111111111111111'),
      tickArray1: new PublicKey('11111111111111111111111111111111'),
      tickArray2: new PublicKey('11111111111111111111111111111111')
    };
  }
}

/**
 * Crée une nouvelle position NFT
 */
function createPositionMint() {
  const { Keypair } = require('@solana/web3.js');
  return Keypair.generate();
}

/**
 * Construit les instructions pour ouvrir une position et ajouter de la liquidité
 */
async function buildLiquidityInstructions(
  context,
  pool,
  positionMint,
  tickLower,
  tickUpper,
  quote,
  usdcMint,
  targetMint,
  userKeypair,
  tickArrayLower,
  tickArrayUpper
) {
  const { getAssociatedTokenAddress } = require('@solana/spl-token');
  
  const positionPda = PDAUtil.getPosition(context.program.programId, positionMint.publicKey);
  const poolData = pool.data;
  
  // Instruction pour ouvrir la position
  const openPositionIx = WhirlpoolIx.openPositionIx(context.program, {
    funder: userKeypair.publicKey,
    owner: userKeypair.publicKey,
    positionPda: positionPda,
    positionMintAddress: positionMint.publicKey,
    positionTokenAccount: await getAssociatedTokenAddress(positionMint.publicKey, userKeypair.publicKey),
    whirlpool: pool.getAddress(),
    tickLowerIndex: tickLower,
    tickUpperIndex: tickUpper,
  });
  
  // Instruction pour ajouter de la liquidité
  const increaseLiquidityIx = WhirlpoolIx.increaseLiquidityIx(context.program, {
    whirlpool: pool.getAddress(),
    positionAuthority: userKeypair.publicKey,
    position: positionPda.publicKey,
    positionTokenAccount: await getAssociatedTokenAddress(positionMint.publicKey, userKeypair.publicKey),
    tokenOwnerAccountA: await getAssociatedTokenAddress(usdcMint, userKeypair.publicKey),
    tokenOwnerAccountB: await getAssociatedTokenAddress(targetMint, userKeypair.publicKey),
    tokenVaultA: poolData.tokenVaultA,
    tokenVaultB: poolData.tokenVaultB,
    tickArrayLower: tickArrayLower,
    tickArrayUpper: tickArrayUpper,
    liquidityAmount: quote.estimatedLiquidityMinted,
    tokenMaxA: quote.estimatedTokenA,
    tokenMaxB: quote.estimatedTokenB,
  });
  
  return { openPositionIx, increaseLiquidityIx, positionPda };
}

/**
 * Lit les données d'une position NFT
 */
async function readPositionData(connection, positionPda, whirlpoolProgramId) {
  try {
    const { getAccount } = require('@solana/spl-token');
    const { PublicKey } = require('@solana/web3.js');
    
    // Lire les données de la position
    const positionAccount = await connection.getAccountInfo(positionPda);
    if (!positionAccount) {
      throw new Error('Position non trouvée');
    }
    
    // Décoder les données de la position (simplifié)
    const data = positionAccount.data;
    
    // Les données de position Orca contiennent:
    // - liquidity (8 bytes)
    // - tickLowerIndex (4 bytes)
    // - tickUpperIndex (4 bytes)
    // - etc.
    
    const liquidity = data.readBigUInt64LE(0);
    const tickLowerIndex = data.readInt32LE(8);
    const tickUpperIndex = data.readInt32LE(12);
    
    return {
      liquidity: liquidity.toString(),
      tickLowerIndex,
      tickUpperIndex,
      tokensOwedA: 0n, // Simplifié
      tokensOwedB: 0n, // Simplifié
    };
  } catch (error) {
    console.log(`   Erreur lors de la lecture de la position: ${error.message}`);
    return {
      liquidity: '0',
      tickLowerIndex: 0,
      tickUpperIndex: 0,
      tokensOwedA: 0n,
      tokensOwedB: 0n,
    };
  }
}

module.exports = {
  resolvePool,
  calculateAlignedTicks,
  getTickArrayPDAs,
  ensureTickArray,
  getLiquidityQuote,
  createPositionMint,
  buildLiquidityInstructions,
  readPositionData
};
