import { LiteParse } from '@llamaindex/liteparse';
import type { FastifyBaseLogger } from 'fastify';
import { parsingFailedError } from '../utils/errors.js';
import { logExternalCall } from '../utils/logger.js';

const PARSE_TIMEOUT_MS = 30_000;

/** Result of a successful document parse. */
export interface ParseResult {
  text: string;
  pageCount: number;
}

/**
 * Parses a document buffer in memory using LiteParse with OCR enabled.
 * @param buffer - Raw document bytes
 * @param mimeType - MIME type of the document
 * @param logger - Fastify logger for structured logging
 * @returns Extracted text and page count
 */
export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  logger: FastifyBaseLogger,
): Promise<ParseResult> {
  const start = Date.now();
  let workingBuffer: Buffer | null = buffer;

  try {
    const parser = new LiteParse({ ocrEnabled: true });
    const parsePromise = parser.parse(workingBuffer);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Parse timeout exceeded')), PARSE_TIMEOUT_MS);
    });

    const result = await Promise.race([parsePromise, timeoutPromise]);
    const durationMs = Date.now() - start;

    logExternalCall(logger, {
      service: 'liteparse',
      duration_ms: durationMs,
      success: true,
    });

    logger.debug(
      { mime_type: mimeType, page_count: result.pages.length, duration_ms: durationMs },
      'document parsed',
    );

    return {
      text: result.text,
      pageCount: result.pages.length,
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown parsing error';

    logExternalCall(logger, {
      service: 'liteparse',
      duration_ms: durationMs,
      success: false,
      error_message: errorMessage,
    });

    logger.error({ mime_type: mimeType, duration_ms: durationMs }, 'parsing failed');
    throw parsingFailedError(errorMessage);
  } finally {
    workingBuffer = null;
  }
}
