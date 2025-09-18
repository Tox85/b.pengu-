import { ethers } from 'ethers';
import { logger } from '../../logger';

export interface ERC20Config {
  rpcUrl: string;
  maxGasGwei: number;
  maxSpendUsdc: string;
  maxSpendEth: string;
  allowedTokens: string[];
  allowedSpenders: string[];
}

export class ERC20Service {
  private provider: ethers.JsonRpcProvider;
  private config: ERC20Config;

  constructor(config: ERC20Config) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  async getWallet(privateKey: string): Promise<ethers.Wallet> {
    return new ethers.Wallet(privateKey, this.provider);
  }

  async getBalance(wallet: ethers.Wallet, tokenAddress?: string): Promise<bigint> {
    if (!tokenAddress) {
      // Native ETH balance
      return await this.provider.getBalance(wallet.address);
    }

    // ERC20 token balance
    const contract = new ethers.Contract(
      tokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      wallet
    );

    return await contract.balanceOf(wallet.address);
  }

  async getAllowance(wallet: ethers.Wallet, tokenAddress: string, spender: string): Promise<bigint> {
    const contract = new ethers.Contract(
      tokenAddress,
      ['function allowance(address,address) view returns (uint256)'],
      wallet
    );

    return await contract.allowance(wallet.address, spender);
  }

