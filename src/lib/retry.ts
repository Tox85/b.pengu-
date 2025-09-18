/**
 * Module de retry avec backoff exponentiel
 */

export interface RetryOptions {
  tries: number;
  baseMs: number;
  maxMs: number;
  isRetryable: (error: Error) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
}

/**
 * Exécute une fonction avec retry et backoff exponentiel
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<RetryResult<T>> {
  let lastError: Error;
  const { tries, baseMs, maxMs, isRetryable } = options;

  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = error as Error;

      // Si ce n'est pas la dernière tentative et que l'erreur est retryable
      if (attempt < tries - 1 && isRetryable(lastError)) {
        // Calculer le délai avec backoff exponentiel
        const delay = Math.min(baseMs * Math.pow(2, attempt), maxMs);
        const jitter = Math.random() * 100; // Ajouter de la variance
        const totalDelay = delay + jitter;

        await new Promise(resolve => setTimeout(resolve, totalDelay));
        continue;
      }

      // Si c'est la dernière tentative ou que l'erreur n'est pas retryable
      break;
    }
  }

  return {
    success: false,
    error: lastError!,
    attempts: tries,
  };
}

/**
 * Retry avec délai fixe
 */
export async function retryFixed<T>(
  fn: () => Promise<T>,
  options: Omit<RetryOptions, 'baseMs' | 'maxMs'> & { delayMs: number }
): Promise<RetryResult<T>> {
  const { delayMs } = options;
  return retry(fn, {
    ...options,
    baseMs: delayMs,
    maxMs: delayMs,
  });
}

/**
 * Retry avec délai linéaire
 */
export async function retryLinear<T>(
  fn: () => Promise<T>,
  options: Omit<RetryOptions, 'baseMs' | 'maxMs'> & { delayMs: number }
): Promise<RetryResult<T>> {
  const { delayMs } = options;
  return retry(fn, {
    ...options,
    baseMs: delayMs,
    maxMs: delayMs,
  });
}