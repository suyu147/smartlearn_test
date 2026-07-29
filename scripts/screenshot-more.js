const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 600 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const token = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1c2VyLTE3ODQzNjAyMzA4NzAtN2NnMmZnIiwidXNlcm5hbWUiOiJzY3JlZW5zaG90X3VzZXIiLCJyb2xlIjoidXNlciIsImlhdCI6MTc4NDM2MDIzMCwiZXhwIjoxNzg0OTY1MDMwLCJzdWIiOiJ1c2VyLTE3ODQzNjAyMzA4NzAtN2NnMmZnIn0.RAtACuvZ22W2W6QgrIbo1SoRQj0b63IgZXbBnPk6PXE';

  await page.goto('http://localhost:3001/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((t) => {
    localStorage.setItem('auth-jwt', t);
  }, token);

  await page.goto('http://localhost:3001/resources', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1500);

  // Open "更多" dropdown
  await page.click('button:has-text("更多")', { timeout: 5000 });
  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join('D:\\python\\docment\\smartlearn', 'resources-more-screenshot.png'),
    fullPage: false,
  });

  console.log('done');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
