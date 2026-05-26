/** Supported document type hints for extraction. */
export type DocumentType =
  | 'invoice'
  | 'receipt'
  | 'contract'
  | 'id_document'
  | 'bank_statement'
  | 'auto';

/** Confidence level returned with extraction results. */
export type ConfidenceLevel = 'high' | 'low' | 'medium';

/** User-provided custom extraction schema. */
export interface ExtractionSchema {
  fields: string[];
}

/** Standard error codes returned by the API. */
export type ErrorCode =
  | 'MISSING_FILE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'PARSING_FAILED'
  | 'EXTRACTION_FAILED'
  | 'INVALID_SCHEMA'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'CREDIT_LIMIT_REACHED'
  | 'INTERNAL_ERROR';

/** Standard error response shape. */
export interface ErrorResponseBody {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
  };
}

/** Successful extraction response shape. */
export interface ExtractSuccessResponse {
  success: true;
  document_type: string;
  data: Record<string, unknown>;
  confidence: ConfidenceLevel;
  credits_used: number;
  processing_time_ms: number;
}

/** Successful estimate response shape. */
export interface EstimateSuccessResponse {
  success: true;
  input_tokens: number;
  estimated_credits: number;
  file_size_bytes: number;
  mime_type: string;
}

/** Subscription plan tiers. */
export type Plan = 'free' | 'pro' | 'max';

/** Application configuration loaded from environment variables. */
export interface AppConfig {
  port: number;
  groqApiKey: string;
  maxFileSizeMb: number;
  creditMultiplier: number;
  logLevel: string;
  nodeEnv: string;
  maxFileSizeBytes: number;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripePricePro: string;
  stripePriceMax: string;
  sessionSecret: string;
  databasePath: string;
  blohBaseUrl: string;
  clerkPublishableKey: string;
  clerkSecretKey: string;
  isProduction: boolean;
}

/** Groq chat completion response (subset used by extractor). */
export interface GroqChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Result from LLM extraction including metadata. */
export interface ExtractionResult {
  data: Record<string, unknown>;
  documentType: string;
  confidence: ConfidenceLevel;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}
