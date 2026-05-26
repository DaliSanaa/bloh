import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { fileTypeFromBuffer } from 'file-type';
import type { AppConfig } from '../types/index.js';
import type {
  DocumentType,
  ExtractionSchema,
  EstimateSuccessResponse,
  ExtractSuccessResponse,
} from '../types/index.js';
import { extractFields } from './extractor.js';
import { parseDocument } from './parser.js';
import {
  extensionToMimeType,
  getFileExtension,
  isSupportedExtension,
  preprocessDocument,
} from './preprocessor.js';
import { calculateCredits, countTokens } from './tokenizer.js';
import { recordUsage } from './usage.js';
import { DOCUMENT_TYPE_VALUES } from '../schemas/extract.js';
import {
  BlohError,
  fileTooLargeError,
  invalidSchemaError,
  missingFileError,
  toBlohError,
  unsupportedFileTypeError,
} from '../utils/errors.js';
import { logRequest } from '../utils/logger.js';

const VALID_DOCUMENT_TYPES = new Set<string>(DOCUMENT_TYPE_VALUES);
const MAX_SCHEMA_FIELDS = 50;
const MAX_FIELD_NAME_LENGTH = 64;
const FIELD_NAME_PATTERN = /^[a-zA-Z0-9_\s-]+$/;

