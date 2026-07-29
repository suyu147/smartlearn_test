/**
 * Shared Zod validation helper for API routes.
 *
 * Usage:
 *   const body = await validatedBody(MySchema, req);
 *   // body is fully typed and validated
 *
 * If validation fails, throws a ValidationError with formatted details.
 * Catch it in the route handler and return apiError().
 */

import { z, ZodSchema, ZodError } from 'zod';

export class ValidationError extends Error {
  public readonly issues: z.ZodIssue[];

  constructor(error: ZodError) {
    const details = error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    super(`Validation failed: ${details}`);
    this.name = 'ValidationError';
    this.issues = error.issues;
  }
}

/**
 * Parse and validate the JSON body of a NextRequest against a Zod schema.
 * Throws ValidationError on invalid input, or SyntaxError on invalid JSON.
 */
export async function validatedBody<T>(
  schema: ZodSchema<T>,
  req: Request,
): Promise<T> {
  const raw = await req.json();
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(result.error);
  }
  return result.data;
}

/**
 * Helper to convert a ValidationError (or unknown error) into a standard
 * error message suitable for apiError().
 */
export function errorToMessage(err: unknown): string {
  if (err instanceof ValidationError) return err.message;
  if (err instanceof SyntaxError) return 'Invalid JSON body';
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

/**
 * Check if the error is a validation error (400-level).
 */
export function isValidationError(err: unknown): err is ValidationError {
  return err instanceof ValidationError;
}

/**
 * Check if the error is a JSON parse error (400-level).
 */
export function isSyntaxError(err: unknown): err is SyntaxError {
  return err instanceof SyntaxError;
}
