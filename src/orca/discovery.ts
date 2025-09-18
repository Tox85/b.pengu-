import { PublicKey } from '@solana/web3.js';
import { SOLANA_CONFIG } from '../config/solana.js';

export interface PoolMeta {
  address: string;
  tickSpacing: number;
  feeRate: number;
  tvl: number;
  tokenA: {
    mint: string;
    symbol: string;
    decimals: number;
  };
  tokenB: {
    mint: string;
    symbol: string;
    decimals: number;
  };
}

export interface OrcaApiResponse {
  whirlpools: Array<{
    address: string;
    tickSpacing: number;
    feeRate: number;
    tvl: number;
    tokenA: {
      mint: string;
      symbol: string;
      decimals: number;
    };
    tokenB: {
      mint: string;
      symbol: string;
      decimals: number;
    };
  }>;
}

/**
 * Récupère tous les pools Orca via l'API publique
 */
export async function fetchOrcaPools(): Promise<PoolMeta[]> {
  try {
    console.log('🔍 Récupération des pools Orca...');
    
    const response = await fetch('https://api.mainnet.orca.so/v1/whirlpool/list', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'b.pengu-bot/1.0.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API Orca error: ${response.status} ${response.statusText}`);
    }
    
    const data: OrcaApiResponse = await response.json();
    
    console.log(`   ${data.whirlpools.length} pools trouvés`);
    
    return data.whirlpools.map(pool => ({
      address: pool.address,
      tickSpacing: pool.tickSpacing,
      feeRate: pool.feeRate,
      tvl: pool.tvl,
      tokenA: pool.tokenA,
      tokenB: pool.tokenB
    }));
    
  } catch (error) {
    console.error('❌ Erreur API Orca:', error);
    throw error;
  }
}

/**
 * Découvre le meilleur pool PENGU/WSOL
 */
export async function discoverPenguWsol(): Promise<PoolMeta | null> {
  try {
    console.log('🐧 Découverte du pool PENGU/WSOL...');
    
    const pools = await fetchOrcaPools();
    
    const penguMint = SOLANA_CONFIG.PENGU_MINT.toBase58();
    const wsolMint = SOLANA_CONFIG.WSOL_MINT.toBase58();
    
    console.log(`   Recherche PENGU: ${penguMint}`);
    console.log(`   Recherche WSOL: ${wsolMint}`);
    
    // Filtrer les pools PENGU/WSOL
    const penguWsolPools = pools.filter(pool => {
      const tokenAMint = pool.tokenA.mint;
      const tokenBMint = pool.tokenB.mint;
      
      return (tokenAMint === penguMint && tokenBMint === wsolMint) ||
             (tokenAMint === wsolMint && tokenBMint === penguMint);
    });
    
    console.log(`   ${penguWsolPools.length} pools PENGU/WSOL trouvés`);
    
    if (penguWsolPools.length === 0) {
      console.log('❌ Aucun pool PENGU/WSOL trouvé');
      return null;
    }
    
    // Trier par TVL décroissant
    penguWsolPools.sort((a, b) => b.tvl - a.tvl);
    
    const bestPool = penguWsolPools[0];
    
    console.log(`✅ Meilleur pool PENGU/WSOL:`);
    console.log(`   Address: ${bestPool.address}`);
    console.log(`   TVL: $${bestPool.tvl.toLocaleString()}`);
    console.log(`   Tick Spacing: ${bestPool.tickSpacing}`);
    console.log(`   Fee Rate: ${bestPool.feeRate} bps`);
    console.log(`   Token A: ${bestPool.tokenA.symbol} (${bestPool.tokenA.mint})`);
    console.log(`   Token B: ${bestPool.tokenB.symbol} (${bestPool.tokenB.mint})`);
    
    return bestPool;
    
  } catch (error) {
    console.error('❌ Erreur découverte pool:', error);
    return null;
  }
}

/**
 * Découvre le pool PENGU/WSOL avec fallback
 */
export async function getPenguWsolPool(): Promise<PoolMeta | null> {
  // Si un pool est défini dans .env, l'utiliser
  if (SOLANA_CONFIG.ORCA_PENGU_WSOL_POOL) {
    console.log('📋 Utilisation du pool .env configuré');
    console.log(`   Pool: ${SOLANA_CONFIG.ORCA_PENGU_WSOL_POOL.toBase58()}`);
    
    // Valider que le pool existe (optionnel)
    try {
      const pools = await fetchOrcaPools();
      const pool = pools.find(p => p.address === SOLANA_CONFIG.ORCA_PENGU_WSOL_POOL!.toBase58());
      
      if (pool) {
        console.log(`   TVL: $${pool.tvl.toLocaleString()}`);
        return pool;
      } else {
        console.log('⚠️  Pool .env non trouvé dans l\'API, passage en auto-discovery');
      }
    } catch (error) {
      console.log('⚠️  Erreur validation pool .env, passage en auto-discovery');
    }
  }
  
  // Sinon, découvrir automatiquement
  console.log('🔍 Auto-discovery du pool PENGU/WSOL...');
  return await discoverPenguWsol();
}

/**
 * Test rapide de la découverte
 */
export async function testDiscovery(): Promise<void> {
  console.log('🧪 Test de découverte des pools PENGU/WSOL...');
  
  try {
    const pool = await getPenguWsolPool();
    
    if (pool) {
      console.log('✅ Test réussi !');
      console.log(`   Pool choisi: ${pool.address}`);
      console.log(`   TVL: $${pool.tvl.toLocaleString()}`);
    } else {
      console.log('❌ Test échoué - aucun pool trouvé');
    }
  } catch (error) {
    console.error('❌ Test échoué:', error);
  }
}
