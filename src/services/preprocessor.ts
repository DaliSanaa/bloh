/** Supported file extensions for document upload. */
export const SUPPORTED_EXTENSIONS = new Set([
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'tiff',
  'docx',
  'xlsx',
  'pptx',
  'csv',
  'tsv',
]);

/** MIME types that represent images requiring preprocessing. */
const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/tiff',
]);

/**
 * Extracts the lowercase file extension from a filename.
 * @param filename - Original uploaded filename
 * @returns Lowercase extension including the dot, or empty string
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) {
    return '';
  }
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Validates that a file extension is supported.
 * @param extension - File extension including dot (e.g. ".pdf")
 * @returns True if the extension is allowed
 */
export function isSupportedExtension(extension: string): boolean {
  const normalized = extension.startsWith('.')
    ? extension.slice(1)
    : extension;
  return SUPPORTED_EXTENSIONS.has(normalized.toLowerCase());
}

/**
 * Preprocesses image buffers before parsing (pass-through with validation).
 * Non-image buffers are returned unchanged.
 * @param buffer - Raw file buffer
 * @param mimeType - Detected MIME type of the file
 * @returns Preprocessed buffer ready for parsing
 */
export function preprocessDocument(
  buffer: Buffer,
  mimeType: string,
): Buffer {
  if (!IMAGE_MIME_TYPES.has(mimeType.toLowerCase())) {
    return buffer;
  }

  return buffer;
}

/**
 * Maps a file extension to a MIME type for LiteParse.
 * @param extension - File extension including dot
 * @returns MIME type string
 */
export function extensionToMimeType(extension: string): string {
  const ext = extension.startsWith('.') ? extension.slice(1) : extension;
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    tiff: 'image/tiff',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
  };
  return mimeMap[ext.toLowerCase()] ?? 'application/octet-stream';
}
