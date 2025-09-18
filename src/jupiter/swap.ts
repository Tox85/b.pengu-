import { PublicKey, Connection, Keypair, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createJupiterApiClient } from "@jup-ag/api";

/**
 * Interface pour les paramètres de swap Jupiter
 */
export interface JupiterSwapParams {
  connection: Connection;
  keypair: Keypair;
  inMint: PublicKey;
  outMint: PublicKey;
  amount: number; // en unités de base du token d'entrée
  slippageBps: number;
  unwrapSol?: boolean;
  dryRun?: boolean;
}

/**
 * Interface pour le résultat du swap
 */
export interface JupiterSwapResult {
  success: boolean;
  signature?: string;
  inputAmount: number;
  outputAmount: number;
  priceImpact: number;
  error?: string;
}

/**
 * Effectue un swap via Jupiter
 * @param params - Paramètres du swap
 * @returns Résultat du swap
 */
export async function swapViaJupiter(params: JupiterSwapParams): Promise<JupiterSwapResult> {
  const {
    connection,
    keypair,
    inMint,
    outMint,
    amount,
    slippageBps,
    unwrapSol = false,
    dryRun = false
  } = params;

  try {
    console.log(`   Swap: ${inMint.toBase58()} → ${outMint.toBase58()}`);
    console.log(`   Montant: ${amount} (unités de base)`);
    console.log(`   Slippage: ${slippageBps} bps`);
    console.log(`   Unwrap SOL: ${unwrapSol}`);

    // Créer le client Jupiter
    const jupiter = createJupiterApiClient();

    // Obtenir les routes
    const routes = await jupiter.quoteGet({
      inputMint: inMint.toBase58(),
      outputMint: outMint.toBase58(),
      amount: amount,
      slippageBps: slippageBps,
      swapMode: "ExactIn"
    });

    if (!routes || routes.length === 0) {
      return {
        success: false,
        inputAmount: amount,
        outputAmount: 0,
        priceImpact: 0,
        error: "Aucune route trouvée"
      };
    }

    const bestRoute = routes[0];
    console.log(`   Route trouvée: ${bestRoute.outAmount} tokens de sortie`);
    console.log(`   Price Impact: ${bestRoute.priceImpactPct}%`);

    if (dryRun) {
      console.log(`   DRY_RUN: Simulation du swap`);
      return {
        success: true,
        inputAmount: amount,
        outputAmount: parseInt(bestRoute.outAmount),
        priceImpact: parseFloat(bestRoute.priceImpactPct || "0")
      };
    }

    // Obtenir la transaction de swap
    const swapResponse = await jupiter.swapPost({
      swapRequest: {
        quoteResponse: bestRoute,
        userPublicKey: keypair.publicKey.toBase58(),
        wrapAndUnwrapSol: unwrapSol
      }
    });

    if (!swapResponse.swapTransaction) {
      return {
        success: false,
        inputAmount: amount,
        outputAmount: 0,
        priceImpact: 0,
        error: "Transaction de swap non générée"
      };
    }

    // Désérialiser et signer la transaction
    const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
    const transaction = Transaction.from(swapTransactionBuf);
    
    transaction.partialSign(keypair);

    // Envoyer la transaction
    const signature = await connection.sendRawTransaction(transaction.serialize());
    console.log(`   Transaction envoyée: ${signature}`);

    // Attendre la confirmation
    await connection.confirmTransaction(signature, "confirmed");
    console.log(`   Transaction confirmée: ${signature}`);

    return {
      success: true,
      signature,
      inputAmount: amount,
      outputAmount: parseInt(bestRoute.outAmount),
      priceImpact: parseFloat(bestRoute.priceImpactPct || "0")
    };

  } catch (error) {
    console.error(`   Erreur Jupiter: ${error}`);
    return {
      success: false,
      inputAmount: amount,
      outputAmount: 0,
      priceImpact: 0,
      error: error instanceof Error ? error.message : "Erreur inconnue"
    };
  }
}

/**
 * Swap USDC vers SOL (avec unwrap)
 * @param connection - Connexion Solana
 * @param keypair - Keypair Solana
 * @param usdcAmount - Montant USDC en unités de base (6 décimales)
 * @param dryRun - Mode simulation
 * @returns Résultat du swap
 */
export async function swapUsdcToSol(
  connection: Connection,
  keypair: Keypair,
  usdcAmount: number,
  dryRun = false
): Promise<JupiterSwapResult> {
  const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

  return swapViaJupiter({
    connection,
    keypair,
    inMint: USDC_MINT,
    outMint: WSOL_MINT,
    amount: usdcAmount,
    slippageBps: 50,
    unwrapSol: true,
    dryRun
  });
}

/**
 * Swap USDC vers PENGU
 * @param connection - Connexion Solana
 * @param keypair - Keypair Solana
 * @param usdcAmount - Montant USDC en unités de base (6 décimales)
 * @param dryRun - Mode simulation
 * @returns Résultat du swap
 */
export async function swapUsdcToPengu(
  connection: Connection,
  keypair: Keypair,
  usdcAmount: number,
  dryRun = false
): Promise<JupiterSwapResult> {
  const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const PENGU_MINT = new PublicKey("2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv");

  return swapViaJupiter({
    connection,
    keypair,
    inMint: USDC_MINT,
    outMint: PENGU_MINT,
    amount: usdcAmount,
    slippageBps: 50,
    unwrapSol: false,
    dryRun
  });
}