  async approveIfNeeded(
    wallet: ethers.Wallet,
    tokenAddress: string,
    spender: string,
    amount: bigint
  ): Promise<boolean> {
    // Vérifier les allow-lists
    if (!this.config.allowedTokens.includes(tokenAddress.toLowerCase())) {
      throw new Error(`Token ${tokenAddress} not in allow-list`);
    }

    if (!this.config.allowedSpenders.includes(spender.toLowerCase())) {
      throw new Error(`Spender ${spender} not in allow-list`);
    }

    // Vérifier les caps
    if (tokenAddress.toLowerCase() === this.config.allowedTokens[0]) { // USDC
      const maxSpend = ethers.parseUnits(this.config.maxSpendUsdc, 6);
      if (amount > maxSpend) {
        throw new Error(`Amount ${ethers.formatUnits(amount, 6)} USDC exceeds max spend ${this.config.maxSpendUsdc}`);
      }
    }

    const currentAllowance = await this.getAllowance(wallet, tokenAddress, spender);
    
    if (currentAllowance >= amount) {
      logger.info(`Allowance sufficient: ${ethers.formatUnits(currentAllowance, 6)} >= ${ethers.formatUnits(amount, 6)}`);
      return false; // Pas besoin d'approve
    }

    // Approve narrow - exactement le montant nécessaire
    logger.info(`Approving exact amount ${ethers.formatUnits(amount, 6)} for ${spender}`);
    
    const contract = new ethers.Contract(
      tokenAddress,
      ['function approve(address,uint256) returns (bool)'],
      wallet
    );

    try {
      const tx = await contract.approve(spender, amount);
      logger.info(`Approval tx sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      logger.info(`Approval confirmed: ${receipt?.hash}`);

      return true; // Approve effectué
    } catch (error: any) {
      logger.error(`Approval failed: ${error.message}`);
      // En cas d'échec, révoquer immédiatement
      try {
        await this.revokeApproval(wallet, tokenAddress, spender);
        logger.info(`Approval revoked after failure`);
      } catch (revokeError: any) {
        logger.error(`Failed to revoke approval: ${revokeError.message}`);
      }
      throw error;
    }
  }

  async revokeApproval(wallet: ethers.Wallet, tokenAddress: string, spender: string): Promise<void> {
    logger.info(`Revoking approval for ${spender}`);
    
    const contract = new ethers.Contract(
      tokenAddress,
      ['function approve(address,uint256) returns (bool)'],
      wallet
    );

    const tx = await contract.approve(spender, 0);
    logger.info(`Revoke tx sent: ${tx.hash}`);
    
    const receipt = await tx.wait();
    logger.info(`Revoke confirmed: ${receipt?.hash}`);
  }

  async checkGasPrice(): Promise<boolean> {
    const feeData = await this.provider.getFeeData();
    const gasPriceGwei = Number(ethers.formatUnits(feeData.gasPrice || 0, 'gwei'));
    
    if (gasPriceGwei > this.config.maxGasGwei) {
      logger.warn(`Gas price ${gasPriceGwei} Gwei exceeds max ${this.config.maxGasGwei} Gwei`);
      return false;
    }

    return true;
  }

  async estimateGas(wallet: ethers.Wallet, tx: ethers.TransactionRequest): Promise<bigint> {
    return await this.provider.estimateGas({
      ...tx,
      from: wallet.address,
    });
  }

  async sendTransaction(
    wallet: ethers.Wallet,
    tx: ethers.TransactionRequest,
    confirmations: number = 1
  ): Promise<ethers.TransactionReceipt> {
    // Vérifier le gas price
    if (!(await this.checkGasPrice())) {
      throw new Error('Gas price too high');
    }

    // Estimer le gas
    const gasLimit = await this.estimateGas(wallet, tx);
    const feeData = await this.provider.getFeeData();

    // Forcer EIP-1559 avec caps
    const maxFeePerGas = ethers.parseUnits(this.config.maxGasGwei.toString(), 'gwei');
    const maxPriorityFeePerGas = ethers.parseUnits('2', 'gwei'); // 2 Gwei priority fee

    // Vérifier que l'estimation ne dépasse pas le cap
    if (feeData.gasPrice && feeData.gasPrice > maxFeePerGas) {
      throw new Error(`Gas price ${ethers.formatUnits(feeData.gasPrice, 'gwei')} Gwei exceeds max ${this.config.maxGasGwei} Gwei`);
    }

    const txWithGas = {
      ...tx,
      gasLimit: gasLimit * 120n / 100n, // +20% buffer
      maxFeePerGas,
      maxPriorityFeePerGas,
      type: 2, // EIP-1559
    };

    logger.info(`Sending EIP-1559 transaction: gasLimit=${txWithGas.gasLimit}, maxFeePerGas=${ethers.formatUnits(maxFeePerGas, 'gwei')} Gwei`);

    const txResponse = await wallet.sendTransaction(txWithGas);
    logger.info(`Transaction sent: ${txResponse.hash}`);

    const receipt = await txResponse.wait(confirmations);
    logger.info(`Transaction confirmed: ${receipt?.hash}`);

    return receipt!;
  }

  async getTokenInfo(tokenAddress: string): Promise<{ name: string; symbol: string; decimals: number }> {
    const contract = new ethers.Contract(
      tokenAddress,
      [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)'
      ],
      this.provider
    );

    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals()
    ]);

    return { name, symbol, decimals };
  }

  async formatTokenAmount(amount: bigint, tokenAddress?: string): Promise<string> {
    if (!tokenAddress) {
      return ethers.formatEther(amount);
    }

    const { decimals } = await this.getTokenInfo(tokenAddress);
    return ethers.formatUnits(amount, decimals);
  }
}

// Factory function
export function createERC20Service(config: Partial<ERC20Config> = {}): ERC20Service {
  const defaultConfig: ERC20Config = {
    rpcUrl: process.env.BASE_RPC_URL || '',
    maxGasGwei: parseInt(process.env.MAX_GAS_GWEI || '8'),
    maxSpendUsdc: process.env.MAX_SPEND_USDC || '1',
    maxSpendEth: process.env.MAX_SPEND_ETH || '0.005',
    allowedTokens: [
      process.env.BASE_USDC || '',
      process.env.BASE_WETH || '',
    ].filter(Boolean),
    allowedSpenders: [
      process.env.BASE_ROUTER_V2_OR_V3 || '',
    ].filter(Boolean),
  };

  return new ERC20Service({ ...defaultConfig, ...config });
}
