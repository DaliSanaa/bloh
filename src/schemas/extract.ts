/** JSON schema for successful extraction responses. */
export const extractSuccessResponseSchema = {
  type: 'object',
  required: ['success', 'document_type', 'data', 'confidence', 'processing_time_ms'],
  properties: {
    success: { type: 'boolean', const: true },
    document_type: { type: 'string' },
    data: { type: 'object', additionalProperties: true },
    confidence: { type: 'string', enum: ['high', 'low', 'medium'] },
    processing_time_ms: { type: 'number' },
  },
} as const;

/** JSON schema for error responses. */
export const errorResponseSchema = {
  type: 'object',
  required: ['success', 'error'],
  properties: {
    success: { type: 'boolean', const: false },
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
} as const;

/** JSON schema for the POST /extract route response (union). */
export const extractResponseSchema = {
  oneOf: [extractSuccessResponseSchema, errorResponseSchema],
} as const;

/** JSON schema for health check response. */
export const healthResponseSchema = {
  type: 'object',
  required: ['status'],
  properties: {
    status: { type: 'string', const: 'ok' },
  },
} as const;

/** Allowed document_type form field values. */
export const DOCUMENT_TYPE_VALUES = [
  'invoice',
  'receipt',
  'contract',
  'id_document',
  'bank_statement',
  'auto',
] as const;
