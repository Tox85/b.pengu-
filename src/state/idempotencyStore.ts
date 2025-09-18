/**
 * Store d'idempotence pour éviter les opérations dupliquées
 */

export interface IdempotencyStore {
  get(key: string): Promise<any>;
  set(key: string, value: any, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface IdempotencyEntry {
  value: any;
  expiresAt: number;
}

/**
 * Store d'idempotence en mémoire
 */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private store: Map<string, IdempotencyEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Nettoyer les entrées expirées toutes les 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  async get(key: string): Promise<any> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    // Vérifier si l'entrée a expiré
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: any, ttlMs: number): Promise<void> {
    const entry: IdempotencyEntry = {
      value,
      expiresAt: Date.now() + ttlMs,
    };
    this.store.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Détruit le store et nettoie les ressources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

/**
 * Store d'idempotence factice pour les tests
 */
export class NoOpIdempotencyStore implements IdempotencyStore {
  async get(_key: string): Promise<any> {
    return null;
  }

  async set(_key: string, _value: any, _ttlMs: number): Promise<void> {
    // No-op
  }

  async delete(_key: string): Promise<void> {
    // No-op
  }

  async clear(): Promise<void> {
    // No-op
  }
}

/**
 * Crée un store d'idempotence
 */
export function createIdempotencyStore(): IdempotencyStore {
  if (process.env.NODE_ENV === 'test') {
    return new NoOpIdempotencyStore();
  }
  return new MemoryIdempotencyStore();
}

/**
 * Génère une clé d'idempotence
 */
export function generateIdempotencyKey(
  currency: string,
  amount: string,
  address: string,
  network: string
): string {
  return `withdraw_${currency}_${amount}_${address}_${network}`;
}