import { randomUUID } from 'node:crypto';
import { getDb } from './database.js';
import { randomHex, sha256 } from '../utils/crypto.js';

const KEY_PREFIX = 'bloh_';
const KEY_HEX_LENGTH = 40;
const MAX_KEYS_PER_USER = 5;

/** Result of a successful API key validation. */
export interface ValidatedApiKey {
  valid: true;
  userId: string;
  plan: string;
  keyId: string;
  keyPrefix: string;
}

/** API key metadata returned to the user (never the full key). */
export interface ApiKeyRecord {
  id: string;
  keyPrefix: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

/**
 * Generates a new API key for a user and stores its hash.
 * @param userId - Owner user ID
 * @param name - Optional key name
 * @returns Full key (shown once) and prefix
 */
export function generateApiKey(
  userId: string,
  name: string = 'Default',
): { key: string; keyPrefix: string; id: string } {
  const db = getDb();
  const count = db.prepare(
    'SELECT COUNT(*) AS count FROM api_keys WHERE user_id = ? AND is_active = 1',
  ).get(userId) as { count: number };

  if (count.count >= MAX_KEYS_PER_USER) {
    throw new Error(`Maximum of ${MAX_KEYS_PER_USER} active API keys allowed`);
  }

  const id = randomUUID();
  const secret = randomHex(KEY_HEX_LENGTH / 2);
  const key = `${KEY_PREFIX}${secret}`;
  const keyPrefix = key.slice(0, KEY_PREFIX.length + 8);
  const keyHash = sha256(key);

  db.prepare(
    `INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, userId, keyHash, keyPrefix, name);

  return { key, keyPrefix, id };
}

/**
 * Validates an API key against the database.
 * @param key - Full API key from request header
 * @returns Validation result or null if invalid
 */
export function validateApiKey(key: string): ValidatedApiKey | null {
  if (!key.startsWith(KEY_PREFIX)) {
    return null;
  }

  const db = getDb();
  const keyHash = sha256(key);
  const row = db.prepare(
    `SELECT ak.id AS key_id, ak.key_prefix, ak.user_id, u.plan
     FROM api_keys ak
     JOIN users u ON u.id = ak.user_id
     WHERE ak.key_hash = ? AND ak.is_active = 1`,
  ).get(keyHash) as {
    key_id: string;
    key_prefix: string;
    user_id: string;
    plan: string;
  } | undefined;

  if (!row) {
    return null;
  }

  return {
    valid: true,
    userId: row.user_id,
    plan: row.plan,
    keyId: row.key_id,
    keyPrefix: row.key_prefix,
  };
}

/**
 * Lists all API keys for a user (prefix only).
 * @param userId - Owner user ID
 * @returns Array of key metadata
 */
export function listApiKeys(userId: string): ApiKeyRecord[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, key_prefix, name, is_active, created_at
     FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
  ).all(userId) as Array<{
    id: string;
    key_prefix: string;
    name: string;
    is_active: number;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    keyPrefix: row.key_prefix,
    name: row.name,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  }));
}

/**
 * Revokes an API key owned by a user.
 * @param keyId - API key ID
 * @param userId - Owner user ID
 * @returns True if a key was revoked
 */
export function revokeApiKey(keyId: string, userId: string): boolean {
  const db = getDb();
  const result = db.prepare(
    'UPDATE api_keys SET is_active = 0 WHERE id = ? AND user_id = ? AND is_active = 1',
  ).run(keyId, userId);
  return result.changes > 0;
}
