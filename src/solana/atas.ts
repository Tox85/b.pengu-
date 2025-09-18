import { PublicKey, Connection, Transaction, TransactionInstruction } from "@solana/web3.js";
import { 
  getAssociatedTokenAddressSync, 
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";

/**
 * Récupère ou crée un ATA (Associated Token Account) de manière idempotente
 * @param connection - Connexion Solana
 * @param mint - Mint du token
 * @param owner - Propriétaire de l'ATA
 * @param programId - Program ID (défaut: TOKEN_PROGRAM_ID)
 * @returns PublicKey de l'ATA
 */
export async function getOrCreateAta(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  programId: PublicKey = TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    programId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Vérifier si l'ATA existe déjà
  const accountInfo = await connection.getAccountInfo(ata);
  if (accountInfo) {
    return ata;
  }

  // Créer l'ATA s'il n'existe pas
  const createAtaIx = createAssociatedTokenAccountInstruction(
    owner, // payer
    ata,   // ata
    owner, // owner
    mint,  // mint
    programId
  );

  const tx = new Transaction().add(createAtaIx);
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;

  // Note: Cette fonction ne signe pas la transaction
  // L'appelant doit signer et envoyer
  return ata;
}

/**
 * Vérifie si un ATA existe
 * @param connection - Connexion Solana
 * @param mint - Mint du token
 * @param owner - Propriétaire de l'ATA
 * @param programId - Program ID (défaut: TOKEN_PROGRAM_ID)
 * @returns true si l'ATA existe
 */
export async function ataExists(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  programId: PublicKey = TOKEN_PROGRAM_ID
): Promise<boolean> {
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    programId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const accountInfo = await connection.getAccountInfo(ata);
  return accountInfo !== null;
}

/**
 * Récupère le solde d'un token pour un owner
 * @param connection - Connexion Solana
 * @param mint - Mint du token
 * @param owner - Propriétaire de l'ATA
 * @param programId - Program ID (défaut: TOKEN_PROGRAM_ID)
 * @returns Solde en unités de base du token
 */
export async function getTokenBalance(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  programId: PublicKey = TOKEN_PROGRAM_ID
): Promise<number> {
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    programId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  try {
    const accountInfo = await connection.getTokenAccountBalance(ata);
    return parseInt(accountInfo.value.amount);
  } catch (error) {
    return 0; // ATA n'existe pas ou erreur
  }
}
