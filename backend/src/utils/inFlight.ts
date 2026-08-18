const inflight = new Map<string, Promise<unknown>>();

/**
 * Deduplicate concurrent identical mutations in this process.
 * Does not replace database constraints across multiple API instances.
 */
export async function oncePerKey<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const pending = operation().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}
