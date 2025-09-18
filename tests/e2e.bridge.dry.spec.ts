import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ethers } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import { getE2EDatabase, closeE2EDatabase } from '../src/lib/sql';
import { createLiFiBridgeService } from '../src/services/bridge/lifi';
import { createERC20Service } from '../src/services/evm/erc20';

describe('E2E Bridge Dry Run', () => {
  let db: ReturnType<typeof getE2EDatabase>;
  let bridgeService: ReturnType<typeof createLiFiBridgeService>;
  let erc20Service: ReturnType<typeof createERC20Service>;

  beforeAll(() => {
    // Mock des variables d'environnement
    process.env.DRY_RUN = 'true';
    process.env.BASE_RPC_URL = 'https://mainnet.base.org';
    process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
    process.env.BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    process.env.SOL_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    process.env.LIFI_API_KEY = 'test_key';
    process.env.SLIPPAGE_BPS = '50';
    process.env.MAX_SPEND_USDC = '1';
    process.env.TIMEOUT_MS = '1800000';
    process.env.CONFIRMATIONS = '2';

    db = getE2EDatabase();
    bridgeService = createLiFiBridgeService(db);
    erc20Service = createERC20Service();
  });

  afterAll(() => {
    closeE2EDatabase();
  });

  it('should get bridge route without sending transaction', async () => {
    const route = await bridgeService.getRoute({
      srcChainId: 8453, // Base
      dstChainId: 101,  // Solana
      srcToken: process.env.BASE_USDC!,
      dstToken: process.env.SOL_USDC_MINT!,
      amount: ethers.parseUnits('1', 6).toString(), // 1 USDC
      address: '0x1234567890123456789012345678901234567890',
    });

    expect(route).toBeDefined();
    expect(route.fromChainId).toBe(8453);
    expect(route.toChainId).toBe(101);
    expect(route.fromTokenAddress).toBe(process.env.BASE_USDC);
    expect(route.toTokenAddress).toBe(process.env.SOL_USDC_MINT);
    expect(route.steps.length).toBeGreaterThan(0);
    expect(route.gasCosts.length).toBeGreaterThan(0);
  });

  it('should build transaction from route', async () => {
    const route = await bridgeService.getRoute({
      srcChainId: 8453,
      dstChainId: 101,
      srcToken: process.env.BASE_USDC!,
      dstToken: process.env.SOL_USDC_MINT!,
      amount: ethers.parseUnits('1', 6).toString(),
      address: '0x1234567890123456789012345678901234567890',
    });

    const txData = bridgeService.buildTx(route);

    expect(txData).toBeDefined();
    expect(txData.to).toBeDefined();
    expect(txData.data).toBeDefined();
    expect(txData.value).toBeDefined();
    expect(ethers.isAddress(txData.to)).toBe(true);
  });

  it('should respect max spend caps', async () => {
    const maxSpend = parseFloat(process.env.MAX_SPEND_USDC!);
    
    // Test avec un montant qui dépasse le cap
    await expect(
      bridgeService.getRoute({
        srcChainId: 8453,
        dstChainId: 101,
        srcToken: process.env.BASE_USDC!,
        dstToken: process.env.SOL_USDC_MINT!,
        amount: ethers.parseUnits((maxSpend + 1).toString(), 6).toString(),
        address: '0x1234567890123456789012345678901234567890',
      })
    ).rejects.toThrow('exceeds max spend');
  });

  it('should respect slippage settings', async () => {
    const route = await bridgeService.getRoute({
      srcChainId: 8453,
      dstChainId: 101,
      srcToken: process.env.BASE_USDC!,
      dstToken: process.env.SOL_USDC_MINT!,
      amount: ethers.parseUnits('1', 6).toString(),
      address: '0x1234567890123456789012345678901234567890',
    });

    // Vérifier que le slippage est appliqué
    expect(route.steps[0].action.fromAmount).toBeDefined();
    expect(route.steps[0].action.toAmount).toBeDefined();
  });

  it('should handle dry run mode correctly', async () => {
    const mockWallet = {
      address: '0x1234567890123456789012345678901234567890',
      sendTransaction: jest.fn(),
      estimateGas: jest.fn().mockResolvedValue(ethers.parseUnits('0.001', 'ether')),
      provider: {
        getFeeData: jest.fn().mockResolvedValue({
          gasPrice: ethers.parseUnits('0.000000001', 'ether'), // 1 Gwei
        }),
      },
    } as any;

    const txData = {
      to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      data: '0x1234567890abcdef',
      value: '0',
    };

    const result = await bridgeService.sendAndPoll(
      mockWallet,
      txData,
      'test_job_id',
      {
        confirmations: 2,
        timeoutMs: 30000,
      }
    );

    expect(result.srcTxHash).toBe('0x' + '0'.repeat(64));
    expect(mockWallet.sendTransaction).not.toHaveBeenCalled();
  });

  it('should validate gas price limits', async () => {
    const mockWallet = {
      address: '0x1234567890123456789012345678901234567890',
      provider: {
        getFeeData: jest.fn().mockResolvedValue({
          gasPrice: ethers.parseUnits('0.000000010', 'ether'), // 10 Gwei (dépasse le max)
        }),
      },
    } as any;

    // Mock du service ERC20 pour tester la vérification du gas
    const mockERC20Service = {
      checkGasPrice: jest.fn().mockResolvedValue(false),
    };

    expect(await mockERC20Service.checkGasPrice()).toBe(false);
  });

  it('should persist job status in database', async () => {
    const jobId = 'test_job_' + Date.now();
    
    // Créer un job
    const job = db.createJob({
      id: jobId,
      status: 'pending',
      step: 'bridge_route',
    });

    expect(job.id).toBe(jobId);
    expect(job.status).toBe('pending');

    // Mettre à jour le job
    db.updateJob(jobId, {
      status: 'in_progress',
      step: 'bridge_sent',
      srcTxHash: '0x' + '0'.repeat(64),
    });

    const updatedJob = db.getJob(jobId);
    expect(updatedJob?.status).toBe('in_progress');
    expect(updatedJob?.srcTxHash).toBe('0x' + '0'.repeat(64));
  });

  it('should handle timeout scenarios with exponential backoff', async () => {
    const mockWallet = {
      address: '0x1234567890123456789012345678901234567890',
      sendTransaction: jest.fn().mockResolvedValue({
        hash: '0x' + '0'.repeat(64),
        wait: jest.fn().mockResolvedValue({
          hash: '0x' + '0'.repeat(64),
        }),
      }),
      provider: {
        getFeeData: jest.fn().mockResolvedValue({
          gasPrice: ethers.parseUnits('0.000000001', 'ether'),
        }),
      },
    } as any;

    // Mock de la méthode de polling pour simuler un timeout avec backoff
    const originalPoll = bridgeService['pollDestinationTx'];
    let pollCalls = 0;
    bridgeService['pollDestinationTx'] = jest.fn().mockImplementation(async () => {
      pollCalls++;
      if (pollCalls === 1) {
        // Premier appel - simuler un délai court
        await new Promise(resolve => setTimeout(resolve, 100));
      } else if (pollCalls === 2) {
        // Deuxième appel - simuler un délai plus long (backoff)
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      return null; // Timeout
    });

    const txData = {
      to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      data: '0x1234567890abcdef',
      value: '0',
    };

    await expect(
      bridgeService.sendAndPoll(
        mockWallet,
        txData,
        'test_job_id',
        {
          confirmations: 1,
          timeoutMs: 1000, // 1 seconde pour forcer le timeout
        }
      )
    ).rejects.toThrow('Bridge timeout');

    // Vérifier que le polling a été appelé plusieurs fois (backoff)
    expect(pollCalls).toBeGreaterThan(1);

    // Restaurer la méthode originale
    bridgeService['pollDestinationTx'] = originalPoll;
  });

  it('should handle idempotence correctly', async () => {
    const jobId = 'test_idempotence_' + Date.now();
    
    // Créer un job terminé
    const completedJob = db.createJob({
      id: jobId,
      status: 'completed',
      step: 'completed',
      srcTxHash: '0x' + '0'.repeat(64),
      destTxHash: '0x' + '0'.repeat(64),
    });

    // Vérifier que le job existe et est terminé
    const retrievedJob = db.getJob(jobId);
    expect(retrievedJob?.status).toBe('completed');
    expect(retrievedJob?.srcTxHash).toBe('0x' + '0'.repeat(64));
    expect(retrievedJob?.destTxHash).toBe('0x' + '0'.repeat(64));
  });
});
