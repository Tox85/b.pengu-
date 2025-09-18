#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');
const axios = require('axios');

console.log('🐧 Test PENGU Swap avec Jupiter...');

dotenv.config();

async function testPenguSwap() {
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    
    // 2. Vérification des fonds
    console.log('\n2️⃣ Vérification des fonds...');
    const solBalance = await solanaConnection.getBalance(keypair.publicKey);
    
    const usdcMint = new PublicKey(process.env.SOL_USDC_MINT);
    const penguMint = new PublicKey(process.env.SOL_PENGU_MINT);
    const wsolMint = new PublicKey(process.env.SOL_WSOL_MINT);
    
    const usdcAta = await getAssociatedTokenAddress(usdcMint, keypair.publicKey);
    const penguAta = await getAssociatedTokenAddress(penguMint, keypair.publicKey);
    const wsolAta = await getAssociatedTokenAddress(wsolMint, keypair.publicKey);
    
    let usdcBalance = 0;
    let penguBalance = 0;
    let wsolBalance = 0;
    
    try {
      const usdcAccount = await getAccount(solanaConnection, usdcAta);
      usdcBalance = Number(usdcAccount.amount);
    } catch (e) {
      console.log('   USDC ATA non trouvé');
    }
    
    try {
      const penguAccount = await getAccount(solanaConnection, penguAta);
      penguBalance = Number(penguAccount.amount);
    } catch (e) {
      console.log('   PENGU ATA non trouvé');
    }
    
    try {
      const wsolAccount = await getAccount(solanaConnection, wsolAta);
      wsolBalance = Number(wsolAccount.amount);
    } catch (e) {
      console.log('   WSOL ATA non trouvé');
    }
    
    console.log(`   SOL: ${solBalance / 1e9}`);
    console.log(`   USDC: ${usdcBalance / 1e6}`);
    console.log(`   PENGU: ${penguBalance / 1e6}`);
    console.log(`   WSOL: ${wsolBalance / 1e9}`);
    
    // 3. Test des routes Jupiter
    console.log('\n3️⃣ Test des routes Jupiter...');
    const jupiterApi = axios.create({
      baseURL: 'https://quote-api.jup.ag/v6',
    });
    
    const swapAmount = Math.floor(0.001 * 1e6); // 0.001 USDC
    
    // Test route directe USDC → PENGU
    console.log('\n3️⃣1️⃣ Test route directe USDC → PENGU...');
    try {
      const directResponse = await jupiterApi.get('/quote', {
        params: {
          inputMint: usdcMint.toBase58(),
          outputMint: penguMint.toBase58(),
          amount: swapAmount.toString(),
          slippageBps: 50,
          swapMode: 'ExactIn'
        }
      });
      
      const directQuote = directResponse.data;
      console.log('✅ Route directe USDC → PENGU trouvée !');
      console.log(`   Input: ${directQuote.inAmount} USDC`);
      console.log(`   Output: ${directQuote.outAmount} PENGU`);
      console.log(`   Price Impact: ${directQuote.priceImpactPct}%`);
      console.log(`   Route: ${directQuote.routePlan?.map(step => step.swapInfo?.label).join(' → ')}`);
      
    } catch (error) {
      console.log('❌ Route directe USDC → PENGU échouée');
      console.log(`   Erreur: ${error.response?.data?.error || error.message}`);
    }
    
    // Test route multi-hop USDC → WSOL → PENGU
    console.log('\n3️⃣2️⃣ Test route multi-hop USDC → WSOL → PENGU...');
    try {
      // USDC → WSOL
      const usdcToWsolResponse = await jupiterApi.get('/quote', {
        params: {
          inputMint: usdcMint.toBase58(),
          outputMint: wsolMint.toBase58(),
          amount: swapAmount.toString(),
          slippageBps: 50,
          swapMode: 'ExactIn'
        }
      });
      
      const usdcToWsolQuote = usdcToWsolResponse.data;
      console.log(`   USDC → WSOL: ${usdcToWsolQuote.outAmount} WSOL`);
      
      // WSOL → PENGU
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
      
      console.log('✅ Route multi-hop USDC → WSOL → PENGU trouvée !');
      console.log(`   Total Output: ${wsolToPenguQuote.outAmount} PENGU`);
      console.log(`   Total Price Impact: ${(parseFloat(usdcToWsolQuote.priceImpactPct) + parseFloat(wsolToPenguQuote.priceImpactPct)).toFixed(4)}%`);
      
    } catch (error) {
      console.log('❌ Route multi-hop USDC → WSOL → PENGU échouée');
      console.log(`   Erreur: ${error.response?.data?.error || error.message}`);
    }
    
    // Test route WSOL → PENGU (si on a du WSOL)
    console.log('\n3️⃣3️⃣ Test route WSOL → PENGU...');
    try {
      const wsolToPenguResponse = await jupiterApi.get('/quote', {
        params: {
          inputMint: wsolMint.toBase58(),
          outputMint: penguMint.toBase58(),
          amount: Math.floor(0.001 * 1e9).toString(), // 0.001 WSOL
          slippageBps: 50,
          swapMode: 'ExactIn'
        }
      });
      
      const wsolToPenguQuote = wsolToPenguResponse.data;
      console.log('✅ Route WSOL → PENGU trouvée !');
      console.log(`   Input: ${wsolToPenguQuote.inAmount} WSOL`);
      console.log(`   Output: ${wsolToPenguQuote.outAmount} PENGU`);
      console.log(`   Price Impact: ${wsolToPenguQuote.priceImpactPct}%`);
      console.log(`   Route: ${wsolToPenguQuote.routePlan?.map(step => step.swapInfo?.label).join(' → ')}`);
      
    } catch (error) {
      console.log('❌ Route WSOL → PENGU échouée');
      console.log(`   Erreur: ${error.response?.data?.error || error.message}`);
    }
    
    console.log('\n✅ Test des routes PENGU terminé !');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

testPenguSwap();
