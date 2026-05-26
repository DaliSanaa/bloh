import { getDb } from './database.js';

/** User record from the database. */
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  stripeCustomerId: string | null;
  plan: string;
  createdAt: string;
}

/**
 * Finds a user by Clerk user ID.
 * @param clerkUserId - Clerk user ID
 * @returns User record or null
 */
export function findUserByClerkId(clerkUserId: string): UserRecord | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, email, password_hash, stripe_customer_id, plan, created_at FROM users WHERE clerk_user_id = ?',
  ).get(clerkUserId) as {
    id: string;
    email: string;
    password_hash: string;
    stripe_customer_id: string | null;
    plan: string;
    created_at: string;
  } | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    stripeCustomerId: row.stripe_customer_id,
    plan: row.plan,
    createdAt: row.created_at,
  };
}

/**
 * Links a Clerk user ID to an existing local user.
 * @param userId - Local user ID
 * @param clerkUserId - Clerk user ID
 */
export function linkClerkUserId(userId: string, clerkUserId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE users SET clerk_user_id = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(clerkUserId, userId);
}

/**
 * Finds a user by email address.
 * @param email - User email
 * @returns User record or null
 */
export function findUserByEmail(email: string): UserRecord | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, email, password_hash, stripe_customer_id, plan, created_at FROM users WHERE email = ?',
  ).get(email.toLowerCase()) as {
    id: string;
    email: string;
    password_hash: string;
    stripe_customer_id: string | null;
    plan: string;
    created_at: string;
  } | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    stripeCustomerId: row.stripe_customer_id,
    plan: row.plan,
    createdAt: row.created_at,
  };
}

/**
 * Finds a user by ID.
 * @param userId - User ID
 * @returns User record or null
 */
export function findUserById(userId: string): UserRecord | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, email, password_hash, stripe_customer_id, plan, created_at FROM users WHERE id = ?',
  ).get(userId) as {
    id: string;
    email: string;
    password_hash: string;
    stripe_customer_id: string | null;
    plan: string;
    created_at: string;
  } | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    stripeCustomerId: row.stripe_customer_id,
    plan: row.plan,
    createdAt: row.created_at,
  };
}

/**
 * Finds a user by Stripe customer ID.
 * @param stripeCustomerId - Stripe customer ID
 * @returns User record or null
 */
export function findUserByStripeCustomerId(stripeCustomerId: string): UserRecord | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, email, password_hash, stripe_customer_id, plan, created_at FROM users WHERE stripe_customer_id = ?',
  ).get(stripeCustomerId) as {
    id: string;
    email: string;
    password_hash: string;
    stripe_customer_id: string | null;
    plan: string;
    created_at: string;
  } | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    stripeCustomerId: row.stripe_customer_id,
    plan: row.plan,
    createdAt: row.created_at,
  };
}

/**
 * Updates a user's subscription plan.
 * @param userId - User ID
 * @param plan - New plan name
 */
export function updateUserPlan(userId: string, plan: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE users SET plan = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(plan, userId);
}

/**
 * Sets the Stripe customer ID for a user.
 * @param userId - User ID
 * @param stripeCustomerId - Stripe customer ID
 */
export function setStripeCustomerId(userId: string, stripeCustomerId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE users SET stripe_customer_id = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(stripeCustomerId, userId);
}
