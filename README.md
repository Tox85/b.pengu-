# E2E Bridge & LP System

Un système complet de test end-to-end pour les ponts cross-chain et les pools de liquidité sur Solana.

## 🚀 Fonctionnalités

### 🌉 Bridge Cross-Chain
- **Li.Fi Integration** : Pont Base → Solana avec gestion EIP-1559
- **Approbations dynamiques** : Gestion automatique des approbations multiples
- **Retry intelligent** : Gestion des erreurs `REPLACEMENT_UNDERPRICED`
- **Polling robuste** : Suivi des transactions avec backoff exponentiel

### 🔄 Swap Token-Agnostique
- **Jupiter Integration** : Swaps USDC → WSOL/PENGU
- **Fallback multi-hop** : USDC → WSOL → PENGU si route directe échoue
- **Gestion WSOL** : Wrap/unwrap automatique des SOL
- **Slippage adaptatif** : Gestion des tolérances de slippage

### 🏊 Pools de Liquidité Orca
- **Whirlpools SDK** : Intégration complète avec Orca
- **TickArray Management** : Dérivation et initialisation automatique
- **Position NFT** : Création et gestion des positions concentrées
- **Range flexible** : Support des ranges ±15% configurables

### 🛡️ Sécurité & Monitoring
- **Caps de sécurité** : Limites sur les montants et frais
- **Mode DRY_RUN** : Simulation complète sans exécution
- **Logs détaillés** : Suivi complet des transactions
- **SQLite persistence** : Stockage des états de transaction

## 📁 Structure du Projet

```
├── scripts/                    # Scripts d'exécution
│   ├── bridge-lifi-live.js    # Bridge Li.Fi en mode LIVE
│   ├── bridge-lifi-dry.js     # Bridge Li.Fi en mode DRY_RUN
│   ├── jupiter-swap-live.js   # Swap Jupiter token-agnostique
│   ├── orca-lp-live-simple.js # LP Orca avec TickArrays
│   ├── wrap-sol.js            # Utilitaire wrap SOL → WSOL
│   └── e2e-swap-lp.js         # Séquence E2E complète
├── lib/orca/                  # Helpers Orca
│   └── helpers.js             # Fonctions utilitaires Orca
├── src/                       # Code source TypeScript
├── tests/                     # Tests unitaires et E2E
└── docs/                      # Documentation
```

## 🚀 Installation

```bash
# Cloner le projet
git clone https://github.com/toxlesion/b.pengu.git
cd b.pengu

# Installer les dépendances
npm install

# Configurer l'environnement
cp env.example .env
# Éditer .env avec vos clés et configurations
```

## ⚙️ Configuration

### Variables d'environnement requises

```bash
# RPC & Wallets
PRIVATE_KEY=0x...
SOLANA_KEYPAIR_PATH=./keypair.json
BASE_RPC_URL=https://mainnet.base.org
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Tokens
SOL_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
SOL_WSOL_MINT=So11111111111111111111111111111111111111112
SOL_PENGU_MINT=2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv

# Pools Orca
ORCA_USDC_WSOL_POOL=HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ
ORCA_WHIRLPOOL_PROGRAM=whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc

# Sécurité
MAX_SPEND_USDC=1.0
MAX_GAS_GWEI=5
SLIPPAGE_BPS=50
```

## 🎯 Utilisation

### Mode DRY_RUN (Simulation)

```bash
# Bridge Base → Solana
node scripts/bridge-lifi-dry.js

# Swap USDC → WSOL
node scripts/jupiter-swap-live.js --usdc=0.01 --wrap=false --dry-run

# LP Orca USDC/WSOL
node scripts/orca-lp-live-simple.js --usdc=0.005 --wsol=0.0005 --tick-range=15 --dry-run

# Séquence E2E complète
node scripts/e2e-swap-lp.js
```

### Mode LIVE (Exécution réelle)

```bash
# Bridge Base → Solana
node scripts/bridge-lifi-live.js

# Swap USDC → WSOL
node scripts/jupiter-swap-live.js --usdc=0.01 --wrap=false

# LP Orca USDC/WSOL
node scripts/orca-lp-live-simple.js --usdc=0.005 --wsol=0.0005 --tick-range=15
```

## 🔧 Scripts Disponibles

| Script | Description | Mode |
|--------|-------------|------|
| `bridge-lifi-live.js` | Bridge Li.Fi Base → Solana | LIVE |
| `bridge-lifi-dry.js` | Bridge Li.Fi Base → Solana | DRY_RUN |
| `jupiter-swap-live.js` | Swap Jupiter token-agnostique | LIVE/DRY_RUN |
| `orca-lp-live-simple.js` | LP Orca avec TickArrays | LIVE/DRY_RUN |
| `wrap-sol.js` | Wrap SOL → WSOL | LIVE |
| `e2e-swap-lp.js` | Séquence E2E complète | LIVE/DRY_RUN |

## 🧪 Tests

```bash
# Tests unitaires
npm run test

# Tests E2E
npm run test:e2e

# Tests d'intégration
npm run test:integration
```

## 📊 Exemples de Sortie

### Bridge Li.Fi Réussi
```
✅ Bridge Li.Fi LIVE réussi !
   From: Base (0x6D9dBe056A00b2CD3156dA90f8589E504F4a33D4)
   To: Solana (DXnHR9bo6TLwb95xQixLJExU69G584qCRuencMRdLfgE)
   Amount: 0.5 USDC
   Tx Hash: 0x1234...
   Status: DONE
```

### LP Orca Créé
```
✅ LP Orca LIVE réussi !
   Position NFT: 9AiX2RLEkXVFitQjfZ5Cy3vAToa53qcP2qgfqr9ahzKu
   Pool: HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ
   Ticks: -14144 à -13760
   Liquidity: 4000
   Tx Signature: 5jK8...
```

## 🛠️ Développement

### Structure des Helpers

```javascript
// lib/orca/helpers.js
const orcaHelpers = {
  resolvePool,              // Résolution du pool par mints
  calculateAlignedTicks,    // Calcul des ticks alignés
  getTickArrayPDAs,         // Dérivation des TickArrays
  ensureTickArray,          // Initialisation des TickArrays
  getLiquidityQuote,        // Quote de liquidité
  buildLiquidityInstructions, // Construction des instructions
  readPositionData          // Lecture des données de position
};
```

### Gestion des Erreurs

- **Retry automatique** : Gestion des erreurs temporaires
- **Fallbacks intelligents** : Routes alternatives en cas d'échec
- **Logs détaillés** : Suivi complet des erreurs
- **Caps de sécurité** : Protection contre les montants excessifs

## 📈 Roadmap

- [ ] Support de nouveaux tokens (PENGU, etc.)
- [ ] Interface web pour monitoring
- [ ] Tests de charge et performance
- [ ] Documentation API complète
- [ ] Intégration CI/CD

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 👥 Auteurs

- **Amine** - *Développement initial* - [toxlesion@gmail.com](mailto:toxlesion@gmail.com)

## 🙏 Remerciements

- [Li.Fi](https://li.fi/) pour l'API de bridge
- [Jupiter](https://jup.ag/) pour l'API de swap
- [Orca](https://orca.so/) pour le SDK Whirlpools
- [Solana](https://solana.com/) pour l'infrastructure blockchain