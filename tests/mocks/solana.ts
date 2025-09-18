import { jest } from 'vitest';

export const createMockSolana = () => {
  const mockConnection = {
    // @ts-ignore
    sendTransaction: vi.fn().mockResolvedValue('txSignature123'),
    // @ts-ignore
    confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    // @ts-ignore
    getParsedTokenAccountsByOwner: vi.fn().mockResolvedValue({
      value: [{
        account: { 
          data: { 
            parsed: { 
              info: { 
                tokenAmount: { uiAmount: 100 },
                mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
              } 
            } 
          } 
        }
      }]
    }),
    // @ts-ignore
    getVersion: vi.fn().mockResolvedValue({ 'solana-core': '1.16.0' }),
  };

  const mockTransaction = {
    add: vi.fn(),
  };

  const mockPublicKey = vi.fn().mockImplementation((address) => ({
    toString: () => address,
  }));

  const mockVersionedTransaction = vi.fn();

  return {
    Connection: vi.fn(() => mockConnection),
    Transaction: vi.fn(() => mockTransaction),
    PublicKey: mockPublicKey,
    VersionedTransaction: mockVersionedTransaction,
  };
};
