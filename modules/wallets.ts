import * as bip39 from 'bip39';
import { ethers } from 'ethers';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { HDNodeWallet } from 'ethers';
import { config } from '../src/config/env';
import { logger, walletLogger } from '../src/logger';
import { Wallet, WalletBalance } from '../src/types';
import { TOKEN_ADDRESSES } from '../src/types';

type WalletDeps = {
  solanaConn?: Connection;
  evmProvider?: ethers.Provider;
};

export class WalletManager {
  private wallets: Wallet[] = [];
  private connection: Connection;
  private evmProvider: ethers.Provider;

  constructor(deps: WalletDeps = {}) {
    this.connection = deps.solanaConn ?? new Connection(config.rpc.solana, 'confirmed');
    this.evmProvider = deps.evmProvider ?? new ethers.JsonRpcProvider(config.rpc.ethereum);
    this.initializeWallets();
  }

  /**
   * Initialise les 100 wallets à partir de la mnemonic
   */
  private initializeWallets(): void {
    try {
      if (!bip39.validateMnemonic(config.mnemonic)) {
        throw new Error('Mnemonic invalide');
      }

      walletLogger.info('Initialisation des wallets...');
      
      for (let i = 0; i < config.bot.totalWallets; i++) {
        const wallet = this.deriveWallet(i);
        this.wallets.push(wallet);
      }

      walletLogger.info(`✅ ${this.wallets.length} wallets initialisés avec succès`);
    } catch (error) {
      logger.error('Erreur lors de l\'initialisation des wallets:', error);
      throw error;
    }
  }

  /**
   * Dérive un wallet à partir de l'index
   */
  private deriveWallet(index: number): Wallet {
    try {
      // Dérivation pour Solana (BIP-44: m/44'/501'/i'/0')
      const solanaPath = `m/44'/501'/${index}'/0'`;
      const solanaSeed = bip39.mnemonicToSeedSync(config.mnemonic, solanaPath);
      const solanaKeypair = Keypair.fromSeed(solanaSeed.slice(0, 32));
      console.log('solanaKeypair:', solanaKeypair);
      
      // Dérivation pour EVM (BIP-44: m/44'/60'/i'/0/0)
      const evmPath = `m/44'/60'/${index}'/0/0`;
      const evmWallet = HDNodeWallet.fromPhrase(config.mnemonic, evmPath);

      return {
        index,
        address: solanaKeypair.publicKey.toBase58(),
        privateKey: Buffer.from(solanaKeypair.secretKey).toString('base64'),
        publicKey: solanaKeypair.publicKey.toBase58(),
        evmAddress: evmWallet.address,
        evmPrivateKey: evmWallet.privateKey,
      };
    } catch (error) {
      logger.error(`Erreur lors de la dérivation du wallet ${index}:`, error);
      throw error;
    }
  }

  /**
   * Récupère un wallet par son index
   */
  getWallet(index: number): Wallet | undefined {
    return this.wallets[index];
  }

  /**
   * Récupère tous les wallets
   */
  getAllWallets(): Wallet[] {
    return [...this.wallets];
  }

  /**
   * Récupère un wallet aléatoire
   */
  getRandomWallet(): Wallet {
    const randomIndex = Math.floor(Math.random() * this.wallets.length);
    const wallet = this.wallets[randomIndex];
    if (!wallet) {
      throw new Error('Aucun wallet disponible');
    }
    return wallet;
  }

  /**
   * Récupère les balances d'un wallet
   */
  async getWalletBalance(walletIndex: number): Promise<WalletBalance> {
    const wallet = this.getWallet(walletIndex);
    if (!wallet) {
      throw new Error(`Wallet ${walletIndex} non trouvé`);
    }

    try {
      const [solBalance, usdcBalance, penguBalance] = await Promise.all([
        this.getSolBalance(wallet.address),
        this.getTokenBalance(wallet.address, TOKEN_ADDRESSES.USDC),
        this.getTokenBalance(wallet.address, TOKEN_ADDRESSES.PENGU),
      ]);

      return {
        walletIndex,
        address: wallet.address,
        sol: solBalance,
        usdc: usdcBalance,
        pengu: penguBalance,
        lastUpdated: new Date(),
      };
    } catch (error) {
      walletLogger.error(`Erreur lors de la récupération des balances du wallet ${walletIndex}:`, error);
      throw error;
    }
  }

