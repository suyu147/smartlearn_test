/**
 * E2E: Health & API smoke tests
 *
 * Validates that the Next.js server is running and core API endpoints respond.
 */

import { test, expect } from '@playwright/test';

test.describe('Health & API', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const res = await request.get('/api/v1/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body.data).toHaveProperty('version');
  });

  test('root page loads with 200', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
  });

  test('404 for unknown API route', async ({ request }) => {
    const res = await request.get('/api/v1/nonexistent-route');
    expect(res.status()).toBe(404);
  });
});
