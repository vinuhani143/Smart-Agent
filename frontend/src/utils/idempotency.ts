export function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Reuse one key while the same payload is in flight so double taps and retries do not duplicate. */
export function createIdempotencyGuard() {
  let current: { signature: string; key: string } | null = null;
  return {
    keyFor(payload: unknown): string {
      const signature = JSON.stringify(payload);
      if (current && current.signature === signature) {
        return current.key;
      }
      const key = newIdempotencyKey();
      current = { signature, key };
      return key;
    },
    reset(): void {
      current = null;
    },
  };
}
