import { jest } from 'vitest';

export const createMockAxios = () => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  
  const mockAxiosInstance = {
    get: mockGet,
    post: mockPost,
  };
  
  const mockAxios = {
    create: vi.fn(() => mockAxiosInstance),
  };
  
  return { mockAxios, mockAxiosInstance, mockGet, mockPost };
};

export const setupLiFiMocks = (mockGet: vi.Mock) => {
  (mockGet as any).mockResolvedValue({
    data: [{
      toAmount: '1000000',
      tool: 'cctp',
      gasCosts: [{ amount: '1000000000000000000', token: { symbol: 'ETH' } }],
    }]
  });
};

export const setupJupiterMocks = (mockGet: vi.Mock, mockPost: vi.Mock) => {
  (mockGet as any).mockResolvedValue({
    data: {
      outAmount: '1000000',
      priceImpactPct: '0.1',
      routePlan: [{ swapInfo: { ammKey: 'test' } }]
    }
  });
  
  (mockPost as any).mockResolvedValue({
    data: {
      swapTransaction: Buffer.from('test-transaction').toString('base64')
    }
  });
};
