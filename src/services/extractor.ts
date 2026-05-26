import type { FastifyBaseLogger } from 'fastify';
import {
  buildExtractionPrompt,
  STRICT_JSON_SUFFIX,
} from '../prompts/extraction.js';
import type {
  ConfidenceLevel,
  DocumentType,
  ExtractionResult,
  ExtractionSchema,
  GroqChatCompletionResponse,
} from '../types/index.js';
import { BlohError, extractionFailedError } from '../utils/errors.js';
import { logExternalCall } from '../utils/logger.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'qwen/qwen3-32b';
const EXTRACTION_TIMEOUT_MS = 30_000;

/** Dependencies injectable for testing. */
export interface ExtractorDeps {
  groqApiKey: string;
  fetchFn?: typeof fetch;
}

/**
 * Strips markdown code fences from an LLM response if present.
 * @param content - Raw LLM response text
 * @returns Cleaned JSON string
 */
function stripMarkdownFences(content: string): string {
  const trimmed = content.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

/**
 * Parses LLM response content into a JSON object.
 * @param content - Raw LLM response text
 * @returns Parsed JSON object
 */
function parseJsonResponse(content: string): Record<string, unknown> {
  const cleaned = stripMarkdownFences(content);
  return JSON.parse(cleaned) as Record<string, unknown>;
}

/**
 * Calls Groq chat completions API with a timeout.
 * @param deps - Extractor dependencies
 * @param systemPrompt - Full system prompt including document text
 * @param logger - Fastify logger
 * @returns API response body
 */
async function callGroqApi(
  deps: ExtractorDeps,
  systemPrompt: string,
  logger: FastifyBaseLogger,
): Promise<GroqChatCompletionResponse> {
  const fetchFn = deps.fetchFn ?? fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);

  try {
    const response = await fetchFn(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deps.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.1,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Groq API returned status ${response.status}`);
    }

    return (await response.json()) as GroqChatCompletionResponse;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Groq API call failed';
    logger.error({ error_message: message }, 'groq API error');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Resolves confidence level from extracted data.
 * @param data - Parsed extraction data
 * @returns Confidence level string
 */
function resolveConfidence(data: Record<string, unknown>): ConfidenceLevel {
  const raw = data.confidence;
  if (raw === 'high' || raw === 'low' || raw === 'medium') {
    return raw;
  }
  return 'medium';
}

/**
 * Resolves document type from extracted data or falls back to hint.
 * @param data - Parsed extraction data
 * @param hint - Document type hint from request
 * @returns Detected or hinted document type
 */
function resolveDocumentType(
  data: Record<string, unknown>,
  hint: DocumentType,
): string {
  if (typeof data.document_type === 'string' && data.document_type.length > 0) {
    return data.document_type;
  }
  return hint === 'auto' ? 'other' : hint;
}

/**
 * Extracts structured fields from parsed document text using Groq LLM.
 * @param parsedText - Text extracted by LiteParse
 * @param documentType - Document type hint
 * @param customSchema - Optional user-defined field schema
 * @param deps - Injectable dependencies
 * @param logger - Fastify logger
 * @returns Extraction result with data and metadata
 */
export async function extractFields(
  parsedText: string,
  documentType: DocumentType,
  customSchema: ExtractionSchema | undefined,
  deps: ExtractorDeps,
  logger: FastifyBaseLogger,
): Promise<ExtractionResult> {
  const start = Date.now();
  let prompt = buildExtractionPrompt(parsedText, documentType, customSchema);
  let lastContent = '';

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const apiResponse = await callGroqApi(deps, prompt, logger);
      lastContent = apiResponse.choices[0]?.message?.content ?? '';

      try {
        const data = parseJsonResponse(lastContent);
        const durationMs = Date.now() - start;

        logExternalCall(logger, {
          service: 'groq',
          duration_ms: durationMs,
          success: true,
          prompt_tokens: apiResponse.usage?.prompt_tokens,
          completion_tokens: apiResponse.usage?.completion_tokens,
          total_tokens: apiResponse.usage?.total_tokens,
        });

        const { document_type: _dt, confidence: _conf, ...rest } = data;

        return {
          data: rest,
          documentType: resolveDocumentType(data, documentType),
          confidence: resolveConfidence(data),
          promptTokens: apiResponse.usage?.prompt_tokens,
          completionTokens: apiResponse.usage?.completion_tokens,
          totalTokens: apiResponse.usage?.total_tokens,
        };
      } catch {
        if (attempt === 0) {
          logger.warn('LLM response was not valid JSON, retrying with strict prompt');
          prompt = `${prompt}\n\n${STRICT_JSON_SUFFIX}`;
          continue;
        }
      }
    }

    const durationMs = Date.now() - start;
    logExternalCall(logger, {
      service: 'groq',
      duration_ms: durationMs,
      success: false,
      error_message: 'Invalid JSON in LLM response',
    });

    logger.error({ response_length: lastContent.length }, 'extraction JSON parse failed');
    throw extractionFailedError();
  } catch (error) {
    if (error instanceof BlohError) {
      throw error;
    }
    const durationMs = Date.now() - start;
    logExternalCall(logger, {
      service: 'groq',
      duration_ms: durationMs,
      success: false,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    throw extractionFailedError();
  }
}
