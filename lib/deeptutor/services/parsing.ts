/**
 * ParsingService — Document text extraction
 *
 * Supports: PDF, DOCX, plain text, Markdown, code files, and more.
 * Replaces Python markitdown with TypeScript-native parsers.
 *
 * Phase 2b: PDF (pdf-parse) + DOCX (mammoth) + plain text.
 * No Python sidecar.
 */

import { readFile } from 'fs/promises';
import { extname, basename } from 'path';
import { createLogger } from '@/lib/logger';

const log = createLogger('ParsingService');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_EXTRACTED_CHARS = 200_000;

/** Extensions that need binary parsers */
const PARSER_EXTENSIONS = new Set(['.pdf', '.docx']);

/** Extensions treated as plain text */
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.yaml', '.yml', '.xml', '.html', '.htm',
  '.css', '.scss', '.less', '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go',
  '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp', '.cs', '.php',
  '.sql', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.csv', '.tsv', '.ini', '.toml', '.cfg', '.conf', '.env',
  '.log', '.diff', '.patch', '.tex', '.rst', '.org',
  '.vue', '.svelte', '.astro',
  '.graphql', '.gql', '.proto', '.sol',
  '.dockerfile', '.makefile',
]);

/** Image extensions (not parsed in Phase 2b) */
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.svg',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParseResult {
  text: string;
  metadata: {
    fileName: string;
    fileType: string;
    fileSize: number;
    charCount: number;
    parseMethod: string;
  };
}

export type FileCategory = 'parser' | 'text' | 'image' | 'unsupported';

// ---------------------------------------------------------------------------
// File Type Router
// ---------------------------------------------------------------------------

export function classifyFile(filePath: string): FileCategory {
  const ext = extname(filePath).toLowerCase();
  if (PARSER_EXTENSIONS.has(ext)) return 'parser';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  return 'unsupported';
}

export function isTextFile(filePath: string): boolean {
  return classifyFile(filePath) === 'text';
}

// ---------------------------------------------------------------------------
// ParsingService
// ---------------------------------------------------------------------------

export class ParsingServiceImpl {
  /**
   * Parse a file and extract its text content.
   * Routes to the appropriate parser based on file extension.
   */
  async parse(filePath: string): Promise<ParseResult> {
    const ext = extname(filePath).toLowerCase();
    const fileName = basename(filePath);
    const category = classifyFile(filePath);

    // Check file size
    const { stat } = await import('fs/promises');
    const stats = await stat(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      throw new ParsingError(`File too large: ${stats.size} bytes (max ${MAX_FILE_SIZE})`);
    }

    let text: string;
    let parseMethod: string;

    switch (category) {
      case 'parser':
        if (ext === '.pdf') {
          text = await parsePDF(filePath);
          parseMethod = 'pdf-parse';
        } else if (ext === '.docx') {
          text = await parseDOCX(filePath);
          parseMethod = 'mammoth';
        } else {
          throw new ParsingError(`Unsupported parser extension: ${ext}`);
        }
        break;

      case 'text':
        text = await parseTextFile(filePath);
        parseMethod = 'text';
        break;

      case 'image':
        // Phase 2b: images are not parsed
        text = `[Image file: ${fileName} — image parsing not available in Phase 2b]`;
        parseMethod = 'image-placeholder';
        break;

      default:
        // Try reading as text with encoding fallback
        text = await parseTextFile(filePath);
        parseMethod = 'text-fallback';
        break;
    }

    // Truncate if too long
    if (text.length > MAX_EXTRACTED_CHARS) {
      text = text.slice(0, MAX_EXTRACTED_CHARS) + '\n\n[... truncated at ' + MAX_EXTRACTED_CHARS + ' chars]';
    }

    return {
      text,
      metadata: {
        fileName,
        fileType: ext,
        fileSize: stats.size,
        charCount: text.length,
        parseMethod,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// PDF Parser
// ---------------------------------------------------------------------------

async function parsePDF(filePath: string): Promise<string> {
  const { stat } = await import('fs/promises');
  const stats = await stat(filePath);
  if (stats.size > MAX_PDF_SIZE) {
    throw new ParsingError(`PDF too large: ${stats.size} bytes (max ${MAX_PDF_SIZE})`);
  }

  try {
    const { PDFParse } = await import('pdf-parse');
    const buffer = await readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    try {
      const textResult = await parser.getText();
      return textResult.text || '';
    } finally {
      await parser.destroy();
    }
  } catch (err) {
    log.error(`PDF parsing failed for ${filePath}:`, err);
    // Fallback: try to extract readable text from raw bytes
    return parseTextFallbackFromBuffer(filePath);
  }
}

// ---------------------------------------------------------------------------
// DOCX Parser
// ---------------------------------------------------------------------------

async function parseDOCX(filePath: string): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  } catch (err) {
    log.error(`DOCX parsing failed for ${filePath}:`, err);
    // Fallback: try reading as zip and extracting document.xml text
    return parseTextFallbackFromBuffer(filePath);
  }
}

// ---------------------------------------------------------------------------
// Text File Reader with Encoding Fallback
// ---------------------------------------------------------------------------

async function parseTextFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return decodeWithFallback(buffer);
}

/** Try decoding a buffer with multiple encodings */
function decodeWithFallback(buffer: Buffer): string {
  // Try UTF-8 first
  try {
    const text = buffer.toString('utf-8');
    // Check for BOM
    if (text.charCodeAt(0) === 0xFEFF) {
      return text.slice(1); // Strip BOM
    }
    // Check if it looks like valid text (no null bytes in first 8KB)
    const sample = buffer.slice(0, Math.min(8192, buffer.length));
    if (sample.includes(0)) {
      // Contains null bytes — likely binary
      return '[Binary file — cannot extract text]';
    }
    return text;
  } catch {
    // latin-1 always succeeds (every byte is valid)
    return buffer.toString('latin1');
  }
}

/** Last resort: try to extract any readable text from a binary file */
async function parseTextFallbackFromBuffer(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  // Extract ASCII-readable sequences of 4+ chars
  const text = buffer.toString('utf-8');
  const readable = text.replace(/[^\x20-\x7E\n\r\t]/g, ' ');
  const lines = readable.split('\n').filter((l) => l.trim().length > 3);
  return lines.join('\n') || '[Could not extract text from file]';
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class ParsingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParsingError';
  }
}

// Re-export interface for backward compatibility
export interface ParsingService {
  parse(filePath: string): Promise<string>;
}
