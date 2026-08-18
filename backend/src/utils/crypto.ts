import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ConfigurationError } from '../types/errors';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

function keyFromHex(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new ConfigurationError(
      'TOKEN_ENCRYPTION_KEY is invalid. Generate one with: openssl rand -hex 32',
    );
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(plaintext: string, keyHex: string): string {
  const key = keyFromHex(keyHex);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(payload: string, keyHex: string): string {
  const key = keyFromHex(keyHex);
  const [ivPart, tagPart, dataPart] = payload.split('.');
  if (!ivPart || !tagPart || !dataPart) {
    throw new ConfigurationError('Stored token payload is corrupted.');
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomUrlToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function toPkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
