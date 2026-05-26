import type { FastifyBaseLogger } from 'fastify';

/** Fields logged for every HTTP request. */
export interface RequestLogFields {
  method: string;
  path: string;
  status_code: number;
  processing_time_ms: number;
  api_key_prefix: string;
}

/** Fields logged for external service calls. */
export interface ExternalCallLogFields {
  service: string;
  duration_ms: number;
  success: boolean;
  error_message?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/**
 * Logs a completed HTTP request with standard fields.
 * @param logger - Fastify pino logger instance
 * @param fields - Request log metadata
 */
export function logRequest(
  logger: FastifyBaseLogger,
  fields: RequestLogFields,
): void {
  logger.info(fields, 'request completed');
}

/**
 * Logs an external service call (parser, LLM) with duration and outcome.
 * @param logger - Fastify pino logger instance
 * @param fields - External call log metadata
 */
export function logExternalCall(
  logger: FastifyBaseLogger,
  fields: ExternalCallLogFields,
): void {
  if (fields.success) {
    logger.info(fields, 'external call completed');
  } else {
    logger.error(fields, 'external call failed');
  }
}

/**
 * Returns the first 8 characters of an API key for safe logging.
 * @param apiKey - Full API key from request header
 * @returns Truncated prefix safe for logs
 */
export function apiKeyPrefix(apiKey: string): string {
  return apiKey.slice(0, 4);
}
