import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction,
  SystemProgram,
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
import pRetry from 'p-retry';
import { SOLANA_CONFIG } from '../config/solana.js';
import { PoolMeta, getPenguWsolPool } from './discovery.js';

export interface LpResult {
  success: boolean;
  tx1Hash?: string;
  tx2Hash?: string;
  positionMint?: string;
  positionPda?: string;
  liquidity?: string;
  error?: string;
}

/**
 * Implémentation réelle du LP Orca avec SDK
 */
export class OrcaWhirlpoolsReal {
  private connection: Connection;
  private ctx: WhirlpoolContext;
  private client: WhirlpoolClient;

  constructor(connection: Connection) {
    this.connection = connection;
    this.client = new WhirlpoolClient(SOLANA_CONFIG.ORCA_PROGRAM, connection);
    this.ctx = this.client.getContext();
  }

  /**
   * Exécute le LP PENGU/WSOL avec le SDK Orca réel
   */
  async executeLp(
    penguAmount: number,
    wsolAmount: number,
    tickRange: number = 15,
    dryRun: boolean = false
  ): Promise<LpResult> {
    try {
      console.log('🐧 LP Orca RÉEL - PENGU/WSOL...');
      console.log(`   PENGU: ${penguAmount}`);
      console.log(`   WSOL: ${wsolAmount}`);
      console.log(`   Range: ±${tickRange}%`);
      console.log(`   Mode: ${dryRun ? 'DRY_RUN' : 'LIVE'}`);

      // 1. Découvrir le pool
      const poolMeta = await getPenguWsolPool();
      if (!poolMeta) {
        throw new Error('Aucun pool PENGU/WSOL trouvé');
      }

      console.log(`   Pool choisi: ${poolMeta.address} (TVL: $${poolMeta.tvl.toLocaleString()})`);

      // 2. Résoudre le pool
      const pool = await this.resolvePool(new PublicKey(poolMeta.address));
      
      // 3. Calculer les ticks
      const { tickLower, tickUpper } = this.calculateTicks(
        pool.data.tickCurrentIndex,
        pool.data.tickSpacing,
        tickRange
      );

      console.log(`   Ticks: ${tickLower} → ${tickUpper}`);

      // 4. Calculer la liquidité
      const penguAmountBN = new BN(Math.floor(penguAmount * 1e6));
      const wsolAmountBN = new BN(Math.floor(wsolAmount * 1e9));

      const quote = await this.getLiquidityQuote(
        pool,
        tickLower,
        tickUpper,
        SOLANA_CONFIG.PENGU_MINT,
        penguAmountBN,
        SOLANA_CONFIG.SLIPPAGE_BPS
      );

      console.log(`   Liquidity: ${quote.liquidityAmount.toString()}`);
      console.log(`   Token Max A: ${quote.tokenMaxA.toString()}`);
      console.log(`   Token Max B: ${quote.tokenMaxB.toString()}`);

      if (dryRun) {
        return {
          success: true,
          positionMint: 'DRY_RUN_MINT',
          positionPda: 'DRY_RUN_PDA',
          liquidity: quote.liquidityAmount.toString()
        };
      }

      // 5. Mode LIVE - Exécution réelle
      console.log('   ⚠️  EXÉCUTION RÉELLE - 2 transactions...');

      // TX1: Création mint + ATA
      const { tx1Hash, positionMint, positionPda, positionTokenAta } = await this.createPositionMintAndAta();

      // Petite pause entre les transactions
      await new Promise(resolve => setTimeout(resolve, 2000));

      // TX2: Instructions LP
      const tx2Hash = await this.executeLiquidityInstructions(
        pool,
        positionMint,
        positionPda,
        positionTokenAta,
        tickLower,
        tickUpper,
        quote.liquidityAmount,
        quote.tokenMaxA,
        quote.tokenMaxB
      );

      return {
        success: true,
        tx1Hash,
        tx2Hash,
        positionMint: positionMint.publicKey.toBase58(),
        positionPda: positionPda.publicKey.toBase58(),
        liquidity: quote.liquidityAmount.toString()
      };

    } catch (error) {
      console.error('❌ Erreur LP Orca:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Résout le pool Orca (utilise pool.data, pas getData())
   */
  private async resolvePool(poolId: PublicKey): Promise<any> {
    console.log(`🔍 Résolution du pool: ${poolId.toBase58()}`);
    
    const pool = await this.ctx.fetcher.getPool(poolId);
    if (!pool) {
      throw new Error(`Pool ${poolId.toBase58()} non trouvé`);
    }
    
    console.log(`   Pool trouvé: ${pool.data.whirlpoolsConfig}`);
    console.log(`   Token A: ${pool.data.tokenMintA.toBase58()}`);
    console.log(`   Token B: ${pool.data.tokenMintB.toBase58()}`);
    console.log(`   Tick Spacing: ${pool.data.tickSpacing}`);
    console.log(`   Fee Rate: ${pool.data.feeRate}`);
    
    return pool;
  }

  /**
   * Calcule les ticks alignés
   */
  private calculateTicks(
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
   * Obtient un quote de liquidité
   */
  private async getLiquidityQuote(
    pool: any,
    tickLower: number,
    tickUpper: number,
    inputMint: PublicKey,
    inputAmount: BN,
    slippageBps: number
  ): Promise<any> {
    try {
      console.log(`💰 Calcul du quote de liquidité...`);
      
      const quote = await PoolUtil.increaseLiquidityQuoteByInputToken(
        pool,
        inputMint,
        inputAmount,
        new BN(tickLower),
        new BN(tickUpper),
        Percentage.fromFraction(slippageBps, 10000)
      );
      
      console.log(`   Quote réussi: ${quote.liquidityAmount.toString()}`);
      
      return quote;
      
    } catch (error) {
      console.error('❌ Erreur quote SDK, fallback...', error);
      
      // Fallback simple
      return {
        liquidityAmount: inputAmount.div(new BN(2)),
        tokenMaxA: inputAmount,
        tokenMaxB: inputAmount.div(new BN(2))
      };
    }
  }

  /**
   * Crée le mint de position et son ATA (TX1)
   */
  private async createPositionMintAndAta(): Promise<{
    tx1Hash: string;
    positionMint: Keypair;
    positionPda: any;
    positionTokenAta: PublicKey;
  }> {
    console.log('🔨 TX1: Création mint + ATA...');

    const positionMint = Keypair.generate();
    const positionPda = PDAUtil.getPosition(SOLANA_CONFIG.ORCA_PROGRAM, positionMint.publicKey);
    const positionTokenAta = getAssociatedTokenAddressSync(
      positionMint.publicKey,
      this.ctx.wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    console.log(`   Position Mint: ${positionMint.publicKey.toBase58()}`);
    console.log(`   Position PDA: ${positionPda.publicKey.toBase58()}`);
    console.log(`   Position ATA: ${positionTokenAta.toBase58()}`);

    const tx = new Transaction();

    // Compute Budget
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: SOLANA_CONFIG.COMPUTE_UNITS
    }));

    tx.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: SOLANA_CONFIG.PRIORITY_FEE_MICROLAMPORTS
    }));

