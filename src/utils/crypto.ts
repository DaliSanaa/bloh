import { createHash, randomBytes } from 'node:crypto';

/**
 * Computes a SHA-256 hex hash of the input string.
 * @param value - Value to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Generates a cryptographically secure random hex string.
 * @param byteLength - Number of random bytes
 * @returns Hex-encoded random string
 */
export function randomHex(byteLength: number): string {
  return randomBytes(byteLength).toString('hex');
}
