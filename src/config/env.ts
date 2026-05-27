import type { AppConfig } from '../types/index.js';

const DEFAULT_PORT = 3001;
const DEFAULT_MAX_FILE_SIZE_MB = 20;
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_NODE_ENV = 'development';
const DEFAULT_CREDIT_MULTIPLIER = 1.45;
const DEFAULT_DATABASE_PATH = './data/bloh.db';

/**
 * Parses a required environment variable or throws at startup.
 * @param name - Environment variable name
 * @returns Trimmed non-empty value
 */
function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Parses an optional integer environment variable with a default.
 * @param name - Environment variable name
 * @param defaultValue - Fallback when unset or invalid
 * @returns Parsed integer value
 */
function parseIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer for environment variable: ${name}`);
  }
  return parsed;
}

/**
 * Parses an optional float environment variable with a default.
 * @param name - Environment variable name
 * @param defaultValue - Fallback when unset or invalid
 * @returns Parsed float value
 */
function parseFloatEnv(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid float for environment variable: ${name}`);
  }
  return parsed;
}

/**
 * Loads and validates all application configuration from environment variables.
 * @returns Validated application config
 */
export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV?.trim() || DEFAULT_NODE_ENV;
  const port = parseIntEnv('PORT', DEFAULT_PORT);
  const maxFileSizeMb = parseIntEnv('MAX_FILE_SIZE_MB', DEFAULT_MAX_FILE_SIZE_MB);

  const corsOriginRaw = process.env.CORS_ORIGIN?.trim() || '';
  const corsOrigin = corsOriginRaw.length > 0
    ? corsOriginRaw.split(',').map((o) => o.trim()).filter((o) => o.length > 0)
    : [];

  return {
    port,
    groqApiKey: requireEnv('GROQ_API_KEY'),
    maxFileSizeMb,
    creditMultiplier: parseFloatEnv('CREDIT_MULTIPLIER', DEFAULT_CREDIT_MULTIPLIER),
    logLevel: process.env.LOG_LEVEL?.trim() || DEFAULT_LOG_LEVEL,
    nodeEnv,
    maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
    stripeSecretKey: requireEnv('STRIPE_SECRET_KEY'),
    stripeWebhookSecret: requireEnv('STRIPE_WEBHOOK_SECRET'),
    stripePricePro: requireEnv('STRIPE_PRICE_PRO'),
    stripePriceMax: requireEnv('STRIPE_PRICE_MAX'),
    sessionSecret: requireEnv('SESSION_SECRET'),
    databasePath: process.env.DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH,
    blohBaseUrl: requireEnv('BLOH_BASE_URL'),
    clerkPublishableKey: requireEnv('CLERK_PUBLISHABLE_KEY'),
    clerkSecretKey: requireEnv('CLERK_SECRET_KEY'),
    isProduction: nodeEnv === 'production',
    trustProxy: (process.env.TRUST_PROXY?.trim() || 'false') === 'true',
    corsOrigin,
  };
}
