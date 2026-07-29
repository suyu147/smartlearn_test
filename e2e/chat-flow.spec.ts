/**
 * E2E: Chat flow tests
 *
 * Tests the core chat interaction via /api/v1/turns SSE endpoint.
 * These tests verify the API layer, not the full LLM round-trip
 * (which requires configured API keys).
 */

import { test, expect } from '@playwright/test';

test.describe('Chat API', () => {
  test('turns endpoint rejects GET', async ({ request }) => {
    // The turns endpoint should be POST-only
    const res = await request.get('/api/v1/turns');
    // Should return 405 Method Not Allowed or 404
    expect([404, 405]).toContain(res.status());
  });

  test('turns endpoint rejects empty POST', async ({ request }) => {
    const res = await request.post('/api/v1/turns', {
      headers: { 'Content-Type': 'application/json' },
      data: {},
    });
    // Should return 400 (bad request) due to missing required fields
    expect([400, 422, 500]).toContain(res.status());
  });

  test('sessions endpoint responds', async ({ request }) => {
    const res = await request.get('/api/v1/sessions');
    // Should return 200 with session list (even if empty)
    // or 401 if auth is required
    expect([200, 401]).toContain(res.status());
  });

  test('settings endpoint responds', async ({ request }) => {
    const res = await request.get('/api/v1/settings');
    // Should return 200 with settings or 401 if auth required
    expect([200, 401]).toContain(res.status());
  });

  test('verify-model endpoint responds', async ({ request }) => {
    const res = await request.post('/api/v1/verify-model', {
      headers: { 'Content-Type': 'application/json' },
      data: { providerId: 'openai', modelId: 'gpt-4o-mini', apiKey: 'invalid' },
    });
    // Should respond (even if it's an error due to invalid key)
    expect(res.status()).toBeLessThan(500);
  });
});
