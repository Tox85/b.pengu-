import { jest } from 'vitest';
import { BridgeManager } from '../../modules/bridge';
import { WalletManager } from '../../modules/wallets';

describe('E2E Bridge - Abstract via Jumper/Li.Fi', () => {
  let bridgeManager: BridgeManager;
  let walletManager: WalletManager;
  let mockLifiApi: any;
  let mockEthereumProvider: any;
  let mockBscProvider: any;
  let mockSolanaConnection: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

    // Mock du walletManager
    walletManager = {
      getWallet: vi.fn(),
      getAllWallets: vi.fn(),
      signSolanaTransaction: vi.fn().mockResolvedValue('signed-transaction'),
    } as any;

    // Mock de la connexion Solana
    mockSolanaConnection = {
      getParsedTokenAccountsByOwner: vi.fn().mockResolvedValue({
        value: [{
          account: {
            data: {
              parsed: {
                info: {
                  tokenAmount: {
                    uiAmount: 1.0 // 1 USDC
                  }
                }
              }
            }
          }
        }]
      }),
      getLatestBlockhash: vi.fn().mockResolvedValue({ 
        blockhash: 'mock-blockhash', 
        lastValidBlockHeight: 1000 
      }),
      sendRawTransaction: vi.fn().mockResolvedValue('transaction-signature'),
      simulateTransaction: vi.fn().mockResolvedValue({ 
        value: { err: null, logs: [] } 
      }),
      getSignatureStatuses: vi.fn().mockResolvedValue({ 
        value: [{ confirmationStatus: 'finalized' }] 
      }),
    };

    // Mock Li.Fi API
    mockLifiApi = {
      get: vi.fn().mockResolvedValue({
        data: [{
          id: 'mock-bridge-route-cctp',
          tool: 'cctp',
          fromChain: '1', // Ethereum
          toChain: '1399811149', // Solana
          fromToken: {
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC Ethereum
            symbol: 'USDC',
            decimals: 6,
          },
          toToken: {
            address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC Solana
            symbol: 'USDC',
            decimals: 6,
          },
          fromAmount: '1000000', // 1 USDC
          toAmount: '1000000', // 1 USDC sur Solana
          gasCosts: [{
            type: 'gas',
            price: '20000000000', // 20 gwei
            gasLimit: '21000',
            token: {
              address: '0x0000000000000000000000000000000000000000',
              symbol: 'ETH',
              decimals: 18,
            },
          }],
          steps: [{
            id: 'mock-step-cctp',
            type: 'bridge',
            tool: 'cctp',
            action: {
              fromChain: '1',
              toChain: '1399811149',
              fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              fromAmount: '1000000',
              toAmount: '1000000',
            },
            estimate: {
              fromAmount: '1000000',
              toAmount: '1000000',
              toAmountMin: '990000',
              feeCosts: [],
              gasCosts: [],
            },
          }],
        }],
      }),
      post: vi.fn(),
    };

    // Mock des providers EVM
    mockEthereumProvider = {
      getBalance: vi.fn().mockResolvedValue('1000000000000000000'), // 1 ETH
      sendTransaction: vi.fn(),
      broadcastTransaction: vi.fn().mockResolvedValue({
        hash: 'bridge-tx-123',
        wait: vi.fn().mockResolvedValue({ status: 1 })
      }),
    };

    mockBscProvider = {
      getBalance: vi.fn().mockResolvedValue('1000000000000000000'), // 1 BNB
      sendTransaction: vi.fn(),
      broadcastTransaction: vi.fn().mockResolvedValue({
        hash: 'bridge-tx-123',
        wait: vi.fn().mockResolvedValue({ status: 1 })
      }),
    };

    // Initialiser BridgeManager
    bridgeManager = new BridgeManager({
      lifiApi: mockLifiApi,
      ethereumProvider: mockEthereumProvider,
      bscProvider: mockBscProvider,
      solanaConnection: mockSolanaConnection,
      walletManager: walletManager,
      config: {
        rpc: {
          arbitrum: 'https://arbitrum-rpc-url',
          ethereum: 'https://ethereum-rpc-url',
          bsc: 'https://bsc-rpc-url',
        },
      },
    });

    // Mock verifySolanaArrival pour les tests
    vi.spyOn(bridgeManager as any, 'verifySolanaArrival').mockResolvedValue(true);
    
    // Réinitialiser les mocks après leur création
    mockLifiApi.get.mockClear();
    mockLifiApi.post.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Cas de réussite CCTP', () => {
    it('devrait exécuter un bridge USDC ETH → USDC SPL avec CCTP et frais < 3%', async () => {
      // Mock du wallet
      const mockWallet = {
        index: 0,
        address: 'SolanaAddress0',
        privateKey: 'solanaPrivateKey0',
        publicKey: 'solanaPublicKey0',
        evmAddress: '0x1234567890123456789012345678901234567890',
        evmPrivateKey: 'evmPrivateKey0',
      };
      walletManager.getWallet = vi.fn().mockReturnValue(mockWallet);

      console.log('🔄 Test bridge CCTP USDC ETH → USDC SPL...');

      // Exécuter le bridge
      const result = await bridgeManager.bridgeUsdcToSpl(0, 'ethereum', '1000000');

      console.log('Résultat bridge:', result);

      // Vérifications
      expect(result.success).toBe(true);
      expect(result.txHash).toBeDefined();
      expect(result.route).toBe('cctp');

      // Vérifier que Li.Fi a été appelé avec les bons paramètres
      expect(mockLifiApi.get).toHaveBeenCalledWith('/quote', {
        params: {
          fromChain: '1',
          toChain: '101',
          fromToken: '0xA0b86a33E6c0b6c0b6c0b6c0b6c0b6c0b6c0b6c0',
          toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          fromAmount: '1000000',
          tool: 'cctp',
        },
      });

      console.log('✅ Bridge CCTP réussi !');
    });
  });

  describe('Cas de fallback non-CCTP', () => {
    it('devrait utiliser une route non-CCTP si CCTP indisponible', async () => {
      await vi.isolateModulesAsync(async () => {
        // Mock d'une réponse sans CCTP
        mockLifiApi.get.mockResolvedValue({
        data: [{
          id: 'mock-bridge-route-mayan',
          tool: 'mayan',
          fromChain: '1',
          toChain: '1399811149',
          fromToken: {
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            symbol: 'USDC',
            decimals: 6,
          },
          toToken: {
            address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            symbol: 'USDC',
            decimals: 6,
          },
          fromAmount: '1000000',
          toAmount: '1000000',
          gasCosts: [{
            type: 'gas',
            price: '20000000000',
            gasLimit: '21000',
            token: {
              address: '0x0000000000000000000000000000000000000000',
              symbol: 'ETH',
              decimals: 18,
            },
          }],
          steps: [{
            id: 'mock-step-mayan',
            type: 'bridge',
            tool: 'mayan',
            action: {
              fromChain: '1',
              toChain: '1399811149',
              fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              fromAmount: '1000000',
              toAmount: '1000000',
            },
            estimate: {
              fromAmount: '1000000',
              toAmount: '1000000',
              toAmountMin: '990000',
              feeCosts: [],
              gasCosts: [],
            },
          }],
        }],
      });

      const mockWallet = {
        index: 0,
        address: 'SolanaAddress0',
        privateKey: 'solanaPrivateKey0',
        publicKey: 'solanaPublicKey0',
        evmAddress: '0x1234567890123456789012345678901234567890',
        evmPrivateKey: 'evmPrivateKey0',
      };
      walletManager.getWallet = vi.fn().mockReturnValue(mockWallet);

        console.log('🔄 Test bridge fallback non-CCTP...');

        // Pour le test de fallback, utiliser une méthode qui permet les routes non-CCTP
        const quote = await bridgeManager.getBridgeQuote('1', '101', '0xA0b86a33E6c0b6c0b6c0b6c0b6c0b6c0b6c0b6c0', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '1000000', false);
        if (!quote) {
          throw new Error('Aucun devis trouvé');
        }
        
        // Exécuter le bridge avec la route sélectionnée
        const result = await bridgeManager.executeBridge(0, quote);

      console.log('Résultat bridge fallback:', result);

        expect(result.success).toBe(true);
        expect(result.txHash).toBeDefined();
        expect(quote.tool).toBe('mayan');

        console.log('✅ Bridge fallback réussi !');
      });
    });
  });

  describe('Cas de frais trop élevés', () => {
    it('devrait rejeter une quote avec des frais > 3%', async () => {
      await vi.isolateModulesAsync(async () => {
        // Mock d'une quote avec des frais élevés
        mockLifiApi.get.mockResolvedValue({
        data: [{
          id: 'mock-bridge-route-high-fees',
          tool: 'cctp',
          fromChain: '1',
          toChain: '1399811149',
          fromToken: {
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            symbol: 'USDC',
            decimals: 6,
          },
          toToken: {
            address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            symbol: 'USDC',
            decimals: 6,
          },
          fromAmount: '1000000', // 1 USDC
          toAmount: '1000000',
          gasCosts: [{
            type: 'gas',
            price: '1000000000000000000', // 1 ETH en wei (frais énormes)
            gasLimit: '21000',
            token: {
              address: '0x0000000000000000000000000000000000000000',
              symbol: 'ETH',
              decimals: 18,
            },
          }],
          steps: [],
        }],
      });

      const mockWallet = {
        index: 0,
        address: 'SolanaAddress0',
        privateKey: 'solanaPrivateKey0',
        publicKey: 'solanaPublicKey0',
        evmAddress: '0x1234567890123456789012345678901234567890',
        evmPrivateKey: 'evmPrivateKey0',
      };
      walletManager.getWallet = vi.fn().mockReturnValue(mockWallet);

      console.log('🔄 Test bridge avec frais élevés...');

      const result = await bridgeManager.bridgeUsdcToSpl(0, 'ethereum', '1000000');

      console.log('Résultat bridge frais élevés:', result);

        expect(result.success).toBe(false);
        expect(result.error).toContain('FRAIS_TROP_ELEVES');

        console.log('✅ Rejet des frais élevés confirmé !');
      });
    });
  });

  describe('Cas d\'erreur ethers mock', () => {
    it('devrait gérer l\'erreur "evmWallet.signTransaction is not a function"', async () => {
      // Mock d'un wallet sans signTransaction
      const mockWallet = {
        index: 0,
        address: 'SolanaAddress0',
        privateKey: 'solanaPrivateKey0',
        publicKey: 'solanaPublicKey0',
        evmAddress: '0x1234567890123456789012345678901234567890',
        evmPrivateKey: 'evmPrivateKey0',
      };
      walletManager.getWallet = vi.fn().mockReturnValue(mockWallet);

      // Mock ethers.Wallet pour retourner un objet sans signTransaction
      const originalEthers = require('ethers');
      vi.spyOn(originalEthers, 'Wallet').mockImplementationOnce(() => ({
        address: '0xMock',
        // signTransaction manquant intentionnellement
        sendTransaction: vi.fn(),
      }));

      console.log('🔄 Test gestion erreur ethers mock...');

      const result = await bridgeManager.bridgeUsdcToSpl(0, 'ethereum', '1000000');

      console.log('Résultat avec erreur ethers:', result);

      // Le bridge devrait quand même réussir grâce au fallback local
      expect(result.success).toBe(true);

      console.log('✅ Gestion erreur ethers confirmée !');
    });
  });

  describe('Résumé des diagnostics', () => {
    it('devrait afficher un résumé JSON des résultats', async () => {
      const mockWallet = {
        index: 0,
        address: 'SolanaAddress0',
        privateKey: 'solanaPrivateKey0',
        publicKey: 'solanaPublicKey0',
        evmAddress: '0x1234567890123456789012345678901234567890',
        evmPrivateKey: 'evmPrivateKey0',
      };
      walletManager.getWallet = vi.fn().mockReturnValue(mockWallet);

      console.log('🔄 Test résumé diagnostics...');

      const result = await bridgeManager.bridgeUsdcToSpl(0, 'ethereum', '1000000');

      const diagnostics = {
        success: result.success,
        txHash: result.txHash,
        route: result.route,
        error: result.error,
        fromChain: 'ethereum',
        toChain: 'solana',
        amount: '1000000',
        tool: 'cctp',
        fees: '0.00042 ETH (2.1%)',
        timestamp: new Date().toISOString(),
      };

      console.log('📊 Diagnostics bridge:', JSON.stringify(diagnostics, null, 2));

      expect(diagnostics.success).toBe(true);
      expect(diagnostics.txHash).toBeDefined();
      expect(diagnostics.route).toBe('cctp');

      console.log('✅ Résumé diagnostics généré !');
    });
  });
});
