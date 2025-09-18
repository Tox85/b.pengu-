#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');
const axios = require('axios');

console.log('🏊 Test Orca simple...');

dotenv.config();

async function testOrcaSimple() {
  try {
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    
    // 2. Test de l'API Jupiter pour les routes PENGU
    console.log('\n2️⃣ Test de l\'API Jupiter pour les routes PENGU...');
    
    const wsolMint = 'So11111111111111111111111111111111111111112';
    const penguMint = '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv';
    
    try {
      const jupiterApi = axios.create({
        baseURL: 'https://quote-api.jup.ag/v6',
      });
      
      // Tester une route PENGU → WSOL
      console.log('   Test de route PENGU → WSOL...');
      const quoteResponse = await jupiterApi.get('/quote', {
        params: {
          inputMint: penguMint,
          outputMint: wsolMint,
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
        
        // Chercher des pools Orca dans la route
        const orcaPools = quote.routePlan.filter(step => 
          step.swapInfo?.label?.toLowerCase().includes('orca') || 
          step.swapInfo?.label?.toLowerCase().includes('whirlpool')
        );
        
        if (orcaPools.length > 0) {
          console.log('\n   🏊 Pools Orca trouvés dans la route:');
          orcaPools.forEach((step, index) => {
            console.log(`   ${index + 1}. ${step.swapInfo.label}`);
            if (step.swapInfo.poolId) {
              console.log(`      Pool ID: ${step.swapInfo.poolId}`);
              console.log(`      💡 Utilisez ce Pool ID pour ORCA_PENGU_WSOL_POOL`);
            }
          });
        } else {
          console.log('\n   ⚠️  Aucun pool Orca trouvé dans la route');
          console.log('   La route utilise d\'autres DEX (Raydium, Meteora, etc.)');
        }
      }
      
    } catch (error) {
      console.log('   ❌ Erreur lors de l\'appel à l\'API Jupiter:');
      console.log(`   ${error.message}`);
    }
    
    // 3. Test de l'API Orca
    console.log('\n3️⃣ Test de l\'API Orca...');
    
    try {
      const orcaApi = axios.create({
        baseURL: 'https://api.mainnet.orca.so/v1',
      });
      
      console.log('   Recherche des pools disponibles...');
      const poolsResponse = await orcaApi.get('/whirlpool/list');
      const pools = poolsResponse.data.whirlpools || poolsResponse.data;
      
      console.log(`   Réponse API Orca: ${typeof pools}`);
      console.log(`   Nombre de pools: ${pools?.length || 'N/A'}`);
      
      if (Array.isArray(pools)) {
        console.log(`   ${pools.length} pools trouvés sur Orca`);
        
        // Chercher des pools avec WSOL
        const wsolPools = pools.filter(pool => 
          pool.tokenA?.mint === wsolMint || pool.tokenB?.mint === wsolMint
        );
        
        console.log(`   ${wsolPools.length} pools WSOL trouvés`);
        
        // Afficher les premiers pools WSOL
        console.log('\n   Pools WSOL disponibles:');
        wsolPools.slice(0, 3).forEach((pool, index) => {
          const tokenA = pool.tokenA?.symbol || 'Unknown';
          const tokenB = pool.tokenB?.symbol || 'Unknown';
          const tvl = pool.tvl || 0;
          
          console.log(`   ${index + 1}. ${tokenA}/${tokenB}`);
          console.log(`      Pool ID: ${pool.address}`);
          console.log(`      TVL: $${tvl.toLocaleString()}`);
          console.log(`      Token A: ${pool.tokenA?.mint || 'N/A'}`);
          console.log(`      Token B: ${pool.tokenB?.mint || 'N/A'}`);
          console.log('');
        });
        
        // Chercher des pools PENGU
        const penguPools = pools.filter(pool => 
          pool.tokenA?.mint === penguMint || pool.tokenB?.mint === penguMint
        );
        
        console.log(`   ${penguPools.length} pools PENGU trouvés`);
        
        if (penguPools.length > 0) {
          console.log('\n   Pools PENGU disponibles:');
          penguPools.forEach((pool, index) => {
            const tokenA = pool.tokenA?.symbol || 'Unknown';
            const tokenB = pool.tokenB?.symbol || 'Unknown';
            const tvl = pool.tvl || 0;
            
            console.log(`   ${index + 1}. ${tokenA}/${tokenB}`);
            console.log(`      Pool ID: ${pool.address}`);
            console.log(`      TVL: $${tvl.toLocaleString()}`);
            console.log(`      Token A: ${pool.tokenA?.mint || 'N/A'}`);
            console.log(`      Token B: ${pool.tokenB?.mint || 'N/A'}`);
            console.log('');
          });
          
          // Recommander le pool PENGU le plus liquide
          const bestPenguPool = penguPools.reduce((best, current) => 
            (current.tvl || 0) > (best.tvl || 0) ? current : best
          );
          
          console.log(`   🏆 Pool PENGU recommandé: ${bestPenguPool.tokenA?.symbol}/${bestPenguPool.tokenB?.symbol}`);
          console.log(`      Pool ID: ${bestPenguPool.address}`);
          console.log(`      TVL: $${bestPenguPool.tvl?.toLocaleString() || 'N/A'}`);
          
          // Vérifier si c'est PENGU/WSOL
          const isPenguWsol = (bestPenguPool.tokenA?.mint === penguMint && bestPenguPool.tokenB?.mint === wsolMint) ||
                             (bestPenguPool.tokenB?.mint === penguMint && bestPenguPool.tokenA?.mint === wsolMint);
          
          if (isPenguWsol) {
            console.log('   ✅ Pool PENGU/WSOL trouvé !');
            console.log(`   Mettez à jour votre .env avec:`);
            console.log(`   ORCA_PENGU_WSOL_POOL=${bestPenguPool.address}`);
          } else {
            console.log('   ⚠️  Pool PENGU trouvé mais pas PENGU/WSOL');
            console.log(`   Pool: ${bestPenguPool.tokenA?.symbol}/${bestPenguPool.tokenB?.symbol}`);
          }
          
        } else {
          console.log('   ❌ Aucun pool PENGU trouvé sur Orca');
          console.log('   Suggestions:');
          console.log('   1. Vérifier que PENGU est listé sur Orca');
          console.log('   2. Chercher sur d\'autres DEX (Raydium, Meteora)');
          console.log('   3. Utiliser Jupiter pour les swaps PENGU');
        }
        
      } else {
        console.log('   ⚠️  Format de réponse API Orca inattendu');
        console.log(`   Type: ${typeof pools}`);
        console.log(`   Contenu: ${JSON.stringify(pools).substring(0, 200)}...`);
      }
      
    } catch (error) {
      console.log('   ❌ Erreur lors de l\'appel à l\'API Orca:');
      console.log(`   ${error.message}`);
    }
    
    console.log('\n✅ Test Orca simple terminé !');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

testOrcaSimple();
