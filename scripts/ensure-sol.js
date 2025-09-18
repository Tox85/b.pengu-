#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { createJupiterApiClient } = require('@jup-ag/api');
const fs = require('fs');

console.log('💰 Vérification et approvisionnement SOL...');

dotenv.config({ override: true });

const CONFIG = {
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  SOL_USDC_MINT: new PublicKey(process.env.SOL_USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  SOL_WSOL_MINT: new PublicKey(process.env.SOL_WSOL_MINT || 'So11111111111111111111111111111111111111112'),
  MIN_SOL_BALANCE: parseFloat(process.env.MIN_SOL_BALANCE || '0.008'),
  DRY_RUN: process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run')
};

async function ensureSol() {
  try {
    // Initialisation
    const connection = new Connection(CONFIG.SOLANA_RPC_URL, "confirmed");
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    
    console.log(`   Wallet: ${payer.publicKey.toString()}`);
    console.log(`   Mode: ${CONFIG.DRY_RUN ? 'DRY_RUN' : 'LIVE'}`);

    // Vérifier le solde SOL
    const solBalance = await connection.getBalance(payer.publicKey);
    const solBalanceFormatted = solBalance / 1e9;
    
    console.log(`   SOL actuel: ${solBalanceFormatted}`);
    console.log(`   SOL minimum requis: ${CONFIG.MIN_SOL_BALANCE}`);

    if (solBalanceFormatted >= CONFIG.MIN_SOL_BALANCE) {
      console.log('   ✅ SOL suffisant');
      return;
    }

    console.log('   ⚠️  SOL insuffisant, vérification USDC...');

    // Vérifier le solde USDC
    let usdcBalance = 0;
    try {
      const usdcAta = getAssociatedTokenAddressSync(CONFIG.SOL_USDC_MINT, payer.publicKey);
      const usdcAccount = await connection.getTokenAccountBalance(usdcAta);
      usdcBalance = parseInt(usdcAccount.value.amount) / 1e6;
    } catch (error) {
      console.log('   ⚠️  ATA USDC non trouvé');
    }

    console.log(`   USDC disponible: ${usdcBalance}`);

    if (usdcBalance < 0.001) {
      console.log('   ❌ USDC insuffisant pour swap SOL');
      console.log('   💡 Solution: Approvisionner le wallet en USDC ou lancer le bridge');
      process.exit(1);
    }

    // Effectuer un mini swap USDC → SOL
    const swapAmount = Math.min(0.005, usdcBalance * 0.5); // Max 0.005 USDC ou 50% du solde
    console.log(`   💱 Swap USDC → SOL: ${swapAmount} USDC`);

    if (CONFIG.DRY_RUN) {
      console.log('   DRY_RUN: Swap simulé');
      console.log(`   ✅ Swap simulé: +0.001 SOL, -${swapAmount} USDC`);
      return;
    }

    // Swap réel via Jupiter
    const jupiter = createJupiterApiClient();
    
    // Obtenir les routes
    const routes = await jupiter.quoteGet({
      inputMint: CONFIG.SOL_USDC_MINT.toBase58(),
      outputMint: CONFIG.SOL_WSOL_MINT.toBase58(),
      amount: Math.floor(swapAmount * 1e6), // USDC en unités de base
      slippageBps: 50,
      swapMode: "ExactIn"
    });

    if (!routes || !routes.outAmount) {
      throw new Error('Aucune route USDC → WSOL trouvée');
    }

    const bestRoute = routes;
    console.log(`   Route trouvée: ${bestRoute.outAmount} WSOL`);
    console.log(`   Price Impact: ${bestRoute.priceImpactPct || 'N/A'}%`);

    // Obtenir la transaction de swap
    const swapResponse = await jupiter.swapPost({
      swapRequest: {
        quoteResponse: bestRoute,
        userPublicKey: payer.publicKey.toBase58(),
        wrapAndUnwrapSol: true // Unwrap WSOL vers SOL
      }
    });

    if (!swapResponse.swapTransaction) {
      throw new Error('Transaction de swap non générée');
    }

    // Désérialiser et signer la transaction
    const { Transaction, VersionedTransaction } = require('@solana/web3.js');
    const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
    
    let transaction;
    try {
      // Essayer d'abord avec VersionedTransaction
      transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      transaction.sign([payer]);
    } catch (error) {
      // Fallback vers Transaction classique
      transaction = Transaction.from(swapTransactionBuf);
      transaction.partialSign(payer);
    }

    // Envoyer la transaction
    const signature = await connection.sendRawTransaction(transaction.serialize());
    console.log(`   Transaction envoyée: ${signature}`);

    // Attendre la confirmation
    await connection.confirmTransaction(signature, "confirmed");
    console.log(`   Transaction confirmée: ${signature}`);

    // Vérifier le nouveau solde SOL
    const newSolBalance = await connection.getBalance(payer.publicKey);
    const newSolBalanceFormatted = newSolBalance / 1e9;
    
    console.log(`   SOL après swap: ${newSolBalanceFormatted}`);
    console.log(`   ✅ Swap USDC → SOL réussi`);

  } catch (error) {
    console.error(`   ❌ Erreur: ${error.message}`);
    process.exit(1);
  }
}

// Exécution
if (require.main === module) {
  ensureSol();
}

module.exports = { ensureSol };
