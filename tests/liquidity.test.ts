import { vi } from 'vitest';
import { LiquidityManager } from '../modules/liquidity';
import { Wallet } from '../src/types';

// Mock de la configuration
vi.mock('../src/config', () => ({
  config: {
    rpc: {
      solana: 'https://api.devnet.solana.com',
    },
  },
}));

// Mock de @solana/web3.js
vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn().mockImplementation(() => ({
    getVersion: vi.fn(),
    sendTransaction: vi.fn(),
    confirmTransaction: vi.fn(),
    getParsedTokenAccountsByOwner: vi.fn(),
  })),
  PublicKey: vi.fn(),
  Transaction: vi.fn(),
}));

// Mock du walletManager
vi.mock('../modules/wallets', () => ({
  walletManager: {
    getWallet: vi.fn(),
    signSolanaTransaction: vi.fn(),
  },
}));

describe('LiquidityManager', () => {
  let liquidityManager: LiquidityManager;
  let mockWallet: Wallet;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    
    mockWallet = {
      index: 0,
      address: 'SolanaAddress123',
      privateKey: 'solanaPrivateKey123',
      publicKey: 'solanaPublicKey123',
      evmAddress: '0x1234567890123456789012345678901234567890',
      evmPrivateKey: 'evmPrivateKey123',
    };
    
    liquidityManager = new LiquidityManager({
      connection: {
        getVersion: vi.fn(),
        sendTransaction: vi.fn(),
        confirmTransaction: vi.fn(),
        getParsedTokenAccountsByOwner: vi.fn(),
      },
      walletManager: {
        getWallet: vi.fn().mockReturnValue(mockWallet),
        signSolanaTransaction: vi.fn().mockResolvedValue('signed-transaction'),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('openPosition', () => {
    it('devrait ouvrir une position de liquidité concentrée', async () => {
      // Mock de la connexion Solana
      const mockConnection = (liquidityManager as any).connection;
      mockConnection.sendTransaction.mockResolvedValue('transactionSignature123');
      mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });

      // Mock des soldes
      const mockGetTokenBalance = vi.spyOn(liquidityManager as any, 'getTokenBalance');
      mockGetTokenBalance.mockResolvedValue(100); // Solde USDC suffisant

      // Mock de la construction de transaction
      const mockBuildOpenPositionTransaction = vi.spyOn(liquidityManager as any, 'buildOpenPositionTransaction');
      mockBuildOpenPositionTransaction.mockResolvedValue({});

      // Mock du calcul des montants de tokens
      const mockCalculateTokenAmounts = vi.spyOn(liquidityManager as any, 'calculateTokenAmounts');
      mockCalculateTokenAmounts.mockResolvedValue({
        tokenA: { amount: 25, mint: 'USDC_MINT' },
        tokenB: { amount: 25, mint: 'PENGU_MINT' }
      });

      const result = await liquidityManager.openPosition(
        0,
        'pool-address-123',
        -1000,
        1000,
        50,
        100
      );

      expect(result.success).toBe(true);
      expect(result.positionId).toBeDefined();
      expect(result.signature).toBe('simulated-position-signature');
    });

    it('devrait échouer si le solde USDC est insuffisant', async () => {
      // Mock du solde USDC insuffisant
      const mockGetTokenBalance = vi.spyOn(liquidityManager as any, 'getTokenBalance');
      mockGetTokenBalance.mockResolvedValue(10); // Solde insuffisant

      const result = await liquidityManager.openPosition(
        0,
        'pool-address-123',
        -1000,
        1000,
        50,
        100
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Solde USDC insuffisant');
    });

    it('devrait échouer si les ticks sont invalides', async () => {
      // Mock du solde USDC suffisant
      const mockGetTokenBalance = vi.spyOn(liquidityManager as any, 'getTokenBalance');
      mockGetTokenBalance.mockResolvedValue(100);

      const result = await liquidityManager.openPosition(
        0,
        'pool-address-123',
        1000, // Tick inférieur supérieur au tick supérieur
        -1000,
        50,
        100
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Le tick inférieur doit être strictement inférieur au tick supérieur');
    });

    it('devrait gérer l\'allocation de capital', async () => {
      // Mock de la connexion Solana
      const mockConnection = (liquidityManager as any).connection;
      mockConnection.sendTransaction.mockResolvedValue('transactionSignature456');
      mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });

      // Mock des soldes
      const mockGetTokenBalance = vi.spyOn(liquidityManager as any, 'getTokenBalance');
      mockGetTokenBalance.mockResolvedValue(100);

      // Mock de la construction de transaction
      const mockBuildOpenPositionTransaction = vi.spyOn(liquidityManager as any, 'buildOpenPositionTransaction');
      mockBuildOpenPositionTransaction.mockResolvedValue({});

      const result = await liquidityManager.openPosition(
        0,
        'pool-address-123',
        -1000,
        1000,
        100, // 100 USDC
        50   // 50% d'allocation = 50 USDC
      );

      expect(result.success).toBe(true);
      expect(result.positionId).toBeDefined();
    });
  });

  describe('openPositionWithRange', () => {
    it('devrait ouvrir une position avec plage de prix automatique', async () => {
      // Mock de la connexion Solana
      const mockConnection = (liquidityManager as any).connection;
      mockConnection.sendTransaction.mockResolvedValue('transactionSignature789');
      mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });

      // Mock des soldes
      const mockGetTokenBalance = vi.spyOn(liquidityManager as any, 'getTokenBalance');
      mockGetTokenBalance.mockResolvedValue(100);

      // Mock de la construction de transaction
      const mockBuildOpenPositionTransaction = vi.spyOn(liquidityManager as any, 'buildOpenPositionTransaction');
      mockBuildOpenPositionTransaction.mockResolvedValue({});

      const result = await liquidityManager.openPositionWithRange(
        0,
        'pool-address-123',
        50,
        10, // 10% de plage
        100
      );

      expect(result.success).toBe(true);
      expect(result.positionId).toBeDefined();
      expect(result.ticks).toBeDefined();
      expect(result.ticks?.lower).toBeDefined();
      expect(result.ticks?.upper).toBeDefined();
    });

    it('devrait échouer si le prix du pool ne peut pas être récupéré', async () => {
      // Mock de getCurrentPrice qui retourne null
      const mockGetCurrentPrice = vi.spyOn(liquidityManager as any, 'getCurrentPrice');
      mockGetCurrentPrice.mockResolvedValue(null);

      const result = await liquidityManager.openPositionWithRange(
        0,
        'pool-address-123',
        50,
        10,
        100
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Impossible de récupérer le prix actuel du pool');
    });
  });

  describe('calculateOptimalTicks', () => {
    it('devrait calculer les ticks optimaux', async () => {
      // Mock de getPoolInfo
      const mockGetPoolInfo = vi.spyOn(liquidityManager, 'getPoolInfo');
      mockGetPoolInfo.mockResolvedValue({
        address: 'pool-address-123',
        whirlpoolsConfig: 'mock-config',
        whirlpoolBump: [0],
        tickSpacing: 64,
        tickSpacingSeed: [0],
        feeRate: 0.003,
        protocolFeeRate: 0.001,
        liquidity: '0',
        sqrtPrice: '0',
        tickCurrentIndex: 0,
        protocolFeeOwedA: '0',
        protocolFeeOwedB: '0',
        tokenMintA: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        tokenVaultA: 'mock-vault-a',
        tokenMintB: 'PENGU_ADDRESS_HERE',
        tokenVaultB: 'mock-vault-b',
        feeGrowthGlobalA: '0',
        feeGrowthGlobalB: '0',
        rewardInfos: [],
        rewardLastUpdatedTime: '0'
      });

      const result = await liquidityManager.calculateOptimalTicks(
        'pool-address-123',
        0.001, // Prix actuel
        10     // 10% de plage
      );

      expect(result.lowerTick).toBeDefined();
      expect(result.upperTick).toBeDefined();
      expect(result.lowerTick).toBeLessThan(result.upperTick);
    });

    it('devrait échouer si le pool n\'existe pas', async () => {
      // Mock de getPoolInfo qui retourne null
      const mockGetPoolInfo = vi.spyOn(liquidityManager, 'getPoolInfo');
      mockGetPoolInfo.mockResolvedValue(null);

      await expect(
        liquidityManager.calculateOptimalTicks('pool-address-123', 0.001, 10)
      ).rejects.toThrow('Pool non trouvé');
    });
  });

  describe('validateTicks', () => {
    it('devrait valider des ticks corrects', () => {
      const result = (liquidityManager as any).validateTicks(-1000, 1000);
      expect(result.valid).toBe(true);
    });

    it('devrait rejeter des ticks invalides (lower >= upper)', () => {
      const result = (liquidityManager as any).validateTicks(1000, -1000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Le tick inférieur doit être strictement inférieur au tick supérieur');
    });

    it('devrait rejeter des ticks avec une plage trop petite', () => {
      const result = (liquidityManager as any).validateTicks(0, 32);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('La plage de ticks doit être d\'au moins 64');
    });
  });

  describe('priceToTick', () => {
    it('devrait convertir un prix en tick', () => {
      const result = (liquidityManager as any).priceToTick(0.001, 64);
      expect(typeof result).toBe('number');
      expect(Math.abs(result % 64)).toBe(0); // Doit être un multiple du tick spacing
    });
  });

  describe('getTokenBalance', () => {
    it('devrait récupérer le solde d\'un token', async () => {
      // Mock de la connexion Solana
      const mockConnection = (liquidityManager as any).connection;
      mockConnection.getParsedTokenAccountsByOwner.mockResolvedValue({
        value: [{
          account: {
            data: {
              parsed: {
                info: {
                  tokenAmount: {
                    uiAmount: 5.5,
                  },
                },
              },
            },
          },
        }],
      });

      const balance = await (liquidityManager as any).getTokenBalance(
        'SolanaAddress123',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      );

      expect(balance).toBe(5.5);
    });

    it('devrait retourner 0 si aucun compte de token trouvé', async () => {
      // Mock de la connexion Solana
      const mockConnection = (liquidityManager as any).connection;
      mockConnection.getParsedTokenAccountsByOwner.mockResolvedValue({
        value: [],
      });

      const balance = await (liquidityManager as any).getTokenBalance(
        'SolanaAddress123',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      );

      expect(balance).toBe(0);
    });
  });

  describe('checkConnectivity', () => {
    it('devrait vérifier la connectivité', async () => {
      // Mock de la connexion Solana
      const mockConnection = (liquidityManager as any).connection;
      mockConnection.getVersion.mockResolvedValue({
        'solana-core': '1.16.0',
      });

      const result = await liquidityManager.checkConnectivity();

      expect(result).toBe(true);
    });

    it('devrait détecter les problèmes de connectivité', async () => {
      // Mock de la connexion Solana
      const mockConnection = (liquidityManager as any).connection;
      mockConnection.getVersion.mockRejectedValue(new Error('Connection failed'));

      const result = await liquidityManager.checkConnectivity();

      expect(result).toBe(false);
    });
  });
});
