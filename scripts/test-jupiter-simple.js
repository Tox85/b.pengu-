#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');
const axios = require('axios');

console.log('🧪 Test Jupiter Simple...');

dotenv.config();

async function testJupiterSimple() {
  try {
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`Address: ${keypair.publicKey.toString()}`);
    
    // Vérifier les balances
    const solBalance = await solanaConnection.getBalance(keypair.publicKey);
    console.log(`SOL: ${solBalance / 1e9}`);
    
    // USDC balance
    const usdcMint = new PublicKey(process.env.SOL_USDC_MINT);
    const usdcAta = await getAssociatedTokenAddress(usdcMint, keypair.publicKey);
    
    try {
      const usdcAccount = await getAccount(solanaConnection, usdcAta);
      console.log(`USDC: ${Number(usdcAccount.amount) / 1e6}`);
    } catch (e) {
      console.log('USDC ATA non trouvé');
    }
    
    // WSOL balance
    const wsolMint = new PublicKey(process.env.SOL_WSOL_MINT);
    const wsolAta = await getAssociatedTokenAddress(wsolMint, keypair.publicKey);
    
    try {
      const wsolAccount = await getAccount(solanaConnection, wsolAta);
      console.log(`WSOL: ${Number(wsolAccount.amount) / 1e9}`);
    } catch (e) {
      console.log('WSOL ATA non trouvé');
    }
    
    // Test d'un quote Jupiter
    console.log('\n🧪 Test quote Jupiter...');
    const jupiterApi = axios.create({
      baseURL: 'https://quote-api.jup.ag/v6',
    });
    
    const quoteResponse = await jupiterApi.get('/quote', {
      params: {
        inputMint: usdcMint.toBase58(),
        outputMint: wsolMint.toBase58(),
        amount: '100000', // 0.1 USDC
        slippageBps: 50,
        swapMode: 'ExactIn'
      }
    });
    
    const quote = quoteResponse.data;
    console.log('Quote récupéré:');
    console.log(`  Input: ${quote.inAmount} (${Number(quote.inAmount) / 1e6} USDC)`);
    console.log(`  Output: ${quote.outAmount} (${Number(quote.outAmount) / 1e9} WSOL)`);
    console.log(`  Price Impact: ${quote.priceImpactPct}%`);
    
    // Test de construction de transaction
    console.log('\n🧪 Test construction transaction...');
    const swapResponse = await jupiterApi.post('/swap', {
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: false, // Ne pas wrap/unwrap automatiquement
      prioritizationFeeLamports: 1000,
      dynamicComputeUnitLimit: true,
      skipUserAccountsRpcCalls: true,
    });
    
    console.log('Transaction construite avec succès');
    console.log(`  Swap Transaction: ${swapResponse.data.swapTransaction ? 'Oui' : 'Non'}`);
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

testJupiterSimple();
