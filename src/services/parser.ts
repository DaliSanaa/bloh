import { LiteParse } from '@llamaindex/liteparse';
import type { FastifyBaseLogger } from 'fastify';
import { parsingFailedError } from '../utils/errors.js';
import { logExternalCall } from '../utils/logger.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const PARSE_TIMEOUT_MS = 30_000;

/** Map MIME types to file extensions. */
const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/csv': '.csv',
  'text/tab-separated-values': '.tsv',
};

export interface ParseResult {
  text: string;
  pageCount: number;
}

/**
 * Parses a document buffer using LiteParse.
 * Writes non-PDF files to a temp file with the correct extension so LiteParse can convert them.
 * @param buffer - Raw document bytes
 * @param mimeType - MIME type of the document
 * @param logger - Fastify logger
 * @returns Extracted text and page count
 */
export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  logger: FastifyBaseLogger,
): Promise<ParseResult> {
  const start = Date.now();
  let tmpDir: string | null = null;

  try {
    const parser = new LiteParse({ ocrEnabled: true });
    const ext = MIME_TO_EXT[mimeType] || '.pdf';
    let parseInput: Buffer | string;

    if (ext === '.pdf') {
      parseInput = buffer;
    } else {
      tmpDir = mkdtempSync(join(tmpdir(), 'bloh-'));
      const tmpFile = join(tmpDir, `input${ext}`);
      writeFileSync(tmpFile, buffer);
      parseInput = tmpFile;
    }

    const parsePromise = parser.parse(parseInput);
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

    return {
      text: result.text,
      pageCount: result.pages.length,
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';

    logExternalCall(logger, {
      service: 'liteparse',
      duration_ms: durationMs,
      success: false,
      error_message: errorMessage,
    });

    throw parsingFailedError(errorMessage);
  } finally {
    if (tmpDir) {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
    }
  }
}
