# RUNBOOK — PENGU Bot

## 1) Vue d'ensemble
Le bot exécute : retraits CEX → bridge (Jumper/Li.Fi, prior CCTP) → swap (Jupiter) → LP concentrée.  
La robustesse retraits est assurée par l'**Exchange Orchestrator** (retry, circuit-breaker, idempotency).

## 2) Activation progressive (feature flags)
### Phase A — Tests locaux
```bash
ENABLE_EX_ORCHESTRATOR=true npm test -i
```
**Objectif :** 100% vert sur smoke et exchanges.integration.

### Phase B — Pré-production (canary 1 wallet)
```bash
ENABLE_EX_ORCHESTRATOR=true ENABLE_IDEMPOTENCY=true npm start
```
**Vérifier les journaux (voir §4).**

**Métriques :** taux de retry < 10%, CB non ouvert, 0 double-retrait.

### Phase C — Production
```bash
ENABLE_EX_ORCHESTRATOR=true ENABLE_IDEMPOTENCY=true ENABLE_CIRCUIT_BREAKER=true npm start
```
**Surveiller :** retraits en erreur déterministe, ouverture CB, délais retries.

## 3) Rollback

Désactiver instantanément l'orchestrateur :
```bash
ENABLE_EX_ORCHESTRATOR=false npm start
```

Si nécessaire, couper aussi idempotency/circuit breaker :
```bash
ENABLE_IDEMPOTENCY=false ENABLE_CIRCUIT_BREAKER=false npm start
```

## 4) Logs & Monitoring

### Format
Logs JSON niveau DEBUG=exchange:* :
```json
{
  "ts":"2025-09-17T20:12:03.111Z",
  "layer":"orchestrator",
  "exchange":"bybit",
  "symbol":"USDC",
  "amount":50,
  "network":"ETH",
  "idempotencyKey":"<hash>",
  "attempt":2,
  "result":"RETRY",
  "errorCode":"RATE_LIMIT"
}
```

**Champs clés :** layer, exchange, result (SUCCESS|RETRY|FALLBACK|FAIL), errorCode, attempt, cbOpen, latencyMs.

### Interprétation rapide
- **RATE_LIMIT / NETWORK** → retriable (surveillance taux de retry).
- **MIN_WITHDRAWAL / INSUFFICIENT_BALANCE / ADDRESS_NOT_WHITELISTED / KYC_REQUIRED** → déterministe (pas de retry).
- **cbOpen=true** → circuit-breaker actif (basculer fallback ou attendre fenêtre d'ouverture).

## 5) Playbooks d'incident

### CB ouvert (primary)
Vérifier disponibilité; si incident prolongé → forcer fallback (config) + surveiller latence.

### Retries épuisés (transitoire)
Augmenter WITHDRAW_MAX_RETRIES de 3→4 temporairement et/ou RETRY_MAX_MS; restaurer ensuite.

### Frais trop élevés (bridge)
Confirmer prix gas/quote; si structurel → relever FEE_THRESHOLD (test only) ou attendre fenêtre favorable.

### KYC/Whitelist
Vérifier état KYC CEX et whitelists d'adresses; corriger avant relance.

### Doubles retraits
Vérifier store d'idempotency (clé stable), purger entrées expirées.

## 6) Variables d'environnement (valeurs par défaut)

| Variable | Défaut | Description |
|----------|--------|-------------|
| ENABLE_EX_ORCHESTRATOR | false | Active l'Exchange Orchestrator |
| ENABLE_IDEMPOTENCY | false | Active le store d'idempotence |
| ENABLE_CIRCUIT_BREAKER | false | Active le circuit-breaker |
| WITHDRAW_MAX_RETRIES | 3 | Retries max pour un retrait |
| RETRY_BASE_MS | 200 | Backoff initial (ms) |
| RETRY_MAX_MS | 1500 | Backoff max (ms) |
| CB_FAIL_THRESHOLD | 5 | Échecs avant ouverture CB |
| CB_OPEN_MS | 10000 | Durée d'ouverture CB |

## 7) Simulation RPC — Mode SIGN_ONLY

### Vue d'ensemble
Le mode `SIGN_ONLY=true` permet de simuler les transactions sans les broadcaster sur la blockchain. 
Cela permet de valider la construction des transactions et d'estimer les coûts sans frais réels.

### Activation
```bash
# Mode simulation complet
DRY_RUN=true SIGN_ONLY=true npm run start:simulation

# Test des simulateurs RPC uniquement
node scripts/test-signonly-simple.js
```

### Logs de simulation
```
[bridge][SIM] SIGN_ONLY mode - simulating transaction
[bridge][SIM] sign-only simulation result: { success: true, details: {...} }
[trading][SIM] SIGN_ONLY mode - simulating swap transaction  
[liquidity][SIM] SIGN_ONLY mode - simulating position opening
```

### Interprétation des résultats
- **Solana** : `unitsConsumed` (compute units), `logs` (exécution), `err` (erreurs)
- **EVM** : `gasEstimate` (gas estimé), `willRevert` (transaction échouerait)
- **Validation** : `success` (simulation réussie), `warnings` (seuils dépassés)

### Seuils et avertissements
- **Units Solana** : > 200k units → avertissement haute consommation
- **Gas EVM** : > 500k gas → avertissement transaction coûteuse  
- **Simulation failed** : transaction échouerait en production

### Cas d'usage
1. **Validation avant production** : Vérifier que les transactions se construisent correctement
2. **Estimation des coûts** : Calculer les frais de gas/units avant exécution
3. **Tests de charge** : Simuler de nombreuses transactions sans coût
4. **Debug** : Identifier les problèmes de construction de transaction

## 8) Glossaire

- **Idempotency :** empêche d'émettre deux fois le même retrait (clé stable).
- **Circuit-breaker :** bloque les appels après N échecs successifs.
- **CCTP :** route Circle pour USDC cross-chain.
- **SIGN_ONLY :** mode simulation RPC sans broadcast blockchain.
- **DRY_RUN :** mode simulation complet sans appels API externes.
