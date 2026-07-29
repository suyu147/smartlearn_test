/**
 * Attachment Store — Local disk attachment storage for DeepTutor sessions
 *
 * Based on DeepTutor's AttachmentStore protocol.
 * Layout: {root}/{sessionId}/{attachmentId}_{filename}
 *
 * Uses StorageAdapter internally for atomic writes and path safety.
 * Returns public URLs: /api/v1/attachments/{sessionId}/{attachmentId}/{filename}
 */

import { createLogger } from '@/lib/logger';
import { getStorageAdapter, type StorageAdapter } from '@/lib/deeptutor/services/storage';
import path from 'node:path';

const log = createLogger('AttachmentStore');

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface AttachmentStoreProtocol {
  /** Store an attachment and return its public URL. */
  put(opts: {
    sessionId: string;
    attachmentId: string;
    filename: string;
    data: Buffer;
    mimeType: string;
  }): Promise<string>;

  /** Delete all attachments for a session. */
  deleteSession(sessionId: string): Promise<void>;

  /** Delete a specific attachment. */
  deleteAttachment(sessionId: string, attachmentId: string): Promise<void>;

  /** Resolve an attachment to an absolute filesystem path, or null. */
  resolvePath(sessionId: string, attachmentId: string, filename: string): string | null;
}

// ---------------------------------------------------------------------------
// LocalDiskAttachmentStore
// ---------------------------------------------------------------------------

export class LocalDiskAttachmentStore implements AttachmentStoreProtocol {
  private readonly storage: StorageAdapter;
  private readonly prefix: string;

  constructor(storage?: StorageAdapter, prefix?: string) {
    this.storage = storage ?? getStorageAdapter();
    this.prefix = prefix ?? 'attachments';
  }

  // --- put ----------------------------------------------------------------

  async put(opts: {
    sessionId: string;
    attachmentId: string;
    filename: string;
    data: Buffer;
    mimeType: string;
  }): Promise<string> {
    const { sessionId, attachmentId, filename, data } = opts;

    validateSegment(sessionId, 'sessionId');
    validateSegment(attachmentId, 'attachmentId');
    validateSegment(filename, 'filename');

    const key = this.buildKey(sessionId, attachmentId, filename);
    await this.storage.write(key, data);

    const url = this.buildPublicUrl(sessionId, attachmentId, filename);
    log.debug(`Attachment stored: ${key} (${data.length} bytes, ${opts.mimeType})`);
    return url;
  }

  // --- deleteSession ------------------------------------------------------

  async deleteSession(sessionId: string): Promise<void> {
    validateSegment(sessionId, 'sessionId');

    const sessionDir = `${this.prefix}/${sessionId}`;
    const files = await this.storage.list(sessionDir);

    if (files.length === 0) {
      log.debug(`No attachments to delete for session: ${sessionId}`);
      return;
    }

    let deleted = 0;
    for (const file of files) {
      const ok = await this.storage.delete(file);
      if (ok) deleted++;
    }

    log.info(`Deleted ${deleted} attachments for session: ${sessionId}`);
  }

  // --- deleteAttachment ---------------------------------------------------

  async deleteAttachment(sessionId: string, attachmentId: string): Promise<void> {
    validateSegment(sessionId, 'sessionId');
    validateSegment(attachmentId, 'attachmentId');

    const sessionDir = `${this.prefix}/${sessionId}`;
    const files = await this.storage.list(sessionDir);

    // Find files matching this attachmentId prefix
    const prefix = `${attachmentId}_`;
    const matches = files.filter((f) => {
      const basename = path.basename(f);
      return basename.startsWith(prefix);
    });

    for (const file of matches) {
      await this.storage.delete(file);
    }

    log.debug(`Deleted attachment: ${sessionId}/${attachmentId} (${matches.length} files)`);
  }

  // --- resolvePath --------------------------------------------------------

  resolvePath(sessionId: string, attachmentId: string, filename: string): string | null {
    try {
      validateSegment(sessionId, 'sessionId');
      validateSegment(attachmentId, 'attachmentId');
      validateSegment(filename, 'filename');
    } catch {
      return null;
    }

    const key = this.buildKey(sessionId, attachmentId, filename);
    return this.storage.resolvePath(key);
  }

  // --- helpers ------------------------------------------------------------

  /** Build the storage key: attachments/{sessionId}/{attachmentId}_{filename} */
  private buildKey(sessionId: string, attachmentId: string, filename: string): string {
    return `${this.prefix}/${sessionId}/${attachmentId}_${filename}`;
  }

  /** Build the public URL: /api/v1/attachments/{sessionId}/{attachmentId}/{filename} */
  private buildPublicUrl(sessionId: string, attachmentId: string, filename: string): string {
    return `/api/v1/attachments/${encodeURIComponent(sessionId)}/${encodeURIComponent(attachmentId)}/${encodeURIComponent(filename)}`;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let attachmentStoreInstance: AttachmentStoreProtocol | null = null;

/** Get the singleton attachment store. */
export function getAttachmentStore(): AttachmentStoreProtocol {
  if (!attachmentStoreInstance) {
    attachmentStoreInstance = new LocalDiskAttachmentStore();
  }
  return attachmentStoreInstance;
}

/** Replace the singleton (useful for testing). */
export function setAttachmentStore(store: AttachmentStoreProtocol): void {
  attachmentStoreInstance = store;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a path segment is safe — no slashes, no traversal, no null bytes.
 */
function validateSegment(value: string, label: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  if (value.includes('/') || value.includes('\\')) {
    throw new Error(`${label} must not contain path separators: ${value}`);
  }
  if (value.includes('..')) {
    throw new Error(`${label} must not contain traversal sequences: ${value}`);
  }
  if (value.includes('\0')) {
    throw new Error(`${label} must not contain null bytes`);
  }
}
