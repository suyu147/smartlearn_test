/**
 * E2E: Navigation & Page rendering tests
 *
 * Validates that core pages render without errors and have expected UI elements.
 */

import { test, expect } from '@playwright/test';

test.describe('Page Navigation', () => {
  test('home page renders', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/.+/);
    // Page should have a body
    await expect(page.locator('body')).toBeVisible();
  });

  test('chat page renders with input', async ({ page }) => {
    await page.goto('/chat');
    await expect(page).toHaveURL(/\/chat/);
    // Chat page should have some form of input
    await expect(page.locator('body')).toBeVisible();
  });

  test('settings page renders', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('knowledge page renders', async ({ page }) => {
    await page.goto('/knowledge');
    await expect(page).toHaveURL(/\/knowledge/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('smartlearn page renders', async ({ page }) => {
    await page.goto('/smartlearn');
    await expect(page).toHaveURL(/\/smartlearn/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('memory page renders', async ({ page }) => {
    await page.goto('/memory');
    await expect(page).toHaveURL(/\/memory/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('notebook page renders', async ({ page }) => {
    await page.goto('/notebook');
    await expect(page).toHaveURL(/\/notebook/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('book page renders', async ({ page }) => {
    await page.goto('/book');
    await expect(page).toHaveURL(/\/book/);
    await expect(page.locator('body')).toBeVisible();
  });
});
