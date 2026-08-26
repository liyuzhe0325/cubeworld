const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--window-size=1280,720'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', e => console.log('[pageerror]', e.message));

  await page.goto('http://localhost:8931/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__renderer, { timeout: 60000 });
  await page.evaluate(() => document.getElementById('skip').click());
  await new Promise(r => setTimeout(r, 1500));

  for (const exp of [1.0, 0.65, 0.45, 0.3]) {
    await page.evaluate(e => { window.__renderer.toneMappingExposure = e; }, exp);
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: `sweep_${String(exp).replace('.', '')}.png` });
  }

  // 灯光清单
  const lights = await page.evaluate(() => {
    const out = [];
    window.__scene.traverse(o => {
      if (o.isLight) out.push(`${o.type} "${o.name}" intensity=${o.intensity.toFixed(2)}`);
    });
    return out;
  });
  console.log(lights.join('\n'));

  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
