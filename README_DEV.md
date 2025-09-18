# 🐧 PENGU BOT - Guide de Développement

## 🚀 Configuration Rapide

### 1. Installation des dépendances
```bash
npm install
```

### 2. Configuration de l'environnement
```bash
cp env.example .env
# Éditer .env avec vos paramètres (voir section Configuration ci-dessous)
```

### 3. Lancement des tests
```bash
# Tests unitaires (avec mocks, sans CEX)
npm run test:unit

# Tests d'intégration (avec simulation RPC)
npm run test:int

# Tests E2E avec mode DRY_RUN (sans CEX)
npm run test:e2e-dry

# Tous les tests
npm run test:all
```

### 4. Lancement du bot
```bash
# Mode simulation complet (recommandé pour le développement)
npm run run-all:dry

# Mode normal (nécessite des clés API)
npm run run-all
```

## ⚙️ Configuration

### Variables d'environnement essentielles

```bash
# Core - Configuration de base
MNEMONIC="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
TOTAL_WALLETS=5

# Feature Flags - Contrôle des fonctionnalités
ENABLE_CEX=false           # Désactive les CEX pour les tests
DRY_RUN=true              # Mode simulation (pas de broadcast)
SIGN_ONLY=false           # Signe les transactions sans les envoyer
USE_SIMULATION_RPC=true   # Utilise les simulateurs RPC

# APIs (optionnelles en mode DRY_RUN)
LIFI_API_KEY=your_lifi_api_key
JUPITER_API_KEY=your_jupiter_api_key

# CEX (optionnelles si ENABLE_CEX=false)
BYBIT_API_KEY=your_bybit_api_key
BYBIT_SECRET=your_bybit_secret
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET=your_binance_secret

# RPC (utilisez des endpoints gratuits pour les tests)
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your_key
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## 🧪 Tests

### Types de tests disponibles

#### Tests Unitaires (`npm run test:unit`)
- **Objectif** : Tester chaque module individuellement
- **Mocks** : Tous les appels externes sont mockés
- **CEX** : Désactivés (ENABLE_CEX=false)
- **Durée** : ~30 secondes

#### Tests d'Intégration (`npm run test:int`)
- **Objectif** : Tester l'intégration entre modules
- **Simulation** : Utilise les simulateurs RPC
- **CEX** : Désactivés par défaut
- **Durée** : ~2 minutes

#### Tests E2E (`npm run test:e2e-dry`)
- **Objectif** : Tester le pipeline complet
- **Mode** : DRY_RUN=true (pas de broadcast)
- **CEX** : Désactivés (ENABLE_CEX=false)
- **Durée** : ~5 minutes

### Commandes de test spécifiques

```bash
# Tests avec coverage
npm run test:coverage

# Tests en mode watch
npm run test:watch

# Vérification du typage
npm run typecheck

# Linting (à implémenter)
npm run lint
```

## 🏗️ Architecture

### Structure des modules

```
src/
├── config/          # Configuration centralisée
├── errors.ts        # Gestion des erreurs
├── lib/            # Utilitaires (retry, circuitBreaker)
├── simulation/     # Simulateurs pour DRY_RUN/SIGN_ONLY
├── state/          # Gestion de l'état (idempotence)
└── exchanges/      # Clients et orchestrateurs CEX

modules/
├── wallets.ts      # Gestion HD des wallets (100 wallets)
├── exchanges.ts    # Interface CEX avec fallback
├── bridge.ts       # Bridge LI.FI avec simulateur
├── trading.ts      # Trading Jupiter avec simulateur
├── liquidity.ts    # Liquidité Orca (partiellement implémenté)
└── monitor.ts      # Monitoring et rééquilibrage
```

### Flags de fonctionnalités

#### ENABLE_CEX (true/false)
- **false** : Désactive tous les appels CEX, utilise NoOpExchangeManager
- **true** : Active Bybit/Binance avec fallback automatique

#### DRY_RUN (true/false)
- **true** : Mode simulation, aucune transaction n'est broadcastée
- **false** : Mode production, transactions réelles

#### SIGN_ONLY (true/false)
- **true** : Signe les transactions mais ne les envoie pas
- **false** : Mode normal

#### USE_SIMULATION_RPC (true/false)
- **true** : Utilise les simulateurs RPC internes
- **false** : Utilise les RPC réels

## 🔧 Développement

### Workflow recommandé

1. **Développement local**
   ```bash
   # Configuration pour le développement
   ENABLE_CEX=false
   DRY_RUN=true
   USE_SIMULATION_RPC=true
   
   # Lancer les tests
   npm run test:unit
   ```

2. **Tests d'intégration**
   ```bash
   # Tester sans CEX
   npm run test:e2e-dry
   
   # Tester avec CEX (nécessite des clés)
   ENABLE_CEX=true npm run test:e2e
   ```

3. **Déploiement**
   ```bash
   # Build
   npm run build
   
   # Vérifications
   npm run typecheck
   npm run lint
   ```

### Ajout de nouvelles fonctionnalités

1. **Créer les tests d'abord** (TDD)
2. **Implémenter avec des mocks**
3. **Ajouter des simulateurs si nécessaire**
4. **Tester en mode DRY_RUN**
5. **Tester en mode réel avec des micro-montants**

## 🐛 Debugging

### Logs structurés
```bash
# Niveaux de logs disponibles
LOG_LEVEL=debug    # Très verbeux
LOG_LEVEL=info     # Normal (défaut)
LOG_LEVEL=warn     # Avertissements seulement
LOG_LEVEL=error    # Erreurs seulement
```

### Variables de debugging
```bash
# Debugging spécifique par module
DEBUG=bridge,trading,liquidity

# Node debugging
NODE_ENV=development
```

### Outils utiles
```bash
# Vérifier les imports inutilisés
npx ts-prune

# Analyser les dépendances
npm ls --depth=0

# Vérifier la sécurité
npm audit
```

## 📊 Monitoring

### Métriques disponibles
- Nombre de wallets actifs
- Volume total traité
- Frais collectés
- Positions de liquidité actives
- Taux de succès des opérations

### Alertes
- Balances faibles
- Erreurs répétées
- Problèmes de connectivité
- Performances dégradées

## 🔒 Sécurité

### Bonnes pratiques
- ✅ Jamais de clés privées en dur
- ✅ Variables d'environnement pour les secrets
- ✅ Mode DRY_RUN par défaut
- ✅ Validation des montants
- ✅ Idempotence des opérations

### Tests de sécurité
```bash
# Vérifier qu'aucun secret n'est committé
git secrets --scan

# Audit des dépendances
npm audit --audit-level high
```

## 🚨 Dépannage

### Problèmes courants

#### Tests qui échouent
```bash
# Nettoyer et réinstaller
rm -rf node_modules package-lock.json
npm install

# Vérifier la configuration
cat .env | grep -E "(ENABLE_CEX|DRY_RUN)"
```

#### Erreurs de CEX en mode test
```bash
# S'assurer que CEX est désactivé
export ENABLE_CEX=false
npm run test:unit
```

#### Problèmes de simulation
```bash
# Vérifier les simulateurs
export DRY_RUN=true
export USE_SIMULATION_RPC=true
npm run test:e2e-dry
```

### Support
- Consulter `docs/RUNBOOK.md` pour les procédures opérationnelles
- Consulter `docs/LEGACY_MAP.md` pour l'historique des changements
- Ouvrir une issue GitHub pour les bugs
