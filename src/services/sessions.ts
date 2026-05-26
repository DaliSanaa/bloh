import { getDb } from './database.js';
import { randomHex, sha256 } from '../utils/crypto.js';

const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'bloh_session';

/** Validated session user info. */
export interface SessionUser {
  id: string;
  email: string;
  plan: string;
  createdAt: string;
}

/**
 * Creates a new session for a user.
 * @param userId - User ID
 * @returns Raw session token for the cookie
 */
export function createSession(userId: string): string {
  const db = getDb();
  const token = randomHex(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();

  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
  ).run(tokenHash, userId, expiresAt);

  return token;
}

/**
 * Validates a session token and returns the associated user.
 * @param token - Raw session token from cookie
 * @returns User info or null if invalid/expired
 */
export function validateSession(token: string): SessionUser | null {
  const db = getDb();
  const tokenHash = sha256(token);
  const row = db.prepare(
    `SELECT u.id, u.email, u.plan, u.created_at, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
  ).get(tokenHash) as {
    id: string;
    email: string;
    plan: string;
    created_at: string;
    expires_at: string;
  } | undefined;

  if (!row) {
    return null;
  }

  if (new Date(row.expires_at) <= new Date()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    plan: row.plan,
    createdAt: row.created_at,
  };
}

/**
 * Deletes a session by token.
 * @param token - Raw session token
 */
export function deleteSession(token: string): void {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}
