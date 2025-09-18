#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');

console.log('💰 Vérification des balances Solana...');

dotenv.config();

async function checkBalances() {
  try {
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`Address: ${keypair.publicKey.toString()}`);
    
    // SOL balance
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
    
    // Vérifier si l'ATA WSOL existe
    try {
      const wsolAccountInfo = await solanaConnection.getAccountInfo(wsolAta);
      if (wsolAccountInfo) {
        console.log(`WSOL ATA existe: ${wsolAta.toBase58()}`);
        console.log(`WSOL ATA data length: ${wsolAccountInfo.data.length}`);
      } else {
        console.log('WSOL ATA n\'existe pas');
      }
    } catch (e) {
      console.log('Erreur lors de la vérification WSOL ATA:', e.message);
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

checkBalances();