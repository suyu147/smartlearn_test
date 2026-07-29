import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 测试配置
 *
 * 运行方式:
 *   npx playwright test          — 无头模式运行全部测试
 *   npx playwright test --ui     — 打开 Playwright UI 模式
 *   npx playwright test --debug  — 调试模式
 *   npx playwright test --project=chromium  — 仅 Chromium
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  /* 全局超时: 每个测试 30s */
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    /* 测试基准 URL — Next.js 默认 3000 */
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* 运行测试前自动启动 dev server */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