    // Créer le compte mint
    const mintRent = await this.connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    tx.add(SystemProgram.createAccount({
      fromPubkey: this.ctx.wallet.publicKey,
      newAccountPubkey: positionMint.publicKey,
      lamports: mintRent,
      space: MINT_SIZE,
      programId: TOKEN_PROGRAM_ID
    }));

    // Initialiser le mint
    tx.add(createInitializeMintInstruction(
      positionMint.publicKey,
      0, // decimals (NFT)
      this.ctx.wallet.publicKey, // mintAuthority
      this.ctx.wallet.publicKey, // freezeAuthority
      TOKEN_PROGRAM_ID
    ));

    // Créer l'ATA
    tx.add(createAssociatedTokenAccountInstruction(
      this.ctx.wallet.publicKey, // payer
      positionTokenAta, // ata
      this.ctx.wallet.publicKey, // owner
      positionMint.publicKey, // mint
      TOKEN_PROGRAM_ID
    ));

    // Envoyer TX1
    const recentBlockhash = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = recentBlockhash.blockhash;
    tx.feePayer = this.ctx.wallet.publicKey;

    const tx1Hash = await pRetry(
      () => this.connection.sendTransaction(tx, [this.ctx.wallet as any, positionMint]),
      { retries: 3, minTimeout: 1000 }
    );

    console.log(`   TX1 envoyée: ${tx1Hash}`);

    // Attendre confirmation
    await this.connection.confirmTransaction(tx1Hash);
    console.log('   TX1 confirmée');

