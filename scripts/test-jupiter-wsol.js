#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

console.log('🔄 Test Jupiter Swap LIVE USDC → WSOL...');

dotenv.config();

async function testJupiterWSOL() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  
  try {
    console.log('⚠️ ATTENTION: Mode LIVE activé !');
    console.log('   Swap: USDC → WSOL');
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
    const wsolMint = process.env.SOL_WSOL_MINT;
    
    console.log(`   USDC Mint: ${usdcMint}`);
    console.log(`   WSOL Mint: ${wsolMint}`);
    
    if (!usdcMint || !wsolMint) {
      throw new Error('Mints USDC ou WSOL manquants');
    }
    
    // 4. Test de l'API Jupiter
    console.log('\n4️⃣ Test de l\'API Jupiter...');
    const quoteRequest = {
      inputMint: usdcMint,
      outputMint: wsolMint,
      amount: '10000', // 0.01 USDC (6 decimals)
      slippageBps: 50 // 0.5%
    };
    
    console.log('   Fetching quote...');
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${usdcMint}&outputMint=${wsolMint}&amount=10000&slippageBps=50`;
    console.log(`   URL: ${quoteUrl}`);
    
    const quoteResponse = await fetch(quoteUrl);
    
    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      console.log(`   Error response: ${errorText}`);
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
      const errorText = await swapResponse.text();
      console.log(`   Error response: ${errorText}`);
      throw new Error(`Jupiter swap API error: ${swapResponse.status} ${swapResponse.statusText}`);
    }
    
    const { swapTransaction } = await swapResponse.json();
    console.log('✅ Transaction construite');
    console.log(`   Transaction size: ${swapTransaction.length} bytes`);
    
    // 6. Critères de succès
    console.log('\n6️⃣ Critères de succès...');
    console.log('✅ API Jupiter accessible');
    console.log('✅ Quote récupérée');
    console.log('✅ Transaction construite');
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
      console.log('\n🎉 Test Jupiter WSOL réussi !');
      console.log('   Prochaine étape: Implémenter le swap réel');
    } else {
      console.log('\n💥 Test Jupiter WSOL échoué !');
      console.log('   Vérifiez la configuration et les fonds');
    }
  }
}

testJupiterWSOL();
