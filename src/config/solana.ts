import dotenv from 'dotenv';
import { PublicKey } from '@solana/web3.js';

// Charger les variables d'environnement avec override
dotenv.config({ override: true });

// Configuration Solana unifiée
export const SOLANA_CONFIG = {
  // RPC
  RPC_URL: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  WSS_URL: process.env.SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com',
  
  // Mode d'exécution
  DRY_RUN: process.env.DRY_RUN === 'true',
  
  // Slippage
  SLIPPAGE_BPS: parseInt(process.env.SLIPPAGE_BPS || '50'),
  
  // Mints
  PENGU_MINT: new PublicKey(process.env.SOL_PENGU_MINT || '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv'),
  WSOL_MINT: new PublicKey(process.env.SOL_WSOL_MINT || 'So11111111111111111111111111111111111111112'),
  USDC_MINT: new PublicKey(process.env.SOL_USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  
  // Orca
  ORCA_PROGRAM: new PublicKey(process.env.ORCA_WHIRLPOOLS_PROGRAM || 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'),
  ORCA_PENGU_WSOL_POOL: process.env.ORCA_PENGU_WSOL_POOL ? new PublicKey(process.env.ORCA_PENGU_WSOL_POOL) : null,
  
  // Target Asset
  TARGET_ASSET: (process.env.TARGET_ASSET || 'PENGU').toUpperCase(),
  
  // Compute Budget
  COMPUTE_UNITS: parseInt(process.env.SOL_COMPUTE_UNITS || '300000'),
  PRIORITY_FEE_MICROLAMPORTS: parseInt(process.env.SOL_MICRO_LAMPORTS || '2000'),
  
  // Caps de sécurité
  MAX_USDC_AMOUNT: parseFloat(process.env.MAX_SPEND_USDC || '1'),
  MAX_PENGU_AMOUNT: parseFloat(process.env.MAX_SPEND_PENGU || '10'),
  MAX_WSOL_AMOUNT: parseFloat(process.env.MAX_SPEND_WSOL || '1'),
} as const;

// Validation de la configuration
export function validateSolanaConfig(): boolean {
  try {
    // Vérifier que les PublicKeys sont valides
    SOLANA_CONFIG.PENGU_MINT.toBase58();
    SOLANA_CONFIG.WSOL_MINT.toBase58();
    SOLANA_CONFIG.USDC_MINT.toBase58();
    SOLANA_CONFIG.ORCA_PROGRAM.toBase58();
    
    if (SOLANA_CONFIG.ORCA_PENGU_WSOL_POOL) {
      SOLANA_CONFIG.ORCA_PENGU_WSOL_POOL.toBase58();
    }
    
    // Vérifier que TARGET_ASSET est PENGU
    if (SOLANA_CONFIG.TARGET_ASSET !== 'PENGU') {
      console.warn(`⚠️  TARGET_ASSET=${SOLANA_CONFIG.TARGET_ASSET}, attendu PENGU`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Configuration Solana invalide:', error);
    return false;
  }
}

// Log de la configuration
export function logSolanaConfig(): void {
  console.log('🔧 Configuration Solana:');
  console.log(`   RPC: ${SOLANA_CONFIG.RPC_URL}`);
  console.log(`   Mode: ${SOLANA_CONFIG.DRY_RUN ? 'DRY_RUN' : 'LIVE'}`);
  console.log(`   Target Asset: ${SOLANA_CONFIG.TARGET_ASSET}`);
  console.log(`   PENGU Mint: ${SOLANA_CONFIG.PENGU_MINT.toBase58()}`);
  console.log(`   WSOL Mint: ${SOLANA_CONFIG.WSOL_MINT.toBase58()}`);
  console.log(`   USDC Mint: ${SOLANA_CONFIG.USDC_MINT.toBase58()}`);
  console.log(`   Orca Program: ${SOLANA_CONFIG.ORCA_PROGRAM.toBase58()}`);
  console.log(`   Orca Pool: ${SOLANA_CONFIG.ORCA_PENGU_WSOL_POOL?.toBase58() || 'Auto-discovery'}`);
  console.log(`   Slippage: ${SOLANA_CONFIG.SLIPPAGE_BPS} bps`);
  console.log(`   Compute Units: ${SOLANA_CONFIG.COMPUTE_UNITS}`);
  console.log(`   Priority Fee: ${SOLANA_CONFIG.PRIORITY_FEE_MICROLAMPORTS} microLamports`);
}
