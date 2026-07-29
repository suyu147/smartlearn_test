/**
 * Unit tests for validate.ts helper functions.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  ValidationError,
  validatedBody,
  errorToMessage,
  isValidationError,
  isSyntaxError,
} from '../validate';

// ---------------------------------------------------------------------------
// Mock request helper
// ---------------------------------------------------------------------------

function mockRequest(body: unknown): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockInvalidJsonRequest(): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not valid json {{{',
  });
}

// ---------------------------------------------------------------------------
// ValidationError
// ---------------------------------------------------------------------------

describe('ValidationError', () => {
  it('formats issue details in message', () => {
    const schema = z.object({ name: z.string() });
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = new ValidationError(result.error);
      expect(err.message).toContain('name');
      expect(err.message).toContain('Required');
      expect(err.issues).toHaveLength(1);
      expect(err.name).toBe('ValidationError');
    }
  });
});

// ---------------------------------------------------------------------------
// validatedBody
// ---------------------------------------------------------------------------

describe('validatedBody', () => {
  const TestSchema = z.object({
    name: z.string().min(1),
    age: z.number().int().min(0),
  });

  it('returns parsed data for valid input', async () => {
    const req = mockRequest({ name: 'Alice', age: 30 });
    const data = await validatedBody(TestSchema, req);
    expect(data.name).toBe('Alice');
    expect(data.age).toBe(30);
  });

  it('throws ValidationError for invalid input', async () => {
    const req = mockRequest({ name: '', age: -1 });
    await expect(validatedBody(TestSchema, req)).rejects.toThrow(ValidationError);
  });

  it('throws SyntaxError for invalid JSON', async () => {
    const req = mockInvalidJsonRequest();
    await expect(validatedBody(TestSchema, req)).rejects.toThrow();
  });

  it('strips unknown fields with strict parsing', async () => {
    const req = mockRequest({ name: 'Bob', age: 25, extra: 'ignored' });
    const data = await validatedBody(TestSchema, req);
    expect(data).toEqual({ name: 'Bob', age: 25 });
    expect((data as Record<string, unknown>).extra).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// errorToMessage
// ---------------------------------------------------------------------------

describe('errorToMessage', () => {
  it('extracts message from ValidationError', () => {
    const schema = z.object({ x: z.string() });
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = new ValidationError(result.error);
      const msg = errorToMessage(err);
      expect(msg).toContain('x');
    }
  });

  it('extracts message from SyntaxError', () => {
    const err = new SyntaxError('Unexpected token');
    expect(errorToMessage(err)).toBe('Invalid JSON body');
  });

  it('extracts message from generic Error', () => {
    const err = new Error('Something went wrong');
    expect(errorToMessage(err)).toBe('Something went wrong');
  });

  it('returns "Unknown error" for non-Error', () => {
    expect(errorToMessage('string error')).toBe('Unknown error');
    expect(errorToMessage(42)).toBe('Unknown error');
    expect(errorToMessage(null)).toBe('Unknown error');
  });
});

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

describe('isValidationError', () => {
  it('returns true for ValidationError', () => {
    const schema = z.object({ x: z.string() });
    const result = schema.safeParse({});
    if (!result.success) {
      expect(isValidationError(new ValidationError(result.error))).toBe(true);
    }
  });

  it('returns false for other errors', () => {
    expect(isValidationError(new Error('nope'))).toBe(false);
    expect(isValidationError(null)).toBe(false);
  });
});

describe('isSyntaxError', () => {
  it('returns true for SyntaxError', () => {
    expect(isSyntaxError(new SyntaxError('bad json'))).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isSyntaxError(new Error('nope'))).toBe(false);
    expect(isSyntaxError(null)).toBe(false);
  });
});
