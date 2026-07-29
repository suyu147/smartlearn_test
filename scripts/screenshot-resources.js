const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
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

  // Now go to the resources page
  await page.goto('http://localhost:3001/resources', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.screenshot({
    path: path.join('D:\\python\\docment\\\\smartlearn', 'resources-screenshot.png'),
    fullPage: false,
  });

  // Click the first card (文档) to open the modal and screenshot that
  try {
    await page.click('button:has-text("文档")', { timeout: 5000 });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join('D:\\python\\docment\\smartlearn', 'resources-modal-screenshot.png'),
      fullPage: false,
    });
  } catch (e) {
    console.log('could not open modal:', e.message);
  }

  console.log('done');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