const MAGIC_BYTE_MIME_FAMILIES: Record<string, string[]> = {
  'application/pdf': ['application/pdf'],
  'image/jpeg': ['image/jpeg'],
  'image/png': ['image/png'],
  'image/webp': ['image/webp'],
  'image/tiff': ['image/tiff'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['application/zip'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['application/zip'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['application/zip'],
};

/** Parsed multipart form fields from an extract request. */
interface ExtractFormData {
  file: MultipartFile;
  fileBuffer: Buffer;
  schemaRaw?: string;
  documentTypeRaw?: string;
}

/** Context for logging an extraction request. */
export interface ExtractionLogContext {
  apiKeyPrefix: string;
  path: string;
  keyId?: string;
}

/**
 * Parses and validates the optional schema form field.
 * @param raw - Raw schema string from multipart form
 * @returns Validated extraction schema
 */
function parseCustomSchema(raw: string | undefined): ExtractionSchema | undefined {
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalidSchemaError('Schema must be valid JSON');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('fields' in parsed) ||
    !Array.isArray((parsed as ExtractionSchema).fields)
  ) {
    throw invalidSchemaError('Schema must contain a "fields" array');
  }

  const fields = (parsed as ExtractionSchema).fields;
  if (fields.length === 0) {
    throw invalidSchemaError('Schema "fields" array must not be empty');
  }

  if (!fields.every((f) => typeof f === 'string')) {
    throw invalidSchemaError('All schema fields must be strings');
  }

  if (fields.length > MAX_SCHEMA_FIELDS) {
    throw invalidSchemaError(`Schema may contain at most ${MAX_SCHEMA_FIELDS} fields`);
  }

  const sanitized = fields.map((f) => {
    const trimmed = f.trim();
    if (trimmed.length > MAX_FIELD_NAME_LENGTH) {
      throw invalidSchemaError(
        `Field name "${trimmed.slice(0, 20)}..." exceeds the ${MAX_FIELD_NAME_LENGTH}-character limit`,
      );
    }
    if (!FIELD_NAME_PATTERN.test(trimmed)) {
      throw invalidSchemaError(
        `Field name "${trimmed}" contains invalid characters. Use only letters, numbers, underscores, hyphens, and spaces`,
      );
    }
    return trimmed;
  });

  return { fields: sanitized };
}

/**
 * Validates and normalizes the document_type form field.
 * @param raw - Raw document_type string from multipart form
 * @returns Validated document type
 */
function parseDocumentType(raw: string | undefined): DocumentType {
  const value = raw?.trim() || 'auto';
  if (!VALID_DOCUMENT_TYPES.has(value)) {
    throw invalidSchemaError(
      `Invalid document_type. Must be one of: ${DOCUMENT_TYPE_VALUES.join(', ')}`,
    );
  }
  return value as DocumentType;
}

/**
 * Reads all multipart parts from the request into structured form data.
 * @param request - Fastify request with multipart body
 * @param maxFileSizeBytes - Maximum allowed file size in bytes
 * @param maxFileSizeMb - Maximum allowed file size in megabytes
 * @returns Parsed file and form fields
 */
async function readMultipartForm(
  request: FastifyRequest,
  maxFileSizeBytes: number,
  maxFileSizeMb: number,
): Promise<ExtractFormData> {
  const contentType = request.headers['content-type'] ?? '';
  if (!contentType.includes('multipart/form-data')) {
    throw missingFileError();
  }

  let file: MultipartFile | undefined;
  let fileBuffer: Buffer | null = null;
  let schemaRaw: string | undefined;
  let documentTypeRaw: string | undefined;

  let parts;
  try {
    parts = request.parts();
  } catch {
    throw missingFileError();
  }

  for await (const part of parts) {
    if (part.type === 'file') {
      if (part.fieldname === 'file') {
        file = part;
        fileBuffer = await part.toBuffer();
        if (fileBuffer.length > maxFileSizeBytes) {
          throw fileTooLargeError(maxFileSizeMb);
        }
      }
    } else if (part.fieldname === 'schema') {
      schemaRaw = part.value as string;
    } else if (part.fieldname === 'document_type') {
      documentTypeRaw = part.value as string;
    }
  }

  if (!file || !fileBuffer) {
    throw missingFileError();
  }

  return { file, fileBuffer, schemaRaw, documentTypeRaw };
}

/**
 * Validates file upload fields from multipart form data.
 * @param form - Parsed multipart form data
 * @returns MIME type and preprocessed buffer
 */
async function validateAndPreprocessFile(form: ExtractFormData): Promise<{
  mimeType: string;
  preprocessed: Buffer;
  fileSizeBytes: number;
}> {
  const extension = getFileExtension(form.file.filename);
  if (!extension || !isSupportedExtension(extension)) {
    throw unsupportedFileTypeError(extension || '(none)');
  }

  const mimeType = form.file.mimetype || extensionToMimeType(extension);

  const detected = await fileTypeFromBuffer(form.fileBuffer);
  if (detected) {
    const allowedFamily = MAGIC_BYTE_MIME_FAMILIES[mimeType];
    if (allowedFamily && !allowedFamily.includes(detected.mime)) {
      throw unsupportedFileTypeError(
        `${extension} (content does not match declared type)`,
      );
    }
  }

  const preprocessed = preprocessDocument(form.fileBuffer, mimeType);

  return {
    mimeType,
    preprocessed,
    fileSizeBytes: form.fileBuffer.length,
  };
}

/**
 * Sends a standardized error response from a BlohError.
 * @param reply - Fastify reply object
 * @param error - Typed application error
 */
export async function sendExtractionError(
  reply: FastifyReply,
  error: BlohError,
): Promise<void> {
  await reply.status(error.statusCode).send({
    success: false,
    error: { code: error.code, message: error.message },
  });
}

/**
 * Estimates credits for a document without running LLM extraction.
 * @param request - Fastify request with multipart body
 * @param reply - Fastify reply object
 * @param config - Application configuration
 * @param logContext - Logging context for the request
 * @returns Estimate success response payload
 */
export async function handleEstimate(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  logContext: ExtractionLogContext,
): Promise<EstimateSuccessResponse> {
  const start = Date.now();
  let fileBuffer: Buffer | null = null;

  try {
    const form = await readMultipartForm(
      request,
      config.maxFileSizeBytes,
      config.maxFileSizeMb,
    );
    fileBuffer = form.fileBuffer;

    const { mimeType, preprocessed, fileSizeBytes } = await validateAndPreprocessFile(form);
    const { text } = await parseDocument(preprocessed, mimeType, request.log);

    const inputTokens = countTokens(text);
    const estimatedCredits = calculateCredits(inputTokens, config.creditMultiplier);
    const processingTimeMs = Date.now() - start;

    logRequest(request.log, {
      method: request.method,
      path: logContext.path,
      status_code: 200,
      processing_time_ms: processingTimeMs,
      api_key_prefix: logContext.apiKeyPrefix,
    });

    return {
      success: true,
      input_tokens: inputTokens,
      estimated_credits: estimatedCredits,
      file_size_bytes: fileSizeBytes,
      mime_type: mimeType,
    };
  } catch (error) {
    const blohError = toBlohError(error);
    const processingTimeMs = Date.now() - start;

    request.log.error(
      { err: blohError, code: blohError.code },
      'estimate request failed',
    );

    logRequest(request.log, {
      method: request.method,
      path: logContext.path,
      status_code: blohError.statusCode,
      processing_time_ms: processingTimeMs,
      api_key_prefix: logContext.apiKeyPrefix,
    });

    await sendExtractionError(reply, blohError);
    throw blohError;
  } finally {
    void fileBuffer;
    fileBuffer = null;
  }
}

/**
 * Runs the full document extraction pipeline for a multipart request.
 * @param request - Fastify request with multipart body
 * @param reply - Fastify reply object
 * @param config - Application configuration
 * @param logContext - Logging context for the request
 * @returns Extraction success response payload
 */
export async function handleExtraction(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  logContext: ExtractionLogContext,
): Promise<ExtractSuccessResponse> {
  const start = Date.now();
  let fileBuffer: Buffer | null = null;

  try {
    const form = await readMultipartForm(
      request,
      config.maxFileSizeBytes,
      config.maxFileSizeMb,
    );
    fileBuffer = form.fileBuffer;

    const { mimeType, preprocessed } = await validateAndPreprocessFile(form);

    const customSchema = parseCustomSchema(form.schemaRaw);
    const documentType = parseDocumentType(form.documentTypeRaw);

    const { text } = await parseDocument(preprocessed, mimeType, request.log);

    const inputTokens = countTokens(text);
    const creditsUsed = calculateCredits(inputTokens, config.creditMultiplier);

    const extraction = await extractFields(
      text,
      documentType,
      customSchema,
      { groqApiKey: config.groqApiKey },
      request.log,
    );

    const processingTimeMs = Date.now() - start;

    if (logContext.keyId) {
      recordUsage(
        logContext.keyId,
        creditsUsed,
        inputTokens,
        extraction.documentType,
        processingTimeMs,
      );
    }

    logRequest(request.log, {
      method: request.method,
      path: logContext.path,
      status_code: 200,
      processing_time_ms: processingTimeMs,
      api_key_prefix: logContext.apiKeyPrefix,
    });

    return {
      success: true,
      document_type: extraction.documentType,
      data: extraction.data,
      confidence: extraction.confidence,
      credits_used: creditsUsed,
      processing_time_ms: processingTimeMs,
    };
  } catch (error) {
    const blohError = toBlohError(error);
    const processingTimeMs = Date.now() - start;

    request.log.error(
      { err: blohError, code: blohError.code },
      'extract request failed',
    );

    logRequest(request.log, {
      method: request.method,
      path: logContext.path,
      status_code: blohError.statusCode,
      processing_time_ms: processingTimeMs,
      api_key_prefix: logContext.apiKeyPrefix,
    });

    await sendExtractionError(reply, blohError);
    throw blohError;
  } finally {
    void fileBuffer;
    fileBuffer = null;
  }
}

/**
 * Logs a playground request with client IP metadata.
 * @param logger - Fastify logger instance
 * @param clientIp - Client IP address
 * @param path - Request path
 * @param action - Playground action name
 */
export function logPlaygroundRequest(
  logger: FastifyBaseLogger,
  clientIp: string,
  path: string,
  action: string,
): void {
  logger.info({ client_ip: clientIp, path, action }, 'playground request');
}
