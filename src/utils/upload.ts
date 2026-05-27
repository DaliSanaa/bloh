import type { Multipart, MultipartFile } from '@fastify/multipart';
import type { FastifyBaseLogger } from 'fastify';
import { fileTypeFromBuffer } from 'file-type';
import { buildExtractionSystemPrompt } from '../prompts/extraction.js';
import { SUPPORTED_EXTENSIONS, SUPPORTED_MIME_TYPES } from '../schemas/extract.js';
import type { AppConfig, CustomExtractionSchema, DocumentTypeHint } from '../types/index.js';
import {
  FileTooLargeError,
  InvalidSchemaError,
  MissingFileError,
  UnsupportedFileTypeError,
} from '../utils/errors.js';

const MAX_SCHEMA_FIELDS = 50;
const MAX_FIELD_NAME_LENGTH = 64;
const FIELD_NAME_PATTERN = /^[a-zA-Z0-9_\s-]+$/;

const MAGIC_BYTE_MIME_FAMILIES: Record<string, string[]> = {
  'application/pdf': ['application/pdf'],
  'image/jpeg': ['image/jpeg'],
  'image/png': ['image/png'],
  'image/webp': ['image/webp'],
  'image/tiff': ['image/tiff'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    'application/zip',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
    'application/zip',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
};

/** Parsed and validated upload payload from a multipart request. */
export interface ParsedUpload {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  documentType: DocumentTypeHint;
  customSchema: CustomExtractionSchema | undefined;
}

/** Extension to MIME type mapping for uploads missing a MIME type. */
const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  tiff: 'image/tiff',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const DOCUMENT_TYPE_SET = new Set<string>([
  'invoice',
  'receipt',
  'contract',
  'id_document',
  'bank_statement',
  'auto',
]);

/**
 * Type guard for multipart file parts.
 * @param part - Multipart form part
 * @returns True when the part is a file upload
 */
function isMultipartFile(part: Multipart): part is MultipartFile {
  return part.type === 'file';
}

/**
 * Extracts the lowercase file extension from a filename.
 * @param filename - Original uploaded filename
 * @returns Extension without the leading dot, or empty string
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');

  if (lastDot === -1 || lastDot === filename.length - 1) {
    return '';
  }

  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Resolves a supported MIME type from extension and declared MIME type.
 * @param extension - Lowercase file extension
 * @param declaredMime - MIME type reported by the multipart upload
 * @returns Resolved MIME type string
 */
function resolveMimeType(extension: string, declaredMime: string): string {
  const normalizedMime = declaredMime.toLowerCase();

  if (
    SUPPORTED_MIME_TYPES.includes(normalizedMime as (typeof SUPPORTED_MIME_TYPES)[number])
  ) {
    return normalizedMime;
  }

  const mapped = EXTENSION_TO_MIME[extension];

  if (mapped === undefined) {
    throw new UnsupportedFileTypeError(`.${extension}`);
  }

  return mapped;
}

function parseCustomSchema(rawSchema: string | undefined): CustomExtractionSchema | undefined {
  if (rawSchema === undefined || rawSchema.trim().length === 0) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawSchema);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    throw new InvalidSchemaError(`Schema must be valid JSON: ${message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new InvalidSchemaError('Schema must be a JSON object with a "fields" array');
  }

  const fields = (parsed as { fields?: unknown }).fields;

  if (
    !Array.isArray(fields) ||
    fields.length === 0 ||
    !fields.every((field) => typeof field === 'string' && field.trim().length > 0)
  ) {
    throw new InvalidSchemaError(
      'Schema must include a non-empty "fields" array of strings',
    );
  }

  if (fields.length > MAX_SCHEMA_FIELDS) {
    throw new InvalidSchemaError(`Schema may contain at most ${MAX_SCHEMA_FIELDS} fields`);
  }

  const sanitized = fields.map((field) => {
    const trimmed = field.trim();
    if (trimmed.length > MAX_FIELD_NAME_LENGTH) {
      throw new InvalidSchemaError(
        `Field name "${trimmed.slice(0, 20)}..." exceeds the ${MAX_FIELD_NAME_LENGTH}-character limit`,
      );
    }
    if (!FIELD_NAME_PATTERN.test(trimmed)) {
      throw new InvalidSchemaError(
        `Field name "${trimmed}" contains invalid characters. Use only letters, numbers, underscores, hyphens, and spaces`,
      );
    }
    return trimmed;
  });

  return { fields: sanitized };
}

/**
 * Parses and validates the optional document type hint field.
 * @param rawDocumentType - Raw document_type value from the multipart form
 * @returns Validated document type hint
 */
function parseDocumentType(rawDocumentType: string | undefined): DocumentTypeHint {
  if (rawDocumentType === undefined || rawDocumentType.trim().length === 0) {
    return 'auto';
  }

  const normalized = rawDocumentType.trim().toLowerCase();

  if (!DOCUMENT_TYPE_SET.has(normalized)) {
    throw new InvalidSchemaError(
      'document_type must be one of: invoice, receipt, contract, id_document, bank_statement, auto',
    );
  }

  return normalized as DocumentTypeHint;
}

/**
 * Reads a multipart file into a buffer with size validation.
 * @param file - Multipart file from Fastify
 * @param maxFileSizeBytes - Maximum allowed upload size in bytes
 * @returns File buffer
 */
async function readFileBuffer(file: MultipartFile, maxFileSizeBytes: number): Promise<Buffer> {
  const buffer = await file.toBuffer();

  if (buffer.length > maxFileSizeBytes) {
    throw new FileTooLargeError(Math.floor(maxFileSizeBytes / (1024 * 1024)));
  }

  return buffer;
}

/**
 * Parses a multipart upload request into a validated upload payload.
 * @param parts - Async iterator of multipart form fields from Fastify
 * @param config - Application configuration with size limits
 * @param logger - Logger for validation errors
 * @returns Validated upload payload
 */
export async function parseMultipartUpload(
  parts: AsyncIterable<Multipart>,
  config: AppConfig,
  logger: FastifyBaseLogger,
): Promise<ParsedUpload> {
  let filePart: MultipartFile | undefined;
  let schemaRaw: string | undefined;
  let documentTypeRaw: string | undefined;

  for await (const part of parts) {
    if (isMultipartFile(part)) {
      if (part.fieldname === 'file') {
        filePart = part;
      } else {
        await part.file.resume();
      }
      continue;
    }

    if (part.fieldname === 'schema') {
      schemaRaw = String(part.value);
    }

    if (part.fieldname === 'document_type') {
      documentTypeRaw = String(part.value);
    }
  }

  if (filePart === undefined) {
    throw new MissingFileError();
  }

  const extension = getFileExtension(filePart.filename);

  if (
    extension.length === 0 ||
    !SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])
  ) {
    throw new UnsupportedFileTypeError(`.${extension || 'unknown'}`);
  }

  try {
    const buffer = await readFileBuffer(filePart, config.maxFileSizeBytes);
    const mimeType = resolveMimeType(extension, filePart.mimetype);

    const detected = await fileTypeFromBuffer(buffer);
    if (detected !== undefined) {
      const allowedFamily = MAGIC_BYTE_MIME_FAMILIES[mimeType];
      if (allowedFamily !== undefined && !allowedFamily.includes(detected.mime)) {
        throw new UnsupportedFileTypeError(
          `.${extension} (content does not match declared type)`,
        );
      }
    }

    const customSchema = parseCustomSchema(schemaRaw);
    const documentType = parseDocumentType(documentTypeRaw);

    return {
      buffer,
      mimeType,
      filename: filePart.filename,
      documentType,
      customSchema,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload parsing failed';
    logger.error({ error: message, filename: filePart.filename }, 'multipart upload parsing failed');
    throw error;
  }
}

/**
 * Builds the system prompt used for token estimation on the estimate endpoint.
 * @param upload - Validated upload payload
 * @param parsedText - Parsed document text
 * @returns System prompt string for token counting
 */
export function buildEstimateSystemPrompt(upload: ParsedUpload, parsedText: string): string {
  return buildExtractionSystemPrompt(upload.documentType, upload.customSchema, parsedText);
}
