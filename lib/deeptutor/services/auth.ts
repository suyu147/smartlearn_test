/**
 * Auth Service — Multi-mode authentication for DeepTutor
 *
 * Three auth modes controlled by DT_AUTH_MODE env var:
 * - disabled: all requests pass through as local admin
 * - single: first request auto-creates a user, all subsequent use that user
 * - multi: full JWT + password hashing with register/login/verify
 *
 * Uses `jose` for JWT (HS256) and Node.js `crypto.scrypt` for password hashing.
 * User records for multi mode are persisted to data/auth/users.json.
 */

import { createLogger } from '@/lib/logger';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getDataDir } from '@/lib/paths';

const log = createLogger('AuthService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthMode = 'disabled' | 'single' | 'multi';

export interface CurrentUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  scope: { root: string };
}

interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  role: 'admin' | 'user';
  createdAt: string;
}

interface UserStore {
  users: StoredUser[];
}

interface TokenPayload extends JWTPayload {
  userId: string;
  username: string;
  role: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ADMIN: CurrentUser = {
  id: 'local-admin',
  username: 'local',
  role: 'admin',
  scope: { root: '/' },
};

const SINGLE_USER_ID = 'local-single-user';

const SCRYPT_KEY_LEN = 64;
const SALT_LEN = 32;

// ---------------------------------------------------------------------------
// Auth mode
// ---------------------------------------------------------------------------

export function getAuthMode(): AuthMode {
  const raw = (process.env.AUTH_MODE ?? 'disabled').toLowerCase();
  if (raw === 'single' || raw === 'multi') return raw;
  return 'disabled';
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? 'deeptutor-dev-secret-change-in-production';
  return new TextEncoder().encode(secret);
}

/** Create an HS256 JWT for the given user. */
export async function createToken(
  userId: string,
  username: string,
  role: string,
): Promise<string> {
  const secret = getJwtSecret();
  const jwt = await new SignJWT({ userId, username, role } as TokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .setSubject(userId)
    .sign(secret);
  return jwt;
}

/** Verify a JWT and return the payload, or null if invalid. */
export async function verifyToken(
  token: string,
): Promise<{ userId: string; username: string; role: string } | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });
    const p = payload as TokenPayload;
    if (!p.userId || !p.username || !p.role) return null;
    return { userId: p.userId, username: p.username, role: p.role };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt)
// ---------------------------------------------------------------------------

function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LEN, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

async function createPasswordHash(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(SALT_LEN);
  const derived = await hashPassword(password, salt);
  return {
    hash: derived.toString('hex'),
    salt: salt.toString('hex'),
  };
}

async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
  const saltBuf = Buffer.from(salt, 'hex');
  const derived = await hashPassword(password, saltBuf);
  const stored = Buffer.from(storedHash, 'hex');
  if (derived.length !== stored.length) return false;
  return timingSafeEqual(derived, stored);
}

// ---------------------------------------------------------------------------
// User store (JSON file for multi mode)
// ---------------------------------------------------------------------------

function getUserStorePath(): string {
  return path.join(getDataDir('auth'), 'users.json');
}

async function ensureAuthDir(): Promise<void> {
  const dir = path.dirname(getUserStorePath());
  await mkdir(dir, { recursive: true });
}

async function loadUserStore(): Promise<UserStore> {
  try {
    const raw = await readFile(getUserStorePath(), 'utf-8');
    const parsed = JSON.parse(raw) as UserStore;
    if (!Array.isArray(parsed.users)) return { users: [] };
    return parsed;
  } catch {
    return { users: [] };
  }
}

async function saveUserStore(store: UserStore): Promise<void> {
  await ensureAuthDir();
  const content = JSON.stringify(store, null, 2);
  await writeFile(getUserStorePath(), content, 'utf-8');
}

function storedUserToCurrentUser(u: StoredUser): CurrentUser {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    scope: { root: '/' },
  };
}

// ---------------------------------------------------------------------------
// Register / Login (multi mode)
// ---------------------------------------------------------------------------