    return { tx1Hash, positionMint, positionPda, positionTokenAta };
  }

  /**
   * Exécute les instructions de liquidité (TX2)
   */
  private async executeLiquidityInstructions(
    pool: any,
    positionMint: Keypair,
    positionPda: any,
    positionTokenAta: PublicKey,
    tickLower: number,
    tickUpper: number,
    liquidityAmount: BN,
    tokenMaxA: BN,
    tokenMaxB: BN
  ): Promise<string> {
    console.log('🔨 TX2: Instructions LP...');

    const tx = new Transaction();

    // Compute Budget
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: SOLANA_CONFIG.COMPUTE_UNITS
    }));

    tx.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: SOLANA_CONFIG.PRIORITY_FEE_MICROLAMPORTS
    }));

    // Calculer les TickArray PDAs
    const { lowerPda, upperPda } = this.getTickArrayPDAs(
      SOLANA_CONFIG.ORCA_PROGRAM,
      pool.address,
      tickLower,
      tickUpper,
      pool.data.tickSpacing
    );

    // Vérifier et initialiser les TickArrays si nécessaire
    await this.ensureTickArray(pool, lowerPda, tickLower, tx);
    await this.ensureTickArray(pool, upperPda, tickUpper, tx);

    // Open Position
    const openPositionIx = WhirlpoolIx.openPositionIx(this.ctx.program, {
      whirlpool: pool.address,
      positionPda: positionPda.publicKey, // 👈 PDA, pas le mint !
      positionMint: positionMint.publicKey,
      positionTokenAccount: positionTokenAta,
      tickLowerIndex: new BN(tickLower),
      tickUpperIndex: new BN(tickUpper),
      funder: this.ctx.wallet.publicKey
    });

    // Increase Liquidity
    const increaseLiquidityIx = WhirlpoolIx.increaseLiquidityIx(this.ctx.program, {
      whirlpool: pool.address,
      position: positionPda.publicKey, // 👈 PDA, pas le mint !
      positionTokenAccount: positionTokenAta,
      tickArrayLower: lowerPda.publicKey,
      tickArrayUpper: upperPda.publicKey,
      tokenOwnerAccountA: await getAssociatedTokenAddressSync(SOLANA_CONFIG.PENGU_MINT, this.ctx.wallet.publicKey),
      tokenOwnerAccountB: await getAssociatedTokenAddressSync(SOLANA_CONFIG.WSOL_MINT, this.ctx.wallet.publicKey),
      tokenVaultA: pool.data.tokenVaultA,
      tokenVaultB: pool.data.tokenVaultB,
      liquidityAmount: liquidityAmount,
      tokenMaxA: tokenMaxA,
      tokenMaxB: tokenMaxB
    });

    tx.add(openPositionIx);
    tx.add(increaseLiquidityIx);

    // Envoyer TX2
    const recentBlockhash = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = recentBlockhash.blockhash;
    tx.feePayer = this.ctx.wallet.publicKey;

    const tx2Hash = await pRetry(
      () => this.connection.sendTransaction(tx, [this.ctx.wallet as any]),
      { retries: 3, minTimeout: 1000 }
    );

    console.log(`   TX2 envoyée: ${tx2Hash}`);

    // Attendre confirmation
    await this.connection.confirmTransaction(tx2Hash);
    console.log('   TX2 confirmée');

    return tx2Hash;
  }

  /**
   * Calcule les PDAs des TickArrays
   */
  private getTickArrayPDAs(
    programId: PublicKey,
    poolAddress: PublicKey,
    tickLower: number,
    tickUpper: number,
    spacing: number
  ): { lowerPda: any; upperPda: any } {
    
    const startLower = Math.floor(tickLower / spacing / 88) * spacing * 88;
    const startUpper = Math.floor(tickUpper / spacing / 88) * spacing * 88;
    
    const lowerPda = PDAUtil.getTickArray(programId, poolAddress, startLower);
    const upperPda = PDAUtil.getTickArray(programId, poolAddress, startUpper);
    
    console.log(`   TickArray Lower: ${lowerPda.publicKey.toBase58()} (start: ${startLower})`);
    console.log(`   TickArray Upper: ${upperPda.publicKey.toBase58()} (start: ${startUpper})`);
    
    return { lowerPda, upperPda };
  }

  /**
   * Initialise un TickArray s'il n'existe pas
   */
  private async ensureTickArray(
    pool: any,
    tickArrayPda: any,
    startIndex: number,
    tx: Transaction
  ): Promise<void> {
    try {
      console.log(`🔍 Vérification TickArray: ${tickArrayPda.publicKey.toBase58()}`);
      
      const account = await this.ctx.fetcher.getTickArray(tickArrayPda.publicKey, true);
      
      if (!account) {
        console.log('   TickArray manquant, ajout instruction...');
        
        const initIx = WhirlpoolIx.initializeTickArrayIx(this.ctx.program, {
          whirlpool: pool.address,
          funder: this.ctx.wallet.publicKey,
          startTickIndex: startIndex
        });
        
        tx.add(initIx);
        console.log(`   Instruction d'init TickArray ajoutée (start: ${startIndex})`);
      } else {
        console.log('   TickArray existe déjà');
      }
      
    } catch (error) {
      console.log('   TickArray manquant, ajout instruction...');
      
      const initIx = WhirlpoolIx.initializeTickArrayIx(this.ctx.program, {
        whirlpool: pool.address,
        funder: this.ctx.wallet.publicKey,
        startTickIndex: startIndex
      });
      
      tx.add(initIx);
      console.log(`   Instruction d'init TickArray ajoutée (start: ${startIndex})`);
    }
  }
}
