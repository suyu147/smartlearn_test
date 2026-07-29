/**
 * ApiKeyService - Server-side API Key Storage with AES-256-GCM Encryption
 *
 * Encrypts API keys before storing them in the database (DtApiKey model).
 * Keys are decrypted on retrieval and never exposed in plaintext to the client.
 *
 * Encryption format: "iv:authTag:ciphertext" (all hex-encoded)
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/utils/database';

const log = createLogger('ApiKeyService');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag
const KEY_LENGTH = 32; // 256-bit key

/** Dev-only fallback key derived deterministically (NOT for production). */
const DEV_FALLBACK_SECRET = 'deeptutor-dev-encryption-key!!!';

function deriveKey(secret: string): Buffer {
  const buf = Buffer.from(secret, 'utf-8');
  if (buf.length >= KEY_LENGTH) {
    return buf.subarray(0, KEY_LENGTH);
  }
  // Pad with zeros if too short
  const padded = Buffer.alloc(KEY_LENGTH);
  buf.copy(padded);
  return padded;
}

export class ApiKeyService {
  private readonly encryptionKey: Buffer;

  constructor() {
    const secret = process.env.DT_ENCRYPTION_SECRET || DEV_FALLBACK_SECRET;
    this.encryptionKey = deriveKey(secret);

    if (!process.env.DT_ENCRYPTION_SECRET) {
      log.warn('DT_ENCRYPTION_SECRET not set, using dev fallback key. Do NOT use in production.');
    }
  }

  /**
   * Encrypt a plaintext API key.
   * @returns Encrypted string in format "iv:authTag:ciphertext" (hex)
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypt an encrypted API key.
   * @param encrypted - String in format "iv:authTag:ciphertext" (hex)
   * @returns Decrypted plaintext API key
   */
  decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format. Expected "iv:authTag:ciphertext".');
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf-8');
  }

  /**
   * Store an API key for a user+provider combination.
   * Encrypts the key before persisting.
   */
  async storeKey(
    userId: string,
    provider: string,
    apiKey: string,
    label?: string,
  ): Promise<void> {
    const encryptedKey = this.encrypt(apiKey);

    await prisma.dtApiKey.upsert({
      where: { userId_provider: { userId, provider } },
      update: {
        apiKey: encryptedKey,
        label: label ?? '',
        isActive: true,
      },
      create: {
        userId,
        provider,
        apiKey: encryptedKey,
        label: label ?? '',
        isActive: true,
      },
    });

    log.info(`Stored API key for user=${userId}, provider=${provider}`);
  }

  /**
   * Retrieve and decrypt an API key for a user+provider.
   * Returns null if no key exists or the key is inactive.
   */
  async getKey(userId: string, provider: string): Promise<string | null> {
    const record = await prisma.dtApiKey.findUnique({
      where: { userId_provider: { userId, provider } },
    });

    if (!record || !record.isActive) {
      return null;
    }

    try {
      return this.decrypt(record.apiKey);
    } catch (err) {
      log.error(`Failed to decrypt API key for user=${userId}, provider=${provider}:`, err);
      return null;
    }
  }

  /**
   * List stored keys for a user (without decrypted values).
   */
  async listKeys(
    userId: string,
  ): Promise<Array<{ provider: string; label: string; isActive: boolean }>> {
    const records = await prisma.dtApiKey.findMany({
      where: { userId },
      select: {
        provider: true,
        label: true,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return records;
  }

  /**
   * Delete a stored key for a user+provider.
   * @returns true if a key was deleted, false if none existed.
   */
  async deleteKey(userId: string, provider: string): Promise<boolean> {
    try {
      await prisma.dtApiKey.delete({
        where: { userId_provider: { userId, provider } },
      });
      log.info(`Deleted API key for user=${userId}, provider=${provider}`);
      return true;
    } catch {
      // Record not found
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: ApiKeyService | null = null;

export function getApiKeyService(): ApiKeyService {
  if (!instance) {
    instance = new ApiKeyService();
  }
  return instance;
}
