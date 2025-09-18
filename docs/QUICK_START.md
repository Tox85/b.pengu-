# 🚀 Guide de Démarrage Rapide - Bot PENGU

## 📋 **Prérequis**

- Node.js 18+
- Un wallet avec quelques USDC (pour les tests réels)
- Clés API Li.Fi et Jupiter (optionnelles pour DRY-RUN)

## ⚡ **Démarrage en 3 étapes**

### 1️⃣ **Configuration**

Copiez le fichier d'exemple et configurez vos variables :

```bash
cp env.example .env
```

Éditez `.env` avec vos valeurs :

```bash
# ===== Seed =====
WALLET_MNEMONIC="votre phrase mnémonique de 12/24 mots"

# ===== APIs (optionnel pour DRY-RUN) =====
LIFI_API_KEY=your_lifi_api_key
JUPITER_API_KEY=your_jupiter_api_key

# ===== RPC (optionnel, utilise les valeurs par défaut) =====
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your_key
```

### 2️⃣ **Build**

```bash
npm run build
```

### 3️⃣ **Lancement**

#### 🧪 **Mode DRY-RUN (recommandé pour commencer)**

Simule les transactions sans les envoyer :

```bash
npm run start:dry-run
```

#### 💰 **Mode micro-montants (vraies transactions)**

⚠️ **Assurez-vous d'avoir des fonds sur wallet[0]**

```bash
npm run start:micro
```

## 📊 **Ce que vous verrez**

### Mode DRY-RUN
```
🚀 Lancement du bot PENGU en mode DRY-RUN
📋 Configuration:
  - ENABLE_CEX=false (pas d'APIs CEX)
  - DRY_RUN=true (simulation uniquement)
  - Montants réduits pour tests

[INFO] Bot démarré en mode DRY-RUN
[INFO] Wallet[0] balance: 0 USDC (simulé)
[INFO] Bridge quote: 10 USDC → 9.97 USDC (frais: 0.3%)
[INFO] Swap quote: 9.97 USDC → 1000 PENGU (slippage: 0.1%)
[INFO] LP position: 1000 PENGU dans range 10% (simulé)
```

### Mode micro-montants
```
🚀 Lancement du bot PENGU en mode micro-montants
📋 Configuration:
  - ENABLE_CEX=false (pas d'APIs CEX)
  - DRY_RUN=false (vraies transactions)
  - Montants réduits pour tests
  - ⚠️  Assurez-vous d'avoir des fonds sur wallet[0]

[INFO] Bot démarré en mode micro-montants
[INFO] Wallet[0] balance: 50 USDC
[INFO] Bridge tx: 0x123...abc (frais: 0.3%)
[INFO] Swap tx: 0x456...def (slippage: 0.1%)
[INFO] LP tx: 0x789...ghi (position: 1000 PENGU)
```

## 🔧 **Configuration Avancée**

### Variables importantes

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `ENABLE_CEX` | Activer les APIs CEX | `false` |
| `DRY_RUN` | Mode simulation | `false` |
| `MIN_USDC_BALANCE` | Balance USDC minimum | `2` |
| `LP_POSITION_SIZE_USDC` | Taille position LP | `5` |
| `FEE_THRESHOLD_PCT` | Seuil de frais max | `3` |
| `ALLOWED_SLIPPAGE_BPS` | Slippage max (bps) | `300` |

### Modes de fonctionnement

1. **DRY-RUN** : Simulation complète, pas de transactions
2. **Micro-montants** : Vraies transactions avec petits montants
3. **Production** : Montants normaux (nécessite APIs CEX)

## 🚨 **Dépannage**

### Erreur "Balance insuffisante"
- Vérifiez que wallet[0] a des fonds
- Ajustez `MIN_USDC_BALANCE` si nécessaire

### Erreur "Frais trop élevés"
- Ajustez `FEE_THRESHOLD_PCT` (ex: 5 pour 5%)
- Vérifiez la congestion réseau

### Erreur "Slippage trop élevé"
- Ajustez `ALLOWED_SLIPPAGE_BPS` (ex: 500 pour 5%)
- Vérifiez la liquidité du marché

## 📚 **Documentation Complète**

- `docs/RUNBOOK.md` : Guide opérationnel détaillé
- `docs/LEGACY_MAP.md` : Inventaire des fichiers legacy
- `CHANGELOG.md` : Historique des changements

## 🆘 **Support**

En cas de problème :
1. Vérifiez les logs JSON détaillés
2. Consultez `docs/RUNBOOK.md`
3. Vérifiez la configuration dans `.env`
