#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const axios = require('axios');

console.log('🔍 Recherche des pools PENGU/WSOL sur Orca...');

dotenv.config();

async function findPenguPools() {
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    
    // 2. Mints
    const penguMint = new PublicKey(process.env.SOL_PENGU_MINT);
    const wsolMint = new PublicKey(process.env.SOL_WSOL_MINT);
    const usdcMint = new PublicKey(process.env.SOL_USDC_MINT);
    
    console.log(`   PENGU Mint: ${penguMint.toBase58()}`);
    console.log(`   WSOL Mint: ${wsolMint.toBase58()}`);
    console.log(`   USDC Mint: ${usdcMint.toBase58()}`);
    
    // 3. Recherche via Orca API
    console.log('\n2️⃣ Recherche via Orca API...');
    
    try {
      // Orca Whirlpools API
      const orcaApi = axios.create({
        baseURL: 'https://api.mainnet.orca.so/v1',
      });
      
      // Rechercher les pools PENGU
      console.log('   Recherche des pools PENGU...');
      const poolsResponse = await orcaApi.get('/whirlpool/list');
      const pools = poolsResponse.data;
      
      console.log(`   ${pools.length} pools trouvés sur Orca`);
      
      // Filtrer les pools contenant PENGU
      const penguPools = pools.filter(pool => 
        pool.tokenA.mint === penguMint.toBase58() || 
        pool.tokenB.mint === penguMint.toBase58()
      );
      
      console.log(`   ${penguPools.length} pools PENGU trouvés`);
      
      if (penguPools.length > 0) {
        console.log('\n   Pools PENGU disponibles:');
        penguPools.forEach((pool, index) => {
          const tokenA = pool.tokenA.symbol;
          const tokenB = pool.tokenB.symbol;
          const tvl = pool.tvl || 0;
          const volume24h = pool.volume24h || 0;
          
          console.log(`   ${index + 1}. ${tokenA}/${tokenB}`);
          console.log(`      Pool ID: ${pool.address}`);
          console.log(`      TVL: $${tvl.toLocaleString()}`);
          console.log(`      Volume 24h: $${volume24h.toLocaleString()}`);
          console.log(`      Token A: ${pool.tokenA.mint}`);
          console.log(`      Token B: ${pool.tokenB.mint}`);
          console.log('');
        });
        
        // Recommander le pool le plus liquide
        const bestPool = penguPools.reduce((best, current) => 
          (current.tvl || 0) > (best.tvl || 0) ? current : best
        );
        
        console.log(`   🏆 Pool recommandé: ${bestPool.tokenA.symbol}/${bestPool.tokenB.symbol}`);
        console.log(`      Pool ID: ${bestPool.address}`);
        console.log(`      TVL: $${bestPool.tvl?.toLocaleString() || 'N/A'}`);
        
        // Vérifier si c'est PENGU/WSOL
        const isPenguWsol = (bestPool.tokenA.mint === penguMint.toBase58() && bestPool.tokenB.mint === wsolMint.toBase58()) ||
                           (bestPool.tokenB.mint === penguMint.toBase58() && bestPool.tokenA.mint === wsolMint.toBase58());
        
        if (isPenguWsol) {
          console.log('   ✅ Pool PENGU/WSOL trouvé !');
          console.log(`   Ajoutez ceci à votre .env:`);
          console.log(`   ORCA_PENGU_WSOL_POOL=${bestPool.address}`);
        } else {
          console.log('   ⚠️  Pool PENGU trouvé mais pas PENGU/WSOL');
          console.log(`   Pool: ${bestPool.tokenA.symbol}/${bestPool.tokenB.symbol}`);
        }
        
      } else {
        console.log('   ❌ Aucun pool PENGU trouvé sur Orca');
      }
      
    } catch (error) {
      console.log('   ❌ Erreur lors de la recherche via Orca API:');
      console.log(`   ${error.message}`);
    }
    
    // 4. Recherche alternative via Jupiter
    console.log('\n3️⃣ Recherche alternative via Jupiter...');
    
    try {
      const jupiterApi = axios.create({
        baseURL: 'https://quote-api.jup.ag/v6',
      });
      
      // Tester une route PENGU → WSOL pour voir les pools utilisés
      console.log('   Test de route PENGU → WSOL...');
      const quoteResponse = await jupiterApi.get('/quote', {
        params: {
          inputMint: penguMint.toBase58(),
          outputMint: wsolMint.toBase58(),
          amount: '1000000', // 1 PENGU
          slippageBps: 50,
          swapMode: 'ExactIn'
        }
      });
      
      const quote = quoteResponse.data;
      console.log('   ✅ Route PENGU → WSOL trouvée');
      console.log(`   Route: ${quote.routePlan?.map(step => step.swapInfo?.label).join(' → ')}`);
      
      // Analyser les pools utilisés
      if (quote.routePlan) {
        console.log('\n   Pools utilisés dans la route:');
        quote.routePlan.forEach((step, index) => {
          if (step.swapInfo) {
            console.log(`   ${index + 1}. ${step.swapInfo.label}`);
            if (step.swapInfo.poolId) {
              console.log(`      Pool ID: ${step.swapInfo.poolId}`);
            }
          }
        });
      }
      
    } catch (error) {
      console.log('   ❌ Erreur lors de la recherche via Jupiter:');
      console.log(`   ${error.message}`);
    }
    
    // 5. Recherche manuelle dans les données connues
    console.log('\n4️⃣ Recherche dans les données connues...');
    
    // Pools PENGU connus (à mettre à jour avec les vrais IDs)
    const knownPools = [
      {
        name: 'PENGU/WSOL (Orca)',
        id: 'FAqh648xeeaTqL7du49sztp9nfj5PjRQrfvaMccyd9cz', // ID supposé
        tvl: '10.8M',
        source: 'GeckoTerminal'
      },
      {
        name: 'PENGU/USDC (Meteora)',
        id: 'Unknown',
        tvl: '1.7M',
        source: 'GeckoTerminal'
      }
    ];
    
    console.log('   Pools PENGU connus:');
    knownPools.forEach((pool, index) => {
      console.log(`   ${index + 1}. ${pool.name}`);
      console.log(`      Pool ID: ${pool.id}`);
      console.log(`      TVL: $${pool.tvl}`);
      console.log(`      Source: ${pool.source}`);
      console.log('');
    });
    
    console.log('✅ Recherche des pools PENGU terminée !');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

findPenguPools();
