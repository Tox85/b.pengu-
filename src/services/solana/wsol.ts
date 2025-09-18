import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram,
  LAMPORTS_PER_SOL 
} from '@solana/web3.js';
import { 
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { logger } from '../../logger';

export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

export class WSOLService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async wrapSol(
    owner: PublicKey,
    amount: number, // SOL amount
    priorityFee?: number
  ): Promise<{ signature?: string; wsolAccount: PublicKey }> {
    const isDryRun = process.env.DRY_RUN === 'true';
    
    logger.info(`Wrapping ${amount} SOL to WSOL for ${owner.toString()}`);

    try {
      const wsolAccount = await getAssociatedTokenAddress(WSOL_MINT, owner);
      
      // Vérifier si l'ATA WSOL existe
      let needsAta = false;
      try {
        await this.connection.getAccountInfo(wsolAccount);
      } catch {
        needsAta = true;
      }

      const transaction = new Transaction();

      // Créer l'ATA WSOL si nécessaire
      if (needsAta) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            owner, // payer
            wsolAccount, // ata
            owner, // owner
            WSOL_MINT // mint
          )
        );
      }

      // Transfer SOL to WSOL account
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: owner,
          toPubkey: wsolAccount,
          lamports: Math.floor(amount * LAMPORTS_PER_SOL),
        })
      );

      // Sync native (convert SOL to WSOL)
      transaction.add({
        keys: [
          { pubkey: wsolAccount, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        data: Buffer.from([17]), // SyncNative instruction
      });

      if (isDryRun) {
        logger.info('DRY RUN: Would wrap SOL to WSOL');
        return { wsolAccount };
      }

      // Mode live
      const signature = await this.connection.sendTransaction(transaction, []);
      await this.connection.confirmTransaction(signature, 'confirmed');

      logger.info(`WSOL wrapped: ${signature}`);
      return { signature, wsolAccount };

    } catch (error: any) {
      logger.error('Failed to wrap SOL:', error.message);
      throw new Error(`Wrap SOL failed: ${error.message}`);
    }
  }

  async unwrapWsolClose(
    owner: PublicKey,
    wsolAccount: PublicKey,
    priorityFee?: number
  ): Promise<{ signature?: string; solAmount: number }> {
    const isDryRun = process.env.DRY_RUN === 'true';
    
    logger.info(`Unwrapping and closing WSOL account ${wsolAccount.toString()}`);

    try {
      // Vérifier le solde WSOL
      const balance = await this.connection.getTokenAccountBalance(wsolAccount);
      const solAmount = parseFloat(balance.value.amount) / LAMPORTS_PER_SOL;

      if (solAmount === 0) {
        logger.info('No WSOL to unwrap');
        return { solAmount: 0 };
      }

      const transaction = new Transaction();

      // Sync native (convert WSOL to SOL)
      transaction.add({
        keys: [
          { pubkey: wsolAccount, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        data: Buffer.from([17]), // SyncNative instruction
      });

      // Close account (transfers remaining SOL to owner)
      transaction.add(
        createCloseAccountInstruction(
          wsolAccount, // account to close
          owner, // destination
          owner, // authority
          [] // multisig signers
        )
      );

      if (isDryRun) {
        logger.info(`DRY RUN: Would unwrap ${solAmount} SOL from WSOL`);
        return { solAmount };
      }

      // Mode live
      const signature = await this.connection.sendTransaction(transaction, []);
      await this.connection.confirmTransaction(signature, 'confirmed');

      logger.info(`WSOL unwrapped: ${signature}, ${solAmount} SOL recovered`);
      return { signature, solAmount };

    } catch (error: any) {
      logger.error('Failed to unwrap WSOL:', error.message);
      throw new Error(`Unwrap WSOL failed: ${error.message}`);
    }
  }

  async getWsolBalance(owner: PublicKey): Promise<number> {
    try {
      const wsolAccount = await getAssociatedTokenAddress(WSOL_MINT, owner);
      const balance = await this.connection.getTokenAccountBalance(wsolAccount);
      return parseFloat(balance.value.amount) / LAMPORTS_PER_SOL;
    } catch {
      return 0;
    }
  }

  async ensureWsolAta(owner: PublicKey): Promise<PublicKey> {
    const wsolAccount = await getAssociatedTokenAddress(WSOL_MINT, owner);
    
    try {
      await this.connection.getAccountInfo(wsolAccount);
      return wsolAccount;
    } catch {
      // ATA n'existe pas, la créer
      const isDryRun = process.env.DRY_RUN === 'true';
      
      if (isDryRun) {
        logger.info(`DRY RUN: Would create WSOL ATA ${wsolAccount.toString()}`);
        return wsolAccount;
      }

      const transaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          owner, // payer
          wsolAccount, // ata
          owner, // owner
          WSOL_MINT // mint
        )
      );

      const signature = await this.connection.sendTransaction(transaction, []);
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      logger.info(`WSOL ATA created: ${wsolAccount.toString()}`);
      return wsolAccount;
    }
  }
}

// Factory function
export function createWSOLService(connection: Connection): WSOLService {
  return new WSOLService(connection);
}
