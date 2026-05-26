import type { Plan } from '../types/index.js';
import { getDb } from './database.js';

/** Monthly credit limits per plan. */
export const PLAN_LIMITS: Record<Plan, number> = {
  free: 50,
  pro: 2000,
  max: 20000,
};

/** Result of a credit limit check. */
export interface LimitCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

/** Monthly usage summary entry. */
export interface UsageHistoryEntry {
  month: string;
  credits: number;
}

/**
 * Returns the UTC month start datetime string for SQL queries.
 * @returns ISO month start for current UTC month
 */
function currentMonthStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01 00:00:00`;
}

/**
 * Records a usage event for an API key.
 * @param keyId - API key ID
 * @param credits - Credits consumed
 * @param inputTokens - Input token count
 * @param documentType - Detected document type
 * @param processingTimeMs - Processing duration in milliseconds
 */
export function recordUsage(
  keyId: string,
  credits: number,
  inputTokens: number,
  documentType: string,
  processingTimeMs: number,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO usage (api_key_id, credits, input_tokens, document_type, processing_time_ms)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(keyId, credits, inputTokens, documentType, processingTimeMs);
}

/**
 * Returns total credits used by a key in the current UTC month.
 * @param keyId - API key ID
 * @returns Credits used this month
 */
export function getMonthlyUsage(keyId: string): number {
  const db = getDb();
  const row = db.prepare(
    `SELECT COALESCE(SUM(credits), 0) AS total
     FROM usage
     WHERE api_key_id = ? AND created_at >= ?`,
  ).get(keyId, currentMonthStart()) as { total: number };
  return row.total;
}

/**
 * Returns total credits used across all keys for a user this month.
 * @param userId - User ID
 * @returns Total credits used this month
 */
export function getUserMonthlyUsage(userId: string): number {
  const db = getDb();
  const row = db.prepare(
    `SELECT COALESCE(SUM(u.credits), 0) AS total
     FROM usage u
     JOIN api_keys ak ON ak.id = u.api_key_id
     WHERE ak.user_id = ? AND u.created_at >= ?`,
  ).get(userId, currentMonthStart()) as { total: number };
  return row.total;
}

/**
 * Checks whether a user has remaining credits for the current month.
 * @param userId - User ID
 * @param plan - User plan
 * @returns Limit check result
 */
export function checkLimit(userId: string, plan: string): LimitCheckResult {
  const planKey = plan === 'business' ? 'max' : plan;
  const normalizedPlan = (planKey in PLAN_LIMITS ? planKey : 'free') as Plan;
  const limit = PLAN_LIMITS[normalizedPlan];
  const used = getUserMonthlyUsage(userId);
  const remaining = Math.max(0, limit - used);

  return {
    allowed: used < limit,
    used,
    limit,
    remaining,
  };
}

/**
 * Returns monthly credit usage history for a user.
 * @param userId - User ID
 * @param months - Number of months to include
 * @returns Monthly usage entries
 */
export function getUsageHistory(userId: string, months: number = 6): UsageHistoryEntry[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT strftime('%Y-%m', u.created_at) AS month,
            COALESCE(SUM(u.credits), 0) AS credits
     FROM usage u
     JOIN api_keys ak ON ak.id = u.api_key_id
     WHERE ak.user_id = ?
       AND u.created_at >= datetime('now', '-' || ? || ' months')
     GROUP BY month
     ORDER BY month ASC`,
  ).all(userId, months) as Array<{ month: string; credits: number }>;

  return rows.map((row) => ({
    month: row.month,
    credits: row.credits,
  }));
}
