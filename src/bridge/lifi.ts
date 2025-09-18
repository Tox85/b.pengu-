import { ethers } from "ethers";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";

/**
 * Interface pour les paramètres de bridge
 */
export interface BridgeParams {
  amount: number; // Montant USDC à bridger (en unités de base, 6 décimales)
  dryRun?: boolean;
}

/**
 * Interface pour le résultat du bridge
 */
export interface BridgeResult {
  success: boolean;
  txHash?: string;
  amount: number;
  error?: string;
}

/**
 * Bridge USDC de Base vers Solana via Li.Fi (simulation)
 * @param params - Paramètres du bridge
 * @returns Résultat du bridge
 */
export async function bridgeBaseToSolanaUsdc(params: BridgeParams): Promise<BridgeResult> {
  const { amount, dryRun = false } = params;

  try {
    console.log(`   Bridge Base → Solana: ${amount} USDC`);
    console.log(`   Montant: ${amount / 1e6} USDC`);

    if (dryRun) {
      console.log(`   DRY_RUN: Simulation du bridge`);
      return {
        success: true,
        amount,
        txHash: "DRY_RUN_BRIDGE_TX_HASH"
      };
    }

    // Simulation du bridge (en réalité, il faudrait appeler l'API Li.Fi)
    console.log(`   ⚠️  Bridge simulé - implémentation Li.Fi requise`);
    console.log(`   En production, appeler l'API Li.Fi pour le bridge CCTP`);
    
    // Simuler un délai de bridge
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const simulatedTxHash = `BRIDGE_${Date.now()}`;
    console.log(`   Bridge simulé: ${simulatedTxHash}`);

    return {
      success: true,
      txHash: simulatedTxHash,
      amount
    };

  } catch (error) {
    console.error(`   Erreur Bridge: ${error}`);
    return {
      success: false,
      amount,
      error: error instanceof Error ? error.message : "Erreur inconnue"
    };
  }
}

/**
 * Poll le solde USDC sur Solana pour vérifier l'arrivée du bridge
 * @param connection - Connexion Solana
 * @param owner - Propriétaire du wallet
 * @param expectedAmount - Montant attendu (optionnel)
 * @param maxAttempts - Nombre maximum de tentatives
 * @param intervalMs - Intervalle entre les tentatives en ms
 * @returns true si le montant est reçu
 */
export async function pollUsdcBalance(
  connection: Connection,
  owner: PublicKey,
  expectedAmount?: number,
  maxAttempts = 30,
  intervalMs = 10000
): Promise<boolean> {
  const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const ata = getAssociatedTokenAddressSync(USDC_MINT, owner, false, TOKEN_PROGRAM_ID);

  console.log(`   Polling solde USDC: ${ata.toBase58()}`);
  console.log(`   Montant attendu: ${expectedAmount ? expectedAmount / 1e6 : 'N/A'} USDC`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const accountInfo = await connection.getTokenAccountBalance(ata);
      const currentBalance = parseInt(accountInfo.value.amount);
      
      console.log(`   Tentative ${attempt}/${maxAttempts}: ${currentBalance / 1e6} USDC`);

      if (expectedAmount && currentBalance >= expectedAmount) {
        console.log(`   ✅ Montant reçu: ${currentBalance / 1e6} USDC`);
        return true;
      }

      if (attempt < maxAttempts) {
        console.log(`   Attente ${intervalMs / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }

    } catch (error) {
      console.log(`   Tentative ${attempt}/${maxAttempts}: ATA non trouvé ou erreur`);
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }
  }

  console.log(`   ❌ Timeout: Montant non reçu après ${maxAttempts} tentatives`);
  return false;
}

/**
 * Interface pour les paramètres de bridge complet
 */
export interface BridgeCompleteParams {
  amount: number;
  connection: Connection;
  owner: PublicKey;
  dryRun?: boolean;
}

/**
 * Effectue un bridge complet avec polling
 * @param params - Paramètres du bridge
 * @returns Résultat du bridge
 */
export async function bridgeBaseToSolanaUsdcComplete(params: BridgeCompleteParams): Promise<BridgeResult> {
  const { amount, connection, owner, dryRun = false } = params;

  // Effectuer le bridge
  const bridgeResult = await bridgeBaseToSolanaUsdc({ amount, dryRun });
  
  if (!bridgeResult.success || dryRun) {
    return bridgeResult;
  }

  // Poller le solde USDC sur Solana
  console.log(`   Attente de la finalité du bridge...`);
  const received = await pollUsdcBalance(connection, owner, amount);
  
  if (!received) {
    return {
      success: false,
      amount,
      error: "Bridge non confirmé sur Solana"
    };
  }

  return bridgeResult;
}