  /**
   * Récupère la balance SOL d'une adresse
   */
  async getSolBalance(address: string): Promise<number> {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);
      return balance / 1e9; // Convertir de lamports en SOL
    } catch (error) {
      walletLogger.error(`Erreur lors de la récupération de la balance SOL pour ${address}:`, error);
      return 0;
    }
  }

  /**
   * Récupère la balance d'un token SPL
   */
  async getTokenBalance(address: string, mintAddress: string): Promise<number> {
    try {
      const publicKey = new PublicKey(address);
      const mint = new PublicKey(mintAddress);
      
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(publicKey, {
        mint: mint,
      });

      if (tokenAccounts.value.length === 0) {
        return 0;
      }

      const tokenAccount = tokenAccounts.value[0];
      if (!tokenAccount) {
        return 0;
      }
      
      const amount = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
      return amount || 0;
    } catch (error) {
      walletLogger.error(`Erreur lors de la récupération de la balance du token ${mintAddress} pour ${address}:`, error);
      return 0;
    }
  }

  /**
   * Récupère les balances de tous les wallets
   */
  async getAllBalances(): Promise<WalletBalance[]> {
    const balances: WalletBalance[] = [];
    
    for (let i = 0; i < this.wallets.length; i++) {
      try {
        const balance = await this.getWalletBalance(i);
        balances.push(balance);
      } catch (error) {
        walletLogger.error(`Erreur lors de la récupération des balances du wallet ${i}:`, error);
        // Continuer avec les autres wallets même en cas d'erreur
      }
    }

    return balances;
  }

  /**
   * Recharge un wallet avec des SOL (pour les frais de transaction)
   */
  async requestAirdrop(walletIndex: number, amount: number = 0.01): Promise<string> {
    const wallet = this.getWallet(walletIndex);
    if (!wallet) {
      throw new Error(`Wallet ${walletIndex} non trouvé`);
    }

    try {
      const publicKey = new PublicKey(wallet.address);
      const signature = await this.connection.requestAirdrop(publicKey, amount * 1e9);
      
      // Attendre la confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      walletLogger.info(`Airdrop de ${amount} SOL effectué pour le wallet ${walletIndex}: ${signature}`);
      return signature;
    } catch (error) {
      walletLogger.error(`Erreur lors de l'airdrop pour le wallet ${walletIndex}:`, error);
      throw error;
    }
  }

  /**
   * Signe une transaction Solana
   */
  async signSolanaTransaction(walletIndex: number, transaction: Transaction): Promise<Transaction> {
    const wallet = this.getWallet(walletIndex);
    if (!wallet) {
      throw new Error(`Wallet ${walletIndex} non trouvé`);
    }

    try {
      const keypair = Keypair.fromSecretKey(Buffer.from(wallet.privateKey, 'base64'));
      transaction.sign(keypair);
      return transaction;
    } catch (error) {
      walletLogger.error(`Erreur lors de la signature de la transaction pour le wallet ${walletIndex}:`, error);
      throw error;
    }
  }

  /**
   * Signe une transaction EVM
   */
  async signEvmTransaction(walletIndex: number, transaction: ethers.TransactionRequest): Promise<string> {
    const wallet = this.getWallet(walletIndex);
    if (!wallet) {
      throw new Error(`Wallet ${walletIndex} non trouvé`);
    }

    try {
      const evmWallet = new ethers.Wallet(wallet.evmPrivateKey, this.evmProvider);
      const signedTx = await evmWallet.signTransaction(transaction);
      return signedTx;
    } catch (error) {
      walletLogger.error(`Erreur lors de la signature de la transaction EVM pour le wallet ${walletIndex}:`, error);
      throw error;
    }
  }

  /**
   * Vérifie si un wallet a suffisamment de SOL pour les frais
   */
  async hasEnoughSol(walletIndex: number, minAmount: number = config.amounts.minSolBalance): Promise<boolean> {
    const wallet = this.wallets[walletIndex];
    if (!wallet) {
      return false;
    }
    
    const balance = await this.getSolBalance(wallet.address);
    return balance >= minAmount;
  }

  /**
   * Récupère les wallets avec des balances insuffisantes
   */
  async getWalletsWithLowBalance(): Promise<number[]> {
    const lowBalanceWallets: number[] = [];
    
    for (let i = 0; i < this.wallets.length; i++) {
      const hasEnoughSol = await this.hasEnoughSol(i);
      if (!hasEnoughSol) {
        lowBalanceWallets.push(i);
      }
    }

    return lowBalanceWallets;
  }

  /**
   * Récupère les statistiques des wallets
   */
  async getWalletStats(): Promise<{
    totalWallets: number;
    activeWallets: number;
    totalSolBalance: number;
    totalUsdcBalance: number;
    totalPenguBalance: number;
    lowBalanceWallets: number;
  }> {
    const balances = await this.getAllBalances();
    const lowBalanceWallets = await this.getWalletsWithLowBalance();

    const stats = balances.reduce(
      (acc, balance) => ({
        totalWallets: acc.totalWallets + 1,
        activeWallets: acc.activeWallets + (balance.sol > 0 || balance.usdc > 0 || balance.pengu > 0 ? 1 : 0),
        totalSolBalance: acc.totalSolBalance + balance.sol,
        totalUsdcBalance: acc.totalUsdcBalance + balance.usdc,
        totalPenguBalance: acc.totalPenguBalance + balance.pengu,
        lowBalanceWallets: lowBalanceWallets.length,
      }),
      {
        totalWallets: 0,
        activeWallets: 0,
        totalSolBalance: 0,
        totalUsdcBalance: 0,
        totalPenguBalance: 0,
        lowBalanceWallets: 0,
      }
    );

    return stats;
  }
}

// Export d'une instance singleton
export const walletManager = new WalletManager();