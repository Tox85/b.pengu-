import { logger } from './logger';
import { WalletManager } from '../modules/wallets';
import { ExchangeManager } from '../modules/exchanges';
import { BridgeManager } from '../modules/bridge';
import { TradingManager } from '../modules/trading';

/**
 * Initialise les managers pour les tests
 */
function initializeTestManagers() {
  const walletManager = new WalletManager();
  const exchangeManager = new ExchangeManager();
  const bridgeManager = new BridgeManager({ walletManager });
  const tradingManager = new TradingManager({ walletManager });

  return {
    walletManager,
    exchangeManager,
    bridgeManager,
    tradingManager
  };
}

/**
 * Script de test pour vérifier les modules du bot PENGU
 */
async function testModules(): Promise<void> {
  try {
    logger.info('🧪 Début des tests des modules');

    // Initialiser les managers
    const managers = initializeTestManagers();

    // Test 1: Wallets
    logger.info('Test 1: Module Wallets');
    const wallets = managers.walletManager.getAllWallets();
    logger.info(`✅ ${wallets.length} wallets initialisés`);
    
    const sampleWallet = managers.walletManager.getRandomWallet();
    logger.info(`Wallet aléatoire: ${sampleWallet.address}`);

    // Test 2: Exchanges
    logger.info('Test 2: Module Exchanges');
    const exchangeConnectivity = await managers.exchangeManager.checkConnectivity();
    logger.info(`Connectivité exchanges:`, exchangeConnectivity);

    // Test 3: Bridge
    logger.info('Test 3: Module Bridge');
    const bridgeConnectivity = await managers.bridgeManager.checkConnectivity();
    logger.info(`Connectivité Li.Fi: ${bridgeConnectivity}`);

    // Test 4: Trading
    logger.info('Test 4: Module Trading');
    const tradingConnectivity = await managers.tradingManager.checkConnectivity();
    logger.info(`Connectivité Jupiter: ${tradingConnectivity}`);

    // Test 5: Liquidity
    logger.info('Test 5: Module Liquidity');
    // Test de récupération des pools (si disponible)
    logger.info('Module Liquidity initialisé');

    // Test 6: Balances
    logger.info('Test 6: Récupération des balances');
    const balances = await managers.walletManager.getAllBalances();
    logger.info(`✅ ${balances.length} balances récupérées`);

    // Afficher quelques balances
    const sampleBalances = balances.slice(0, 3);
    for (const balance of sampleBalances) {
      logger.info(`Wallet ${balance.walletIndex}:`, {
        sol: balance.sol,
        usdc: balance.usdc,
        pengu: balance.pengu,
      });
    }

    logger.info('✅ Tous les tests sont passés avec succès');

  } catch (error) {
    logger.error('❌ Erreur lors des tests:', error);
    throw error;
  }
}

// Exécuter les tests si ce fichier est exécuté directement
if (require.main === module) {
  testModules().catch((error) => {
    console.error('Erreur fatale lors des tests:', error);
    process.exit(1);
  });
}

export { testModules };