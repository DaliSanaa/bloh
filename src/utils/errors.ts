import type { ErrorCode } from '../types/index.js';

/** Base error class for all Bloh application errors. */
export class BlohError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;

  /**
   * Creates a typed Bloh application error.
   * @param code - Machine-readable error code
   * @param message - Human-readable error message
   * @param statusCode - HTTP status code to return
   */
  constructor(code: ErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = 'BlohError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Creates a BlohError for a missing uploaded file.
 * @returns BlohError with MISSING_FILE code
 */
export function missingFileError(): BlohError {
  return new BlohError('MISSING_FILE', 'No file provided in the request', 400);
}

/**
 * Creates a BlohError for an unsupported file extension.
 * @param extension - The rejected file extension
 * @returns BlohError with UNSUPPORTED_FILE_TYPE code
 */
export function unsupportedFileTypeError(extension: string): BlohError {
  const supported = 'pdf, jpg, jpeg, png, webp, tiff, docx, xlsx, pptx, csv, tsv';
  return new BlohError(
    'UNSUPPORTED_FILE_TYPE',
    `File type ${extension} is not supported. Supported types: ${supported}`,
    400,
  );
}

/**
 * Creates a BlohError when an uploaded file exceeds the size limit.
 * @param maxMb - Maximum allowed file size in megabytes
 * @returns BlohError with FILE_TOO_LARGE code
 */
export function fileTooLargeError(maxMb: number): BlohError {
  return new BlohError(
    'FILE_TOO_LARGE',
    `File exceeds the maximum allowed size of ${maxMb}MB`,
    413,
  );
}

/**
 * Creates a BlohError when document parsing fails.
 * @param detail - Optional detail message (not logged with PII)
 * @returns BlohError with PARSING_FAILED code
 */
export function parsingFailedError(detail?: string): BlohError {
  const message = detail
    ? `Document parsing failed: ${detail}`
    : 'Document parsing failed';
  return new BlohError('PARSING_FAILED', message, 422);
}

/**
 * Creates a BlohError when LLM extraction fails.
 * @returns BlohError with EXTRACTION_FAILED code
 */
export function extractionFailedError(): BlohError {
  return new BlohError(
    'EXTRACTION_FAILED',
    'LLM did not return valid JSON',
    422,
  );
}

/**
 * Creates a BlohError for a malformed custom schema.
 * @param detail - Schema validation detail
 * @returns BlohError with INVALID_SCHEMA code
 */
export function invalidSchemaError(detail: string): BlohError {
  return new BlohError('INVALID_SCHEMA', detail, 400);
}

/**
 * Creates a BlohError for unauthorized requests.
 * @returns BlohError with UNAUTHORIZED code
 */
export function unauthorizedError(): BlohError {
  return new BlohError(
    'UNAUTHORIZED',
    'Missing or invalid API key',
    401,
  );
}

/**
 * Creates a BlohError when rate limit is exceeded.
 * @returns BlohError with RATE_LIMITED code
 */
export function rateLimitedError(): BlohError {
  return new BlohError(
    'RATE_LIMITED',
    'Too many requests. Limit is 60 requests per minute.',
    429,
  );
}

/**
 * Creates a BlohError when playground daily limit is exceeded.
 * @returns BlohError with RATE_LIMITED code
 */
export function playgroundRateLimitedError(): BlohError {
  return new BlohError(
    'RATE_LIMITED',
    'Playground limit reached: 3 extractions per day. Get an API key for full access.',
    429,
  );
}

/**
 * Creates a BlohError when monthly credit limit is reached.
 * @param used - Credits used this month
 * @param limit - Monthly credit limit
 * @param plan - User plan
 * @param baseUrl - Base URL for upgrade link
 * @returns BlohError with CREDIT_LIMIT_REACHED code
 */
export function creditLimitReachedError(
  used: number,
  limit: number,
  plan: string,
  baseUrl: string,
): BlohError {
  return new BlohError(
    'CREDIT_LIMIT_REACHED',
    `Monthly credit limit reached. Used ${used}/${limit} credits on ${plan} plan. Upgrade at ${baseUrl}/dashboard`,
    429,
  );
}

/**
 * Converts an unknown error into a BlohError if it is not already one.
 * @param error - Caught error value
 * @returns BlohError instance
 */
export function toBlohError(error: unknown): BlohError {
  if (error instanceof BlohError) {
    return error;
  }
  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred';
  return new BlohError('INTERNAL_ERROR', message, 500);
}
