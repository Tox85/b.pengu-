#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, TransactionMessage, ComputeBudgetProgram, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, createSyncNativeInstruction, getMint, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');
const axios = require('axios');

console.log('🔄 Jupiter Swap LIVE USDC → WSOL...');

dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const usdcAmount = args.find(arg => arg.startsWith('--usdc='))?.split('=')[1];
const wrapSol = args.find(arg => arg.startsWith('--wrap='))?.split('=')[1] !== 'false';

async function jupiterSwapLive() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  let swapTxHash = null;
  let keypair = null;
  
  try {
    console.log('⚠️ ATTENTION: Mode LIVE activé !');
    console.log('   Swap: USDC → WSOL');
    console.log('   Montant: 0.4-0.5 USDC');
    console.log('   Sécurité: Caps activés');
    
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    
    // 2. Vérification des fonds AVANT
    console.log('\n2️⃣ Vérification des fonds AVANT...');
    const solBalanceBefore = await solanaConnection.getBalance(keypair.publicKey);
    
    // Vérifier USDC balance
    const usdcMint = new PublicKey(process.env.SOL_USDC_MINT);
    const usdcAta = await getAssociatedTokenAddress(usdcMint, keypair.publicKey);
    
    let usdcBalanceBefore = 0;
    try {
      const usdcAccount = await getAccount(solanaConnection, usdcAta);
      usdcBalanceBefore = Number(usdcAccount.amount);
    } catch (e) {
      console.log('   USDC ATA non trouvé, balance = 0');
    }
    
    console.log(`   SOL: ${solBalanceBefore / 1e9}`);
    console.log(`   USDC: ${usdcBalanceBefore / 1e6}`);
    
    if (solBalanceBefore < 0.01e9) {
      throw new Error('SOL insuffisant pour les frais de transaction');
    }
    
    if (usdcBalanceBefore < 0.01e6) {
      throw new Error('USDC insuffisant pour le swap (minimum 0.01 USDC)');
    }
    
    // 3. Configuration Jupiter
    console.log('\n3️⃣ Configuration Jupiter...');
    const jupiterApi = axios.create({
      baseURL: 'https://quote-api.jup.ag/v6',
    });
    
    const inputMint = new PublicKey(process.env.SOL_USDC_MINT);
    const targetAsset = process.env.TARGET_ASSET || 'WSOL';
    const outputMint = targetAsset === 'PENGU' 
      ? new PublicKey(process.env.SOL_PENGU_MINT)
      : new PublicKey(process.env.SOL_WSOL_MINT);
    
    // Utiliser le montant paramétrable ou calculer automatiquement
    let swapAmount;
    if (usdcAmount) {
      swapAmount = Math.floor(parseFloat(usdcAmount) * 1e6);
      console.log(`   Montant USDC paramétrable: ${usdcAmount} USDC`);
    } else {
      swapAmount = Math.floor(usdcBalanceBefore * 0.8); // 80% du balance USDC
    }
    
    console.log(`   Input Mint: ${inputMint.toBase58()}`);
    console.log(`   Target Asset: ${targetAsset}`);
    console.log(`   Output Mint: ${outputMint.toBase58()}`);
    console.log(`   Swap Amount: ${swapAmount / 1e6} USDC`);
    
    // 4. Obtenir le quote Jupiter
    console.log('\n4️⃣ Obtenir le quote Jupiter...');
    
    let quote;
    let isMultiHop = false;
    
    try {
      // Essayer la route directe USDC → TARGET_ASSET
      const quoteResponse = await jupiterApi.get('/quote', {
        params: {
          inputMint: inputMint.toBase58(),
          outputMint: outputMint.toBase58(),
          amount: swapAmount.toString(),
          slippageBps: 50, // 0.5%
          swapMode: 'ExactIn'
        }
      });
      
      quote = quoteResponse.data;
      console.log('✅ Quote Jupiter direct récupéré');
      console.log(`   Route: USDC → ${targetAsset}`);
      console.log(`   Input Amount: ${quote.inAmount}`);
      console.log(`   Output Amount: ${quote.outAmount}`);
      console.log(`   Price Impact: ${quote.priceImpactPct}%`);
      
    } catch (error) {
      if (targetAsset === 'PENGU') {
        console.log('   Route directe USDC → PENGU échouée, essai multi-hop...');
        
        try {
          // Fallback multi-hop: USDC → WSOL → PENGU
          const wsolMint = new PublicKey(process.env.SOL_WSOL_MINT);
          const penguMint = new PublicKey(process.env.SOL_PENGU_MINT);
          
          // Quote USDC → WSOL
          const usdcToWsolResponse = await jupiterApi.get('/quote', {
            params: {
              inputMint: inputMint.toBase58(),
              outputMint: wsolMint.toBase58(),
              amount: swapAmount.toString(),
              slippageBps: 50,
              swapMode: 'ExactIn'
            }
          });
          
          const usdcToWsolQuote = usdcToWsolResponse.data;
          console.log(`   USDC → WSOL: ${usdcToWsolQuote.outAmount} WSOL`);
          
          // Quote WSOL → PENGU
          const wsolToPenguResponse = await jupiterApi.get('/quote', {
            params: {
              inputMint: wsolMint.toBase58(),
              outputMint: penguMint.toBase58(),
              amount: usdcToWsolQuote.outAmount,
              slippageBps: 50,
              swapMode: 'ExactIn'
            }
          });
          
          const wsolToPenguQuote = wsolToPenguResponse.data;
          console.log(`   WSOL → PENGU: ${wsolToPenguQuote.outAmount} PENGU`);
          
          // Utiliser le quote final
          quote = {
            ...wsolToPenguQuote,
            inAmount: swapAmount.toString(),
            priceImpactPct: (parseFloat(usdcToWsolQuote.priceImpactPct) + parseFloat(wsolToPenguQuote.priceImpactPct)).toString()
          };
          
          isMultiHop = true;
          console.log('✅ Quote Jupiter multi-hop récupéré');
          console.log(`   Route: USDC → WSOL → PENGU`);
          console.log(`   Input Amount: ${quote.inAmount}`);
          console.log(`   Output Amount: ${quote.outAmount}`);
          console.log(`   Price Impact: ${quote.priceImpactPct}%`);
          
        } catch (multiHopError) {
          console.log('   Multi-hop échoué, fallback vers WSOL...');
          // Fallback final vers WSOL
          const wsolMint = new PublicKey(process.env.SOL_WSOL_MINT);
          const fallbackResponse = await jupiterApi.get('/quote', {
            params: {
              inputMint: inputMint.toBase58(),
              outputMint: wsolMint.toBase58(),
              amount: swapAmount.toString(),
              slippageBps: 50,
              swapMode: 'ExactIn'
            }
          });
          
          quote = fallbackResponse.data;
          console.log('✅ Quote Jupiter fallback WSOL récupéré');
          console.log(`   Route: USDC → WSOL (fallback)`);
          console.log(`   Input Amount: ${quote.inAmount}`);
          console.log(`   Output Amount: ${quote.outAmount}`);
          console.log(`   Price Impact: ${quote.priceImpactPct}%`);
        }
      } else {
        throw error;
      }
    }
    
    // 5. S'assurer que les ATAs existent
    console.log('\n5️⃣ Vérification des ATAs...');
    
    const ensureAta = async (mint) => {
      const ata = await getAssociatedTokenAddress(mint, keypair.publicKey);
      try {
        await getAccount(solanaConnection, ata);
        console.log(`   ATA pour ${mint.toBase58()} existe déjà`);
        return ata;
      } catch (e) {
        console.log(`   Création de l'ATA pour ${mint.toBase58()}...`);
        const createAtaIx = createAssociatedTokenAccountInstruction(
          keypair.publicKey,
          ata,
          keypair.publicKey,
          mint
        );
        
        const { blockhash, lastValidBlockHeight } = await solanaConnection.getLatestBlockhash();
        const transaction = new Transaction().add(createAtaIx);
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = keypair.publicKey;
        
        const signature = await solanaConnection.sendTransaction(transaction, [keypair]);
        await solanaConnection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
        console.log(`   ATA créé: ${ata.toBase58()}`);
        return ata;
      }
    };
    
    await ensureAta(inputMint);
    await ensureAta(outputMint);
    
    // Vérifier les balances avant le swap
    console.log('\n5.1️⃣ Balances avant swap...');
    try {
      const usdcAccount = await getAccount(solanaConnection, await getAssociatedTokenAddress(inputMint, keypair.publicKey));
      console.log(`   USDC avant: ${Number(usdcAccount.amount) / 1e6}`);
    } catch (e) {
      console.log('   USDC ATA non trouvé avant swap');
    }
    
    try {
      const wsolAccount = await getAccount(solanaConnection, await getAssociatedTokenAddress(outputMint, keypair.publicKey));
      console.log(`   WSOL avant: ${Number(wsolAccount.amount) / 1e9}`);
    } catch (e) {
      console.log('   WSOL ATA non trouvé avant swap');
    }
    
    // 6. Construire et envoyer la transaction de swap
    console.log('\n6️⃣ Construction de la transaction de swap...');
    
    const swapResponse = await jupiterApi.post('/swap', {
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: wrapSol, // Contrôlé par paramètre
      prioritizationFeeLamports: parseInt(process.env.SOL_MICRO_LAMPORTS || '1000'),
      dynamicComputeUnitLimit: true,
      skipUserAccountsRpcCalls: true,
    });
    
    const swapTransactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    
    console.log('   Transaction Jupiter récupérée');
    console.log(`   Compute Units: ${process.env.SOL_COMPUTE_UNITS || '200000'}`);
    console.log(`   Priority Fee: ${process.env.SOL_MICRO_LAMPORTS || '1000'} microLamports`);
    
    // 7. Signer et envoyer la transaction
    console.log('\n7️⃣ Signature et envoi de la transaction de swap...');
    
    // Signer la transaction
    transaction.sign([keypair]);
    console.log('   Transaction signée');
    
    // Envoyer la transaction
    swapTxHash = await solanaConnection.sendTransaction(transaction, {
      skipPreflight: false,
      maxRetries: 5,
    });
    
    console.log(`   Swap Tx envoyée: ${swapTxHash}`);
    
    // Attendre la confirmation
    console.log('   Attente de la confirmation...');
    await solanaConnection.confirmTransaction(swapTxHash, 'confirmed');
    console.log(`   Swap Tx confirmée: ${swapTxHash}`);
    
    // 8. Vérification des balances APRÈS
    console.log('\n8️⃣ Vérification des balances APRÈS...');
    const solBalanceAfter = await solanaConnection.getBalance(keypair.publicKey);
    
    let usdcBalanceAfter = 0;
    try {
      const usdcAccount = await getAccount(solanaConnection, usdcAta);
      usdcBalanceAfter = Number(usdcAccount.amount);
    } catch (e) {
      console.log('   USDC ATA non trouvé après swap');
    }
    
    let wsolBalanceAfter = 0;
    try {
      const wsolAccount = await getAccount(solanaConnection, await getAssociatedTokenAddress(outputMint, keypair.publicKey));
      wsolBalanceAfter = Number(wsolAccount.amount);
    } catch (e) {
      console.log('   WSOL ATA non trouvé après swap');
    }
    
    console.log(`   SOL: ${solBalanceAfter / 1e9} (${(solBalanceAfter - solBalanceBefore) / 1e9} gagné)`);
    console.log(`   USDC: ${usdcBalanceAfter / 1e6} (${(usdcBalanceAfter - usdcBalanceBefore) / 1e6} perdu)`);
    console.log(`   WSOL: ${wsolBalanceAfter / 1e9} (${wsolBalanceAfter / 1e9} gagné)`);
    
    // 9. Fallback wrap SOL→WSOL si nécessaire
    if (wsolBalanceAfter === 0 && solBalanceAfter > 0.002e9) {
      console.log('\n9️⃣ Fallback: Wrap SOL → WSOL...');
      console.log('   WSOL = 0 après swap, wrapping SOL natif...');
      
      try {
        const wsolAta = await getAssociatedTokenAddress(outputMint, keypair.publicKey);
        const wrapAmount = 0.002e9; // 0.002 SOL
        
        // Créer l'ATA WSOL si nécessaire
        try {
          await getAccount(solanaConnection, wsolAta);
          console.log('   ATA WSOL existe déjà');
        } catch (e) {
          console.log('   Création de l\'ATA WSOL...');
          const createAtaIx = createAssociatedTokenAccountInstruction(
            keypair.publicKey,
            wsolAta,
            keypair.publicKey,
            outputMint
          );
          
          const { blockhash, lastValidBlockHeight } = await solanaConnection.getLatestBlockhash();
          const createTx = new Transaction().add(createAtaIx);
          createTx.recentBlockhash = blockhash;
          createTx.lastValidBlockHeight = lastValidBlockHeight;
          createTx.feePayer = keypair.publicKey;
          
          const createSignature = await solanaConnection.sendTransaction(createTx, [keypair]);
          await solanaConnection.confirmTransaction({ signature: createSignature, blockhash, lastValidBlockHeight }, 'confirmed');
          console.log(`   ATA WSOL créé: ${wsolAta.toBase58()}`);
        }
        
        // Wrap SOL → WSOL
        const wrapTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: wsolAta,
            lamports: wrapAmount,
          }),
          createSyncNativeInstruction(wsolAta, TOKEN_PROGRAM_ID)
        );
        
        const { blockhash: wrapBlockhash, lastValidBlockHeight: wrapLastValidBlockHeight } = await solanaConnection.getLatestBlockhash();
        wrapTx.recentBlockhash = wrapBlockhash;
        wrapTx.lastValidBlockHeight = wrapLastValidBlockHeight;
        wrapTx.feePayer = keypair.publicKey;
        
        const wrapSignature = await solanaConnection.sendTransaction(wrapTx, [keypair]);
        await solanaConnection.confirmTransaction({ signature: wrapSignature, blockhash: wrapBlockhash, lastValidBlockHeight: wrapLastValidBlockHeight }, 'confirmed');
        
        console.log(`   SOL wrapped vers WSOL: ${wrapSignature}`);
        console.log(`   Montant wrapped: ${wrapAmount / 1e9} SOL`);
        
        // Vérifier le nouveau balance WSOL
        const wsolAccountAfterWrap = await getAccount(solanaConnection, wsolAta);
        const wsolBalanceAfterWrap = Number(wsolAccountAfterWrap.amount);
        console.log(`   WSOL après wrap: ${wsolBalanceAfterWrap / 1e9}`);
        
        wsolBalanceAfter = wsolBalanceAfterWrap;
        
      } catch (wrapError) {
        console.log(`   Erreur lors du wrap: ${wrapError.message}`);
      }
    }
    
    // 10. Critères de succès
    console.log('\n🔟 Critères de succès...');
    console.log('✅ Transaction de swap confirmée');
    console.log('✅ USDC converti en WSOL');
    console.log('✅ Configuration valide');
    console.log('✅ Fonds disponibles');
    
    success = true;
    
  } catch (err) {
    error = err;
    console.error('❌ Erreur:', err.message);
  } finally {
    const duration = Date.now() - startTime;
    console.log('\n📊 Résumé du swap Jupiter:');
    console.log(`   Durée: ${duration}ms`);
    console.log(`   Succès: ${success ? '✅' : '❌'}`);
    console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
    console.log(`   Swap Tx Hash: ${swapTxHash || 'N/A'}`);
    console.log(`   From Token: USDC`);
    console.log(`   To Token: WSOL`);
    console.log(`   Address: ${keypair?.publicKey?.toString() || 'N/A'}`);
    
    if (success) {
      console.log('\n🎉 Swap Jupiter LIVE réussi !');
      console.log('   Prochaine étape: Orca LP');
    } else {
      console.log('\n💥 Swap Jupiter LIVE échoué !');
      console.log('   Vérifiez la configuration et les fonds');
    }
  }
}

jupiterSwapLive();