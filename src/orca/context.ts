import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { WhirlpoolContext, buildWhirlpoolClient, IGNORE_CACHE } from "@orca-so/whirlpools-sdk";

/**
 * Crée un wallet Anchor à partir d'un Keypair
 * @param keypair - Keypair Solana
 * @returns Wallet Anchor
 */
export function makeWallet(keypair: Keypair): Wallet {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async (tx) => {
      tx.partialSign(keypair);
      return tx;
    },
    signAllTransactions: async (txs) => {
      txs.forEach(tx => tx.partialSign(keypair));
      return txs;
    }
  };
}

/**
 * Crée un Provider Anchor
 * @param connection - Connexion Solana
 * @param keypair - Keypair Solana
 * @returns Provider Anchor
 */
export function makeProvider(connection: Connection, keypair: Keypair): AnchorProvider {
  const wallet = makeWallet(keypair);
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

/**
 * Crée un contexte Whirlpool
 * @param connection - Connexion Solana
 * @param keypair - Keypair Solana
 * @param programId - Program ID Orca Whirlpools
 * @returns Contexte Whirlpool
 */
export function makeWhirlpoolContext(
  connection: Connection,
  keypair: Keypair,
  programId: PublicKey
): WhirlpoolContext {
  const provider = makeProvider(connection, keypair);
  return WhirlpoolContext.withProvider(provider, programId);
}

/**
 * Crée un client Whirlpool
 * @param connection - Connexion Solana
 * @param keypair - Keypair Solana
 * @param programId - Program ID Orca Whirlpools
 * @returns Client Whirlpool
 */
export function makeWhirlpoolClient(
  connection: Connection,
  keypair: Keypair,
  programId: PublicKey
) {
  const ctx = makeWhirlpoolContext(connection, keypair, programId);
  return buildWhirlpoolClient(ctx, IGNORE_CACHE);
}

/**
 * Interface pour les paramètres de contexte
 */
export interface WhirlpoolContextParams {
  connection: Connection;
  keypair: Keypair;
  programId: PublicKey;
}

/**
 * Classe helper pour gérer le contexte Orca
 */
export class OrcaContext {
  public readonly connection: Connection;
  public readonly keypair: Keypair;
  public readonly programId: PublicKey;
  public readonly provider: AnchorProvider;
  public readonly context: WhirlpoolContext;
  public readonly client: any;

  constructor(params: WhirlpoolContextParams) {
    this.connection = params.connection;
    this.keypair = params.keypair;
    this.programId = params.programId;
    this.provider = makeProvider(params.connection, params.keypair);
    this.context = WhirlpoolContext.withProvider(this.provider, params.programId);
    this.client = buildWhirlpoolClient(this.context, IGNORE_CACHE);
  }

  /**
   * Récupère les données d'un pool
   * @param poolAddress - Adresse du pool
   * @returns Données du pool
   */
  async getPoolData(poolAddress: PublicKey) {
    const pool = await this.client.getPool(poolAddress);
    return pool.data;
  }
}
