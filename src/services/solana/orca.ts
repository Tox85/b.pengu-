import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID } from '@orca-so/whirlpools-sdk';
import { logger } from '../../logger';

export interface OrcaConfig {
  rpcUrl: string;
  programId: string;
  usdcPenguPool: string;
  usdcWsolPool: string;
  dryRun: boolean;
}

export interface OrcaPoolInfo {
  address: PublicKey;
  tokenA: { mint: PublicKey; symbol: string; decimals: number };
  tokenB: { mint: PublicKey; symbol: string; decimals: number };
  tickSpacing: number;
  sqrtPrice: string;
  liquidity: string;
}

export interface OrcaLiquidityPosition {
  positionAddress: PublicKey;
  tickLowerIndex: number;
  tickUpperIndex: number;
  liquidity: string;
}

export class OrcaService {
  private connection: Connection;
  private context: WhirlpoolContext;
  private client: any;
  private config: OrcaConfig;

  constructor(config: OrcaConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl);
    this.context = WhirlpoolContext.from(
      this.connection,
      new PublicKey(config.programId)
    );
    this.client = buildWhirlpoolClient(this.context);
  }

  async getPoolInfo(poolAddress: string): Promise<OrcaPoolInfo> {
    logger.info(`🏊 Fetching Orca pool info: ${poolAddress}`);
    
    try {
      const pool = await this.client.getPool(new PublicKey(poolAddress));
      const data = pool.getData();
      
      const poolInfo: OrcaPoolInfo = {
        address: new PublicKey(poolAddress),
        tokenA: {
          mint: data.tokenMintA,
          symbol: 'USDC', // Assumé pour le token A
          decimals: 6
        },
        tokenB: {
          mint: data.tokenMintB,
          symbol: 'PENGU', // Assumé pour le token B
          decimals: 9
        },
        tickSpacing: data.tickSpacing,
        sqrtPrice: data.sqrtPrice.toString(),
        liquidity: data.liquidity.toString()
      };
      
      logger.info('✅ Pool info fetched successfully');
      logger.info(`   Token A: ${poolInfo.tokenA.symbol} (${poolInfo.tokenA.mint.toString()})`);
      logger.info(`   Token B: ${poolInfo.tokenB.symbol} (${poolInfo.tokenB.mint.toString()})`);
      logger.info(`   Tick Spacing: ${poolInfo.tickSpacing}`);
      logger.info(`   Liquidity: ${poolInfo.liquidity}`);
      
      return poolInfo;
    } catch (error: any) {
      logger.error('❌ Failed to get pool info:', error.message);
      throw new Error(`Pool info failed: ${error.message}`);
    }
  }

  async resolvePoolByMints(mintA: string, mintB: string): Promise<PublicKey> {
    logger.info(`🔍 Resolving pool by mints: ${mintA} / ${mintB}`);
    
    try {
      // Trier les mints pour assurer la cohérence
      const [mint1, mint2] = [mintA, mintB].sort();
      
      // Essayer d'abord USDC/PENGU
      if (mint1 === this.config.usdcPenguPool.split('/')[0] && mint2 === this.config.usdcPenguPool.split('/')[1]) {
        return new PublicKey(this.config.usdcPenguPool);
      }
      
      // Fallback vers USDC/WSOL
      if (mint1 === this.config.usdcWsolPool.split('/')[0] && mint2 === this.config.usdcWsolPool.split('/')[1]) {
        return new PublicKey(this.config.usdcWsolPool);
      }
      
      // Recherche dynamique dans les pools disponibles
      const pools = await this.client.getPools();
      for (const pool of pools) {
        const data = pool.getData();
        const poolMints = [data.tokenMintA.toString(), data.tokenMintB.toString()].sort();
        if (poolMints[0] === mint1 && poolMints[1] === mint2) {
          logger.info(`✅ Pool found: ${pool.getAddress().toString()}`);
          return pool.getAddress();
        }
      }
      
      throw new Error(`No pool found for mints ${mintA} / ${mintB}`);
    } catch (error: any) {
      logger.error('❌ Failed to resolve pool:', error.message);
      throw error;
    }
  }

  async ensureAta(owner: Keypair, mint: PublicKey): Promise<PublicKey> {
    logger.info(`🔑 Ensuring ATA for mint: ${mint.toString()}`);
    
    try {
      const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
      
      const ata = await getAssociatedTokenAddress(mint, owner.publicKey);
      
      // Vérifier si l'ATA existe
      const accountInfo = await this.connection.getAccountInfo(ata);
      
      if (!accountInfo) {
        logger.info('Creating ATA...');
        
        const createAtaIx = createAssociatedTokenAccountInstruction(
          owner.publicKey, // payer
          ata,             // ata
          owner.publicKey, // owner
          mint             // mint
        );
        
        const transaction = new Transaction().add(createAtaIx);
        const signature = await this.connection.sendTransaction(transaction, [owner]);
        await this.connection.confirmTransaction(signature);
        
        logger.info(`✅ ATA created: ${ata.toString()}`);
      } else {
        logger.info(`✅ ATA already exists: ${ata.toString()}`);
      }
      
      return ata;
    } catch (error: any) {
      logger.error(`❌ Failed to ensure ATA: ${error.message}`);
      throw error;
    }
  }

  async addLiquidityUSDC_PENGU(
    owner: Keypair,
    usdcAmount: bigint,
    penguAmount: bigint,
    rangePercent: number = 15 // ±15% par défaut
  ): Promise<{ positionAddress: PublicKey; signature: string }> {
    const isDryRun = this.config.dryRun;
    logger.info(`🏊 Adding USDC/PENGU liquidity (Dry Run: ${isDryRun})`);
    logger.info(`   USDC: ${usdcAmount.toString()}`);
    logger.info(`   PENGU: ${penguAmount.toString()}`);
    logger.info(`   Range: ±${rangePercent}%`);

    if (isDryRun) {
      logger.info('🔍 DRY RUN: Would add liquidity');
      logger.info(`   Pool: USDC/PENGU`);
      logger.info(`   Range: ±${rangePercent}%`);
      
      return {
        positionAddress: new PublicKey('11111111111111111111111111111111'), // Mock address
        signature: 'dry_run_' + Date.now()
      };
    }

    // Mode LIVE
    logger.info('🔥 LIVE MODE: Adding liquidity...');
    
    try {
      // Résoudre le pool USDC/PENGU
      const poolAddress = await this.resolvePoolByMints(
        process.env.SOL_USDC_MINT!,
        process.env.SOL_PENGU_MINT!
      );
      
      const pool = await this.client.getPool(poolAddress);
      const poolData = pool.getData();
      
      // Calculer le range de prix concentré
      const currentPrice = this.sqrtPriceToPrice(poolData.sqrtPrice);
      const priceLower = currentPrice * (1 - rangePercent / 100);
      const priceUpper = currentPrice * (1 + rangePercent / 100);
      
      // Convertir les prix en ticks
      const tickLower = this.priceToTick(priceLower, poolData.tickSpacing);
      const tickUpper = this.priceToTick(priceUpper, poolData.tickSpacing);
      
      logger.info(`   Current Price: ${currentPrice}`);
      logger.info(`   Price Range: ${priceLower} - ${priceUpper}`);
      logger.info(`   Tick Range: ${tickLower} - ${tickUpper}`);
      
      // S'assurer que les ATAs existent
      const usdcAta = await this.ensureAta(owner, poolData.tokenMintA);
      const penguAta = await this.ensureAta(owner, poolData.tokenMintB);
      
      // Créer la position de liquidité
      const { positionPda, positionMintAddress } = await this.client.openPosition({
        whirlpool: poolAddress,
        owner: owner.publicKey,
        tickLowerIndex: tickLower,
        tickUpperIndex: tickUpper,
      });
      
      logger.info(`   Position Address: ${positionPda.toString()}`);
      logger.info(`   Position Mint: ${positionMintAddress.toString()}`);
      
      // Ajouter la liquidité
      const { transaction, signers } = await this.client.increaseLiquidity({
        positionPda,
        owner: owner.publicKey,
        tokenAmountA: usdcAmount,
        tokenAmountB: penguAmount,
        tickLowerIndex: tickLower,
        tickUpperIndex: tickUpper,
      });
      
      // Signer et envoyer la transaction
      transaction.sign(...signers);
      const signature = await this.connection.sendTransaction(transaction, [owner, ...signers]);
      
      logger.info(`✅ Liquidity added: ${signature}`);
      
      return {
        positionAddress: positionPda,
        signature
      };
      
    } catch (error: any) {
      logger.error(`❌ Failed to add liquidity: ${error.message}`);
      throw error;
    }
  }

  async withdrawLiquidityPartial(
    owner: Keypair,
    positionAddress: PublicKey,
    percentage: number = 50 // 50% par défaut
  ): Promise<{ signature: string }> {
    const isDryRun = this.config.dryRun;
    logger.info(`💧 Withdrawing ${percentage}% of liquidity (Dry Run: ${isDryRun})`);

    if (isDryRun) {
      logger.info('🔍 DRY RUN: Would withdraw liquidity');
      logger.info(`   Position: ${positionAddress.toString()}`);
      logger.info(`   Percentage: ${percentage}%`);
      
      return { signature: 'dry_run_' + Date.now() };
    }

    // Mode LIVE
    logger.info('🔥 LIVE MODE: Withdrawing liquidity...');
    
    try {
      // Récupérer les informations de la position
      const position = await this.client.getPosition(positionAddress);
      const positionData = position.getData();
      
      // Calculer le montant à retirer
      const liquidityToWithdraw = BigInt(positionData.liquidity) * BigInt(percentage) / 100n;
      
      logger.info(`   Position Liquidity: ${positionData.liquidity}`);
      logger.info(`   Withdrawing: ${liquidityToWithdraw.toString()} (${percentage}%)`);
      
      // Créer la transaction de retrait
      const { transaction, signers } = await this.client.decreaseLiquidity({
        positionPda: positionAddress,
        owner: owner.publicKey,
        liquidityAmount: liquidityToWithdraw,
        tickLowerIndex: positionData.tickLowerIndex,
        tickUpperIndex: positionData.tickUpperIndex,
      });
      
      // Signer et envoyer la transaction
      transaction.sign(...signers);
      const signature = await this.connection.sendTransaction(transaction, [owner, ...signers]);
      
      logger.info(`✅ Liquidity withdrawn: ${signature}`);
      
      return { signature };
      
    } catch (error: any) {
      logger.error(`❌ Failed to withdraw liquidity: ${error.message}`);
      throw error;
    }
  }

  private sqrtPriceToPrice(sqrtPrice: string): number {
    const sqrtPriceNum = parseFloat(sqrtPrice);
    return sqrtPriceNum * sqrtPriceNum;
  }

  private priceToTick(price: number, tickSpacing: number): number {
    // Formule simplifiée pour convertir le prix en tick
    const tick = Math.log(price) / Math.log(1.0001);
    return Math.floor(tick / tickSpacing) * tickSpacing;
  }
}

export function createOrcaService(config: OrcaConfig): OrcaService {
  return new OrcaService(config);
}