import nock from 'nock';
import { jest } from 'vitest';

// Configuration des mocks HTTP
const LIFI_BASE_URL = 'https://li.quest';
const JUPITER_BASE_URL = 'https://quote-api.jup.ag';
const ORCA_BASE_URL = 'https://api.mainnet.orca.so';

/**
 * Désactive toutes les connexions réseau sauf localhost
 */
export function disableNetConnect(): void {
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');
}

/**
 * Mock du happy path Li.Fi (USDC EVM → Solana via CCTP)
 */
export function mockLifiHappyPath(): void {
  // Mock GET /v1/quote
  nock(LIFI_BASE_URL)
    .get('/v1/quote')
    .query(true)
    .reply(200, {
      id: 'mock-route-id',
      type: 'lifi',
      tool: 'cctp',
      action: {
        type: 'cross',
        fromChainId: 1,
        toChainId: 1399811149, // Solana
        fromToken: {
          address: '0xA0b86a33E6441c8C06DDD3d4c4c0E3c4c4c4c4c4',
          symbol: 'USDC',
          decimals: 6,
          chainId: 1,
        },
        toToken: {
          address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          symbol: 'USDC',
          decimals: 6,
          chainId: 1399811149,
        },
        fromAmount: '1000000',
        toAmount: '1000000',
        slippage: 0.01,
        gasCosts: [
          {
            type: 'SEND',
            price: {
              amount: '1000000000000000000',
              token: {
                address: '0x0000000000000000000000000000000000000000',
                symbol: 'ETH',
                decimals: 18,
                chainId: 1,
              },
            },
            estimate: '21000',
            limit: '30000',
          },
        ],
        steps: [
          {
            id: 'mock-step-id',
            type: 'cross',
            tool: 'cctp',
            action: {
              type: 'cross',
              fromChainId: 1,
              toChainId: 1399811149,
              fromToken: {
                address: '0xA0b86a33E6441c8C06DDD3d4c4c0E3c4c4c4c4c4',
                symbol: 'USDC',
                decimals: 6,
                chainId: 1,
              },
              toToken: {
                address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                symbol: 'USDC',
                decimals: 6,
                chainId: 1399811149,
              },
              fromAmount: '1000000',
              toAmount: '1000000',
              slippage: 0.01,
            },
            estimate: {
              fromAmount: '1000000',
              toAmount: '1000000',
              toAmountMin: '990000',
              approvalAddress: '0x1234567890123456789012345678901234567890',
              executionDuration: 300,
              feeCosts: [],
              gasCosts: [],
            },
          },
        ],
      },
      tags: ['RECOMMENDED'],
    });

  // Mock POST /v1/transfer
  nock(LIFI_BASE_URL)
    .post('/v1/transfer')
    .reply(200, {
      transactionRequest: {
        data: '0x1234567890abcdef',
        to: '0x1234567890123456789012345678901234567890',
        value: '0',
        gasPrice: '20000000000',
        gasLimit: '300000',
      },
    });
}

/**
 * Mock Li.Fi avec timeout puis retry
 */
export function mockLifiTimeoutThenRetry(): void {
  let callCount = 0;
  
  nock(LIFI_BASE_URL)
    .get('/v1/quote')
    .query(true)
    .reply(() => {
      callCount++;
      if (callCount === 1) {
        return [500, { error: 'Internal Server Error' }];
      }
      return [200, {
        id: 'mock-route-id-retry',
        type: 'lifi',
        tool: 'cctp',
        action: {
          type: 'cross',
          fromChainId: 1,
          toChainId: 1399811149,
          fromToken: {
            address: '0xA0b86a33E6441c8C06DDD3d4c4c0E3c4c4c4c4c4',
            symbol: 'USDC',
            decimals: 6,
            chainId: 1,
          },
          toToken: {
            address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            symbol: 'USDC',
            decimals: 6,
            chainId: 1399811149,
          },
          fromAmount: '1000000',
          toAmount: '1000000',
          slippage: 0.01,
          gasCosts: [],
          steps: [],
        },
        tags: ['RECOMMENDED'],
      }];
    });
}

/**
 * Mock du happy path Jupiter (USDC → PENGU)
 */
export function mockJupHappyPath(): void {
  // Mock GET /v6/quote
  nock(JUPITER_BASE_URL)
    .get('/v6/quote')
    .query((query) => {
      return query.inputMint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' &&
             query.outputMint === '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv';
    })
    .reply(200, {
      inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      inAmount: '1000000',
      outputMint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
      outAmount: '1000000000',
      otherAmountThreshold: '990000000',
      swapMode: 'ExactIn',
      slippageBps: 100,
      platformFee: null,
      priceImpactPct: '0.1',
      routePlan: [
        {
          swapInfo: {
            ammKey: 'mock-amm-key',
            label: 'Mock AMM',
            inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            inAmount: '1000000',
            outputMint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
            outAmount: '1000000000',
            feeAmount: '1000',
            feeMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          },
          percent: 100,
        },
      ],
      contextSlot: 123456789,
      timeTaken: 0.1,
    });

  // Mock POST /v6/swap
  nock(JUPITER_BASE_URL)
    .post('/v6/swap')
    .reply(200, {
      swapTransaction: Buffer.from('mock-swap-transaction').toString('base64'),
      lastValidBlockHeight: 123456789,
      prioritizationFeeLamports: 1000,
    });
}

/**
 * Mock Jupiter avec slippage élevé
 */
export function mockJupHighSlippage(): void {
  nock(JUPITER_BASE_URL)
    .get('/v6/quote')
    .query(true)
    .reply(200, {
      inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      inAmount: '1000000',
      outputMint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
      outAmount: '1000000000',
      otherAmountThreshold: '990000000',
      swapMode: 'ExactIn',
      slippageBps: 100,
      platformFee: null,
      priceImpactPct: '5.0', // Slippage élevé
      routePlan: [],
      contextSlot: 123456789,
      timeTaken: 0.1,
    });
}

/**
 * Mock du happy path Orca (Whirlpools)
 */
export function mockOrcaHappyPath(): void {
  // Mock des endpoints Orca nécessaires
  nock(ORCA_BASE_URL)
    .get('/v1/whirlpool/list')
    .reply(200, {
      whirlpools: [
        {
          address: 'mock-whirlpool-address',
          tokenA: {
            mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            symbol: 'USDC',
            decimals: 6,
          },
          tokenB: {
            mint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
            symbol: 'PENGU',
            decimals: 9,
          },
          tickSpacing: 64,
          sqrtPrice: '79228162514264337593543950336',
          liquidity: '1000000000000',
          feeRate: 0.01,
        },
      ],
    });

  nock(ORCA_BASE_URL)
    .get('/v1/whirlpool/position')
    .query(true)
    .reply(200, {
      position: {
        address: 'mock-position-address',
        whirlpool: 'mock-whirlpool-address',
        positionMint: 'mock-position-mint',
        liquidity: '1000000000000',
        tickLowerIndex: -1000,
        tickUpperIndex: 1000,
        feeOwedA: '0',
        feeOwedB: '0',
        rewardInfos: [],
      },
    });
}

/**
 * Nettoyage des mocks
 */
export function cleanupMocks(): void {
  nock.cleanAll();
}

/**
 * Vérification que tous les mocks ont été utilisés
 */
export function verifyMocks(): void {
  if (!nock.isDone()) {
    const pendingMocks = nock.pendingMocks();
    throw new Error(`Mocks non utilisés: ${pendingMocks.join(', ')}`);
  }
}
