# Bot Multi-Wallet PENGU

Un bot sophistiqué pour gérer 100 wallets dérivés d'une mnemonic, effectuer des retraits aléatoires via Bybit, utiliser Li.Fi pour brider vers Solana, trader du PENGU via Jupiter, fournir de la liquidité concentrée via Orca, et surveiller/rééquilibrer les balances automatiquement.

## 🚀 Fonctionnalités

- **Gestion Multi-Wallet**: 100 wallets dérivés d'une mnemonic BIP-44
- **Retraits Automatiques**: Retraits aléatoires depuis Bybit et Binance
- **Bridge Cross-Chain**: Bridge USDT vers Solana via Li.Fi
- **Trading Automatique**: Swaps PENGU/USDC via Jupiter
- **Liquidité Concentrée**: Positions LP sur Orca Whirlpools
- **Monitoring Intelligent**: Surveillance et rééquilibrage automatique
- **Recharge Automatique**: Recharge depuis les exchanges si nécessaire

## 📋 Prérequis

- Node.js 18+
- TypeScript
- Mnemonic BIP-39 (12 ou 24 mots)
- Clés API Bybit et Binance
- Clé API Li.Fi (optionnelle)
- RPC endpoints (Ethereum, BSC, Solana)

## 🛠️ Installation

1. **Cloner le projet**
```bash
git clone <repository-url>
cd b.pengu
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configuration**
```bash
cp env.example .env
# Éditer .env avec vos clés API et configuration
```

4. **Compiler TypeScript**
```bash
npm run build
```

## ⚙️ Configuration

Copiez `env.example` vers `.env` et configurez les variables suivantes :

### Variables Obligatoires
```env
# Mnemonic pour dériver les wallets
MNEMONIC=your twelve or twenty four word mnemonic phrase here

# Clés API des exchanges
BYBIT_API_KEY=your_bybit_api_key
BYBIT_SECRET=your_bybit_secret
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET=your_binance_secret

# RPC Endpoints
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your_key
BSC_RPC_URL=https://bsc-dataseed.binance.org/
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

### Variables Optionnelles
```env
# Configuration des montants
MIN_WITHDRAWAL_AMOUNT=0.001
MAX_WITHDRAWAL_AMOUNT=0.01
DEFAULT_SLIPPAGE_BPS=300

# Configuration de la liquidité
LP_LOWER_PCT=10
LP_UPPER_PCT=10
LP_POSITION_SIZE_USDC=100

# Configuration du monitoring
MONITOR_INTERVAL_MS=60000
REBALANCE_THRESHOLD_PCT=5
RECHARGE_THRESHOLD_USDC=50
```

## 🚀 Utilisation

### Démarrage du Bot
```bash
# Mode développement
npm run dev

# Mode production
npm run build
npm start
```

### Tests
```bash
# Tests unitaires
npm test

# Tests avec couverture
npm run test:coverage

# Test des modules
npx ts-node src/test.ts
```

## 📁 Architecture

```
src/
├── config.ts          # Configuration et validation
├── logger.ts          # Système de logging
├── types.ts           # Types TypeScript
├── main.ts            # Point d'entrée principal
└── test.ts            # Script de test

modules/
├── wallets.ts         # Gestion des wallets
├── exchanges.ts       # Intégration Bybit/Binance
├── bridge.ts          # Bridge Li.Fi
├── trading.ts         # Trading Jupiter
├── liquidity.ts       # Liquidité Orca
└── monitor.ts         # Monitoring et rééquilibrage

tests/
└── *.test.ts          # Tests unitaires
```

## 🔧 Modules

### 1. Wallets (`modules/wallets.ts`)
- Dérivation de 100 wallets à partir d'une mnemonic
- Gestion des signatures EVM et Solana
- Récupération des balances
- Recharge automatique de SOL

### 2. Exchanges (`modules/exchanges.ts`)
- Intégration Bybit et Binance via ccxt
- Retraits aléatoires avec limites
- Vérification des balances
- Historique des retraits

### 3. Bridge (`modules/bridge.ts`)
- Bridge USDT BSC/Ethereum → Solana via Li.Fi
- Vérification de l'arrivée des fonds
- Support multi-chaînes

### 4. Trading (`modules/trading.ts`)
- Swaps PENGU/USDC via Jupiter
- Gestion du slippage
- Récupération des prix
- Statistiques de trading

### 5. Liquidity (`modules/liquidity.ts`)
- Positions de liquidité concentrée Orca
- Ajout/retrait de liquidité
- Collecte des frais
- Vérification des fourchettes

### 6. Monitor (`modules/monitor.ts`)
- Surveillance continue des balances
- Rééquilibrage automatique
- Recharge depuis les exchanges
- Métriques et alertes

## 📊 Monitoring

Le bot fournit des métriques détaillées :
- Nombre de wallets actifs
- Balances totales (SOL, USDC, PENGU)
- Positions de liquidité actives
- Frais collectés
- Volume de trading
- Temps de fonctionnement

## ⚠️ Sécurité

- **Jamais** commiter les clés API ou mnemonic
- Utiliser des montants faibles pour les tests
- Vérifier les adresses de destination
- Surveiller les logs régulièrement
- Sauvegarder la mnemonic en sécurité

## 🐛 Dépannage

### Erreurs Communes

1. **"Mnemonic invalide"**
   - Vérifier que la mnemonic est correcte
   - S'assurer qu'elle est en anglais

2. **"Balance insuffisante"**
   - Vérifier les balances sur les exchanges
   - Ajuster les montants de retrait

3. **"Transaction échouée"**
   - Vérifier les frais de gas
   - S'assurer d'avoir suffisamment de SOL

4. **"Pool non trouvé"**
   - Vérifier l'ID du pool PENGU/USDC
   - Mettre à jour les constantes

### Logs

Les logs sont disponibles dans :
- Console (mode développement)
- Fichier `logs/bot.log` (mode production)
- Niveaux : error, warn, info, debug

## 📈 Performance

- **Latence**: < 1s pour les opérations simples
- **Throughput**: 10 wallets par minute (configurable)
- **Mémoire**: ~100MB pour 100 wallets
- **CPU**: Faible utilisation en mode monitoring

## 🔄 Mises à Jour

Pour mettre à jour le bot :
```bash
git pull
npm install
npm run build
npm start
```

## 📝 Changelog

### v1.0.0
- Implémentation initiale
- Support 100 wallets
- Intégration Bybit/Binance
- Bridge Li.Fi
- Trading Jupiter
- Liquidité Orca
- Monitoring automatique

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature
3. Commiter les changements
4. Pousser vers la branche
5. Ouvrir une Pull Request

## 📄 Licence

MIT License - voir le fichier LICENSE pour plus de détails.

## ⚠️ Avertissement

Ce bot est fourni à des fins éducatives. L'utilisation en production est à vos propres risques. Les cryptomonnaies sont volatiles et peuvent entraîner des pertes financières.

## 📞 Support

Pour le support technique :
- Ouvrir une issue sur GitHub
- Consulter la documentation
- Vérifier les logs d'erreur

---

**Développé avec ❤️ pour la communauté PENGU**
