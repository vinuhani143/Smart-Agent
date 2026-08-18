const inflight = new Map<string, Promise<unknown>>();

export interface OncePerKeyOptions {
  /** Keep a successful result so a rapid second tap reuses it. Failures are not cached. */
  settleMs?: number;
}

/**
 * Deduplicate concurrent identical mutations in this process.
 * Does not replace database constraints across multiple API instances.
 */
export async function oncePerKey<T>(
  key: string,
  operation: () => Promise<T>,
  options: OncePerKeyOptions = {},
): Promise<T> {
  const settleMs = options.settleMs ?? 2000;
  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const pending = operation().then(
    (value) => {
      if (settleMs <= 0) {
        inflight.delete(key);
      } else {
        const timer = setTimeout(() => {
          if (inflight.get(key) === pending) {
            inflight.delete(key);
          }
        }, settleMs);
        timer.unref?.();
      }
      return value;
    },
    (error: unknown) => {
      inflight.delete(key);
      throw error;
    },
  );
  inflight.set(key, pending);
  return pending as Promise<T>;
}
