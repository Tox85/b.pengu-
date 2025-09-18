/**
 * Circuit Breaker pour gérer les pannes d'API
 */

export interface CircuitBreakerOptions {
  failureThreshold: number;
  openMs: number;
  halfOpenMaxCalls: number;
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenCalls: number = 0;
  private options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  /**
   * Vérifie si l'appel est autorisé
   */
  allow(): boolean {
    const now = Date.now();

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        if (now - this.lastFailureTime >= this.options.openMs) {
          this.state = CircuitBreakerState.HALF_OPEN;
          this.halfOpenCalls = 0;
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        if (this.halfOpenCalls < this.options.halfOpenMaxCalls) {
          this.halfOpenCalls++;
          return true;
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Enregistre un succès
   */
  onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitBreakerState.CLOSED;
  }

  /**
   * Enregistre un échec
   */
  onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
    }
  }

  /**
   * Obtient l'état actuel
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Obtient le nombre d'échecs
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Réinitialise le circuit breaker
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Obtient les statistiques
   */
  getStats(): {
    state: CircuitBreakerState;
    failureCount: number;
    halfOpenCalls: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      halfOpenCalls: this.halfOpenCalls,
      lastFailureTime: this.lastFailureTime,
    };
  }
}