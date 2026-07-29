const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1600 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Pre-seed the API token so initAuth can pick it up from localStorage.
  const token = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1c2VyLTE3ODQzNjAyMzA4NzAtN2NnMmZnIiwidXNlcm5hbWUiOiJzY3JlZW5zaG90X3VzZXIiLCJyb2xlIjoidXNlciIsImlhdCI6MTc4NDM2MDIzMCwiZXhwIjoxNzg0OTY1MDMwLCJzdWIiOiJ1c2VyLTE3ODQzNjAyMzA4NzAtN2NnMmZnIn0.RAtACuvZ22W2W6QgrIbo1SoRQj0b63IgZXbBnPk6PXE';

  // Visit any page first so we can seed localStorage
  await page.goto('http://localhost:3001/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((t) => {
    localStorage.setItem('auth-jwt', t);
  }, token);

  // Reload now that the token is in place
  await page.goto('http://localhost:3001/smartlearn', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({
    path: path.join('D:\\python\\docment\\smartlearn', 'smartlearn-screenshot.png'),
    fullPage: false,
  });
  await page.screenshot({
    path: path.join('D:\\python\\docment\\smartlearn', 'smartlearn-screenshot-full.png'),
    fullPage: true,
  });
  console.log('done');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
