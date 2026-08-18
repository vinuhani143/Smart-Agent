import { getEnv } from '../config/env';
import { decryptSecret, encryptSecret } from '../utils/crypto';

/**
 * AES-256-GCM encryption for provider tokens and short-lived OAuth secrets.
 * Uses TOKEN_ENCRYPTION_KEY (32-byte key as 64 hex characters).
 * This is real authenticated encryption — not a placeholder cipher.
 */
export const TokenEncryptionService = {
  encrypt(plaintext: string): string {
    return encryptSecret(plaintext, getEnv().TOKEN_ENCRYPTION_KEY);
  },

  decrypt(payload: string): string {
    return decryptSecret(payload, getEnv().TOKEN_ENCRYPTION_KEY);
  },

  /**
   * Decrypt ciphertext, or return the original value when it is not in the
   * iv.tag.data format (legacy short-lived OAuth PKCE verifiers).
   */
  decryptOrPlain(payload: string): string {
    const parts = payload.split('.');
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
      return payload;
    }
    try {
      return decryptSecret(payload, getEnv().TOKEN_ENCRYPTION_KEY);
    } catch {
      return payload;
    }
  },
};