/** Register a new user. Throws if username already exists. */
export async function registerUser(
  username: string,
  password: string,
): Promise<CurrentUser> {
  if (!username || !password) {
    throw new Error('Username and password are required');
  }
  if (username.length < 2) {
    throw new Error('Username must be at least 2 characters');
  }
  if (password.length < 4) {
    throw new Error('Password must be at least 4 characters');
  }

  const store = await loadUserStore();
  const existing = store.users.find((u) => u.username === username);
  if (existing) {
    throw new Error(`User "${username}" already exists`);
  }

  const { hash, salt } = await createPasswordHash(password);
  const isFirstUser = store.users.length === 0;

  const user: StoredUser = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username,
    passwordHash: hash,
    salt,
    role: isFirstUser ? 'admin' : 'user',
    createdAt: new Date().toISOString(),
  };

  store.users.push(user);
  await saveUserStore(store);

  log.info(`User registered: ${username} (role: ${user.role})`);
  return storedUserToCurrentUser(user);
}

/** Login with username + password. Returns user and token, or null if invalid. */
export async function loginUser(
  username: string,
  password: string,
): Promise<{ user: CurrentUser; token: string } | null> {
  const store = await loadUserStore();
  const stored = store.users.find((u) => u.username === username);
  if (!stored) {
    log.warn(`Login failed: user "${username}" not found`);
    return null;
  }

  const valid = await verifyPassword(password, stored.passwordHash, stored.salt);
  if (!valid) {
    log.warn(`Login failed: invalid password for "${username}"`);
    return null;
  }

  const user = storedUserToCurrentUser(stored);
  const token = await createToken(user.id, user.username, user.role);

  log.info(`User logged in: ${username}`);
  return { user, token };
}

// ---------------------------------------------------------------------------
// Authenticate (main entry point)
// ---------------------------------------------------------------------------

/** Extract a Bearer token from the Authorization header. */
function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Main authentication entry point.
 * Inspects DT_AUTH_MODE and returns the authenticated CurrentUser.
 * Throws on authentication failure (caller should return 401).
 */
export async function authenticate(request: Request): Promise<CurrentUser> {
  const mode = getAuthMode();

  // --- disabled mode: return default admin ---
  if (mode === 'disabled') {
    return DEFAULT_ADMIN;
  }

  // --- single mode: auto-create / reuse single user ---
  if (mode === 'single') {
    return getOrCreateSingleUser();
  }

  // --- multi mode: JWT verification ---
  const token = extractBearerToken(request);
  if (!token) {
    throw new AuthError('Missing Authorization header', 401);
  }

  const payload = await verifyToken(token);
  if (!payload) {
    throw new AuthError('Invalid or expired token', 401);
  }

  // Verify user still exists in store
  const store = await loadUserStore();
  const stored = store.users.find((u) => u.id === payload.userId);
  if (!stored) {
    throw new AuthError('User no longer exists', 401);
  }

  return storedUserToCurrentUser(stored);
}

// ---------------------------------------------------------------------------
// Single-user mode helper
// ---------------------------------------------------------------------------

let singleUserCache: CurrentUser | null = null;

async function getOrCreateSingleUser(): Promise<CurrentUser> {
  if (singleUserCache) return singleUserCache;

  // Try loading from persistent store
  const store = await loadUserStore();
  const existing = store.users.find((u) => u.id === SINGLE_USER_ID);
  if (existing) {
    singleUserCache = storedUserToCurrentUser(existing);
    return singleUserCache;
  }

  // Auto-create the single user
  const { hash, salt } = await createPasswordHash('single-user-no-password');
  const user: StoredUser = {
    id: SINGLE_USER_ID,
    username: 'user',
    passwordHash: hash,
    salt,
    role: 'admin',
    createdAt: new Date().toISOString(),
  };
  store.users.push(user);
  await saveUserStore(store);

  singleUserCache = storedUserToCurrentUser(user);
  log.info('Single-user mode: auto-created default user');
  return singleUserCache;
}

// ---------------------------------------------------------------------------
// Auth error
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Re-export for backward compat
// ---------------------------------------------------------------------------

export const AuthService = {
  getAuthMode,
  authenticate,
  createToken,
  verifyToken,
  registerUser,
  loginUser,
} as const;
