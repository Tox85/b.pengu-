# Tests E2E Bridge + Solana + LP

Ce document décrit l'implémentation des tests E2E pour le bridge Base→Solana avec swap Jupiter et LP Orca.

## 🏗️ Architecture

### Services Implémentés

- **`src/services/bridge/lifi.ts`** - Service Li.Fi pour le bridge cross-chain
- **`src/services/solana/jupiter.ts`** - Service Jupiter pour les swaps Solana
- **`src/services/solana/orca.ts`** - Service Orca pour les LP (Whirlpools)
- **`src/services/evm/erc20.ts`** - Utilitaires EVM (approvals, balances)
- **`src/lib/sql.ts`** - Persistance SQLite pour les jobs E2E

### Scripts

- **`scripts/e2e-bridge-solana.ts`** - Orchestrateur principal E2E
- **`scripts/base-only-lp.ts`** - Test LP sur Base uniquement

### Tests

- **`tests/e2e.bridge.dry.spec.ts`** - Tests dry-run du bridge
- **`tests/e2e.solana.swap-lp.dry.spec.ts`** - Tests dry-run Jupiter + Orca
- **`tests/e2e.full.live.spec.ts`** - Tests live complets (micro-montants)

## 🚀 Utilisation

### 1. Configuration

Copiez et configurez le fichier `.env` :

```bash
cp env.example .env
```

Remplissez les variables requises :

```env
# Wallet & RPC
PRIVATE_KEY=your_private_key_here
BASE_RPC_URL=https://mainnet.base.org
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Montants & caps
DRY_RUN=true
MAX_SPEND_USDC=1
MAX_SPEND_ETH=0.005
SLIPPAGE_BPS=50
MAX_GAS_GWEI=8

# Tokens
BASE_USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
SOL_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
SOL_PENGU_MINT=2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv

# Bridge
LIFI_API_KEY=your_lifi_api_key

# Orca (optionnel)
ORCA_USDC_PENGU_POOL=your_pool_address
ORCA_USDC_WSOL_POOL=fallback_pool_address

# Solana Compute Budget
SOL_COMPUTE_UNITS=1200000
SOL_MICRO_LAMPORTS=1000
```

### 2. Préparer le Wallet Solana

#### Option A: Keypair JSON (recommandé)
```bash
# Générer un nouveau keypair
solana-keygen new --outfile ~/.config/solana/keypair.json

# Ajouter au .env
SOLANA_KEYPAIR_PATH=~/.config/solana/keypair.json
```

#### Option B: Clé privée Base64
```bash
# Exporter la clé privée en base64
solana-keygen pubkey --keypair ~/.config/solana/keypair.json --outfile /dev/stdout | base64

# Ajouter au .env
SOLANA_PRIVATE_KEY_B64=your_base64_private_key_here
```

#### Déposer des fonds
```bash
# Déposer 0.02-0.05 SOL sur le wallet Solana
# Les ATA USDC/PENGU seront créés automatiquement à la première transaction
```

### 3. Installation des Dépendances

```bash
npm install
```

### 4. Tests Dry-Run

```bash
# Test LP sur Base uniquement
npm run lp:base:dry

# Test bridge complet (dry-run)
npm run e2e:bridge:dry

# Tests unitaires
npm run test:e2e:bridge
npm run test:e2e:solana
```

### 5. Tests Live (Micro-Montants)

⚠️ **ATTENTION** : Les tests live utilisent de vrais tokens. Assurez-vous d'avoir des montants suffisants.

```bash
# Test LP sur Base (live)
npm run lp:base:live

# Test bridge complet (live)
npm run e2e:bridge:live

# Test live complet
npm run test:e2e:live
```

## 📋 Séquence E2E

### Mode Dry-Run

1. **Vérifications préliminaires** - Balances, gas price, caps
2. **Bridge Base→Solana** - Simulation de la route Li.Fi
3. **Swap USDC→PENGU** - Simulation Jupiter
4. **LP USDC/PENGU** - Simulation Orca Whirlpools
5. **Withdraw partiel** - Simulation retrait 10%
6. **Re-bridge** - Simulation retour Base

### Mode Live

1. **Vérifications préliminaires** - Balances réelles, gas price
2. **Bridge Base→Solana** - Transaction réelle via Li.Fi
3. **Swap USDC→PENGU** - Transaction réelle via Jupiter
4. **LP USDC/PENGU** - Transaction réelle via Orca
5. **Withdraw partiel** - Transaction réelle de retrait
6. **Re-bridge** - Transaction réelle de retour

## 🔧 Configuration Avancée

### Variables d'Environnement

| Variable | Description | Défaut |
|----------|-------------|---------|
| `DRY_RUN` | Mode simulation | `true` |
| `MAX_SPEND_USDC` | Cap USDC (dollars) | `1` |
| `MAX_SPEND_ETH` | Cap ETH | `0.005` |
| `SLIPPAGE_BPS` | Slippage en BPS | `50` |
| `MAX_GAS_GWEI` | Limite gas price | `8` |
| `CONFIRMATIONS` | Confirmations requises | `2` |
| `TIMEOUT_MS` | Timeout polling | `1800000` |

### Garde-fous

- **Caps de dépense** : Limites strictes sur USDC et ETH
- **Gas price** : Vérification avant chaque transaction
- **Slippage** : Contrôle des pertes de slippage
- **Timeouts** : Limites de temps pour le polling
- **Approvals** : Révocation automatique en cas d'échec

## 📊 Persistance

Les jobs E2E sont persistés dans SQLite (`./data/e2e.db`) :

```sql
CREATE TABLE e2e_jobs (
  id TEXT PRIMARY KEY,
  srcTxHash TEXT,
  destTxHash TEXT,
  status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  step TEXT,
  createdAt INTEGER,
  updatedAt INTEGER,
  metadata TEXT
);
```

## 🐛 Débogage

### Logs

Les logs utilisent Pino avec différents niveaux :

```bash
# Logs détaillés
LOG_LEVEL=debug npm run e2e:bridge:dry

# Logs minimaux
LOG_LEVEL=warn npm run e2e:bridge:live
```

### Base de Données

```bash
# Voir les jobs
sqlite3 ./data/e2e.db "SELECT * FROM e2e_jobs ORDER BY createdAt DESC;"

# Voir les jobs en échec
sqlite3 ./data/e2e.db "SELECT * FROM e2e_jobs WHERE status = 'failed';"
```

## ⚠️ Limitations

1. **Pool Orca** : Nécessite un pool USDC/PENGU existant ou fallback USDC/WSOL
2. **Montants** : Micro-montants uniquement pour les tests
3. **Réseaux** : Base et Solana mainnet uniquement
4. **Tokens** : USDC et PENGU uniquement

## 🔄 Roadmap

- [ ] Support d'autres bridges (Jumper, Stargate)
- [ ] Support d'autres DEX Solana (Raydium, Orca V2)
- [ ] Support d'autres chaînes (Ethereum, Arbitrum)
- [ ] Interface web pour monitoring
- [ ] Alertes en cas d'échec
- [ ] Métriques de performance

## 📞 Support

En cas de problème :

1. Vérifiez les logs détaillés
2. Consultez la base de données SQLite
3. Vérifiez les balances et caps
4. Testez d'abord en mode dry-run
