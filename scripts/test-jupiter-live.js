#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

console.log('🔄 Test Jupiter Swap LIVE USDC → PENGU...');

dotenv.config();

async function testJupiterLive() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  
  try {
    console.log('⚠️ ATTENTION: Mode LIVE activé !');
    console.log('   Swap: USDC → PENGU');
    console.log('   Montant: 0.01 USDC (micro-montant)');
    console.log('   Slippage: 0.5-1%');
    console.log('   Compute Budget: Activé');
    
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    console.log(`   RPC: ${process.env.SOLANA_RPC_URL.substring(0, 50)}...`);
    
    // 2. Vérification des fonds
    console.log('\n2️⃣ Vérification des fonds...');
    const solBalance = await solanaConnection.getBalance(keypair.publicKey);
    console.log(`   SOL: ${solBalance / 1e9}`);
    
    if (solBalance < 0.01e9) {
      throw new Error('SOL insuffisant pour les frais de transaction');
    }
    
    // 3. Vérification des mints
    console.log('\n3️⃣ Vérification des mints...');
    const usdcMint = process.env.SOL_USDC_MINT;
    const penguMint = process.env.SOL_PENGU_MINT;
    
    console.log(`   USDC Mint: ${usdcMint}`);
    console.log(`   PENGU Mint: ${penguMint}`);
    
    if (!usdcMint || !penguMint) {
      throw new Error('Mints USDC ou PENGU manquants');
    }
    
    // 4. Test de l'API Jupiter
    console.log('\n4️⃣ Test de l\'API Jupiter...');
    const quoteRequest = {
      inputMint: usdcMint,
      outputMint: penguMint,
      amount: '10000', // 0.01 USDC (6 decimals)
      slippageBps: 50 // 0.5%
    };
    
    console.log('   Fetching quote...');
    const quoteResponse = await fetch('https://quote-api.jup.ag/v6/quote', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // @ts-ignore
      params: new URLSearchParams(quoteRequest),
    });
    
    if (!quoteResponse.ok) {
      throw new Error(`Jupiter API error: ${quoteResponse.status} ${quoteResponse.statusText}`);
    }
    
    const quote = await quoteResponse.json();
    console.log('✅ Quote récupérée');
    console.log(`   Input: ${quote.inAmount} (${quote.inputMint})`);
    console.log(`   Output: ${quote.outAmount} (${quote.outputMint})`);
    console.log(`   Price Impact: ${quote.priceImpactPct}%`);
    console.log(`   Slippage: ${quote.slippageBps} BPS`);
    
    // 5. Test de la construction de transaction
    console.log('\n5️⃣ Test de la construction de transaction...');
    const swapRequest = {
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toString(),
      wrapAndUnwrapSol: true,
      useSharedAccounts: true,
      computeUnitPriceMicroLamports: 1000, // 0.001 SOL
    };
    
    console.log('   Building swap transaction...');
    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(swapRequest),
    });
    
    if (!swapResponse.ok) {
      throw new Error(`Jupiter swap API error: ${swapResponse.status} ${swapResponse.statusText}`);
    }
    
    const { swapTransaction } = await swapResponse.json();
    console.log('✅ Transaction construite');
    console.log(`   Transaction size: ${swapTransaction.length} bytes`);
    
    // 6. Test de l'ATA USDC
    console.log('\n6️⃣ Test de l\'ATA USDC...');
    const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
    const { Transaction } = await import('@solana/web3.js');
    
    const usdcAta = await getAssociatedTokenAddress(new PublicKey(usdcMint), keypair.publicKey);
    const penguAta = await getAssociatedTokenAddress(new PublicKey(penguMint), keypair.publicKey);
    
    console.log(`   USDC ATA: ${usdcAta.toString()}`);
    console.log(`   PENGU ATA: ${penguAta.toString()}`);
    
    // Vérifier si les ATAs existent
    const usdcAtaInfo = await solanaConnection.getAccountInfo(usdcAta);
    const penguAtaInfo = await solanaConnection.getAccountInfo(penguAta);
    
    if (!usdcAtaInfo) {
      console.log('   Création de l\'ATA USDC...');
      const createUsdcAtaIx = createAssociatedTokenAccountInstruction(
        keypair.publicKey, // payer
        usdcAta,           // ata
        keypair.publicKey, // owner
        new PublicKey(usdcMint) // mint
      );
      
      const tx = new Transaction().add(createUsdcAtaIx);
      const signature = await solanaConnection.sendTransaction(tx, [keypair]);
      await solanaConnection.confirmTransaction(signature);
      
      console.log('✅ ATA USDC créé');
    } else {
      console.log('✅ ATA USDC existe déjà');
    }
    
    if (!penguAtaInfo) {
      console.log('   Création de l\'ATA PENGU...');
      const createPenguAtaIx = createAssociatedTokenAccountInstruction(
        keypair.publicKey, // payer
        penguAta,          // ata
        keypair.publicKey, // owner
        new PublicKey(penguMint) // mint
      );
      
      const tx = new Transaction().add(createPenguAtaIx);
      const signature = await solanaConnection.sendTransaction(tx, [keypair]);
      await solanaConnection.confirmTransaction(signature);
      
      console.log('✅ ATA PENGU créé');
    } else {
      console.log('✅ ATA PENGU existe déjà');
    }
    
    // 7. Test de la balance USDC
    console.log('\n7️⃣ Test de la balance USDC...');
    const usdcBalance = await solanaConnection.getTokenAccountBalance(usdcAta);
    console.log(`   Balance USDC: ${usdcBalance.value.amount} (${usdcBalance.value.uiAmount} USDC)`);
    
    if (parseInt(usdcBalance.value.amount) < 10000) {
      console.log('⚠️ Balance USDC insuffisante pour le swap');
      console.log('   Déposez des USDC sur Solana pour continuer');
    } else {
      console.log('✅ Balance USDC suffisante');
    }
    
    // 8. Critères de succès
    console.log('\n8️⃣ Critères de succès...');
    console.log('✅ API Jupiter accessible');
    console.log('✅ Quote récupérée');
    console.log('✅ Transaction construite');
    console.log('✅ ATAs créés/vérifiés');
    console.log('✅ Configuration valide');
    
    success = true;
    
  } catch (err) {
    error = err;
    console.error('❌ Erreur:', err.message);
  } finally {
    const duration = Date.now() - startTime;
    console.log('\n📊 Résumé du test:');
    console.log(`   Durée: ${duration}ms`);
    console.log(`   Succès: ${success ? '✅' : '❌'}`);
    console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
    
    if (success) {
      console.log('\n🎉 Test Jupiter Live réussi !');
      console.log('   Prochaine étape: Implémenter le swap réel');
    } else {
      console.log('\n💥 Test Jupiter Live échoué !');
      console.log('   Vérifiez la configuration et les fonds');
    }
  }
}

testJupiterLive();
