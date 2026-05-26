import { randomUUID } from 'node:crypto';
import { generateApiKey } from './api-keys.js';
import { getDb } from './database.js';
import {
  findUserByClerkId,
  findUserByEmail,
  linkClerkUserId,
} from './users.js';

/** Placeholder password hash for Clerk-only accounts. */
export const CLERK_PASSWORD_SENTINEL = '!clerk';

/** Result of syncing a Clerk user to the local database. */
export interface ClerkSyncResult {
  userId: string;
  isNewUser: boolean;
  apiKey?: string;
}

/** One-time API keys shown after Clerk signup, keyed by local user ID. */
const pendingWelcomeKeys = new Map<string, string>();

/**
 * Creates a local user linked to a Clerk account.
 * @param clerkUserId - Clerk user ID
 * @param email - Verified primary email
 * @returns Created local user ID
 */
function createClerkUser(clerkUserId: string, email: string): string {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    'INSERT INTO users (id, email, password_hash, clerk_user_id) VALUES (?, ?, ?, ?)',
  ).run(id, email.toLowerCase(), CLERK_PASSWORD_SENTINEL, clerkUserId);
  return id;
}

/**
 * Syncs a Clerk user to the local Bloh database.
 * @param clerkUserId - Clerk user ID
 * @param email - Verified primary email from Clerk
 * @returns Sync result with optional one-time API key for new users
 */
export function syncClerkUser(clerkUserId: string, email: string): ClerkSyncResult {
  const normalizedEmail = email.toLowerCase();
  const existingByClerk = findUserByClerkId(clerkUserId);

  if (existingByClerk) {
    return { userId: existingByClerk.id, isNewUser: false };
  }

  const existingByEmail = findUserByEmail(normalizedEmail);
  if (existingByEmail) {
    linkClerkUserId(existingByEmail.id, clerkUserId);
    return { userId: existingByEmail.id, isNewUser: false };
  }

  const userId = createClerkUser(clerkUserId, normalizedEmail);
  const { key } = generateApiKey(userId, 'Default');
  storePendingWelcomeKey(userId, key);

  return { userId, isNewUser: true, apiKey: key };
}

/**
 * Stores a one-time API key for display after Clerk signup.
 * @param userId - Local user ID
 * @param apiKey - Full API key
 */
export function storePendingWelcomeKey(userId: string, apiKey: string): void {
  pendingWelcomeKeys.set(userId, apiKey);
}

/**
 * Retrieves and clears a pending welcome API key.
 * @param userId - Local user ID
 * @returns API key or null
 */
export function consumePendingWelcomeKey(userId: string): string | null {
  const key = pendingWelcomeKeys.get(userId) ?? null;
  pendingWelcomeKeys.delete(userId);
  return key;
}
