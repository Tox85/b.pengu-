# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

## [Unreleased] — Simulation RPC & SIGN_ONLY Mode (2025-09-18)

### Added
- **Simulation RPC complète** : Support `SIGN_ONLY=true` pour simulation sans broadcast
  - `rpcSimulators.ts` : Simulateurs Solana/EVM pour transactions signées
  - `simulateSolanaTransaction()` : Simulation via `simulateTransaction` avec units consommées
  - `simulateEvmTx()` : Simulation via `estimateGas` et `eth_call` avec gas estimates
  - `validateSimulationResult()` : Validation des résultats avec warnings/thresholds
  - Integration dans `BridgeManager`, `TradingManager`, `LiquidityManager`
  - Script `scripts/test-signonly-simple.js` pour validation des simulateurs
- **Flag SIGN_ONLY** : Nouveau flag de configuration dans `src/config.ts`
  - `SIGN_ONLY=false` par défaut (production)
  - `SIGN_ONLY=true` pour validation sans broadcast
  - Logs spécifiques : `[bridge][SIM]`, `[trading][SIM]`, `[liquidity][SIM]`
- **Tests unitaires** : `tests/simulation.signonly.test.ts` pour validation complète

### Changed
- **BridgeManager** : Mode SIGN_ONLY avec simulation RPC et retour `simulated: true`
- **TradingManager** : Mode SIGN_ONLY avec simulation RPC pour swaps USDC↔PENGU
- **LiquidityManager** : Mode SIGN_ONLY avec simulation RPC pour positions LP
- **Scripts** : `start-simulation.js` inclut maintenant `SIGN_ONLY=true`

## [Previous] — Simulation Mode & Cleanup (2025-09-17)

### Added
- **Mode Simulation** : Support complet pour `DRY_RUN=true` et `ENABLE_CEX=false`
  - `NoOpExchangeManager` : Implémentation factice des exchanges quand `ENABLE_CEX=false`
  - `LifiSimConnector` : Simulateur Li.Fi pour `DRY_RUN=true` (routes simulées, tool='cctp', feePct=1.2%)
  - `JupiterSimConnector` : Simulateur Jupiter pour `DRY_RUN=true` (quotes simulés, transactions factices)
  - Script `npm run start:simulation` pour tests en mode simulation
  - Gardes `amount > 0` dans toutes les méthodes de trading/bridge
  - Logs spécifiques : `[exchange][INFO] CEX disabled (NoOp)`, `[trading][WARN] skip quote (amount=0)`

### Changed
- **Séquence principale** : Évite les appels CEX quand `ENABLE_CEX=false`
- **Monitoring** : Pas d'alertes de connectivité en `DRY_RUN=true`
- **Bridge/Trading** : Utilisation automatique des simulateurs en `DRY_RUN=true`

### Fixed
- Aucun appel API externe en mode simulation
- Pas de double initialisation des wallets
- Tous les E2E restent verts (149/149 tests passent)

## [Previous] — Cleanup & Stabilization (2025-09-17)

### Added
- Exchange Orchestrator sous feature flag (désactivé par défaut) : retry (expo + jitter), circuit-breaker, idempotency store.
- Tests de garde contre legacy/imports interdits.
- Docs : `docs/RUNBOOK.md`, `docs/LEGACY_MAP.md`.

### Changed
- Isolation Jest (isolateModules, reset/clear/restores).
- Tolérance de parsing (routes Li.Fi/Jumper `{data.routes}` ou `{routes}`).

### Fixed
- Frais de bridge (normalisation wei/native vs USDC) + message spécifique `FRAIS_TROP_ELEVES`.
- Mocks EVM/Solana/Jupiter stables en E2E.
- Suites `smoke` et `exchanges.integration` désormais vertes.
- **Stabilization — Phase finale réussie** : Tous les tests E2E et de monitoring sont maintenant verts.

### Feature Flags (defaults)
- ENABLE_EX_ORCHESTRATOR = false
- ENABLE_IDEMPOTENCY = false
- ENABLE_CIRCUIT_BREAKER = false
- WITHDRAW_MAX_RETRIES = 3, RETRY_BASE_MS = 200, RETRY_MAX_MS = 1500, CB_FAIL_THRESHOLD = 5, CB_OPEN_MS = 10000

### Test Status (Final)
- **Test Suites: 24 passed, 0 failed, 24 total** ✅
- **Tests: 149 passed, 0 failed, 149 total** ✅
- **Suites réparées** :
  - `tests/e2e/trading.pengu.test.ts` : 6 tests ✅
  - `tests/e2e/liquidity.pengu.test.ts` : 5 tests ✅
  - `tests/e2e/flow.abs.test.ts` : 3 tests ✅
  - `tests/monitor.test.ts` : 13 tests ✅
  - `tests/monitoring.e2e.test.ts` : 7 tests ✅
- **Aucune régression** sur les suites déjà vertes (smoke, exchanges.integration, e2e.test, e2e/flow.test, e2e/bridge.abs.test)
- **Build TypeScript** : ✅ 
  - tests/e2e/flow.abs.test.ts
  - tests/e2e/trading.pengu.test.ts
  - tests/e2e/liquidity.pengu.test.ts

### Notes de migration
- Les modules sous `src/__legacy__/` et `tests/legacy/` sont en **quarantaine**. Leur import est interdit (test de garde + ESLint).
- Activer progressivement l'orchestrateur : voir `docs/RUNBOOK.md`.
