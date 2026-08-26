const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--window-size=1280,720'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('response', r => { if (r.status() >= 400) console.log('[404]', r.url()); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));

  await page.goto('http://localhost:8931/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !document.getElementById('skip').classList.contains('hidden')
       || document.getElementById('load-err').textContent.length > 0,
    { timeout: 60000 }
  );

  for (const [name, wait] of [['t2', 2000], ['t8', 6000], ['t14', 6000]]) {
    await new Promise(r => setTimeout(r, wait));
    const info = await page.evaluate(() => {
      const f = document.getElementById('fade');
      return {
        fadeOpacity: getComputedStyle(f).opacity,
        fadeOn: f.classList.contains('on'),
      };
    });
    console.log(name, JSON.stringify(info));
    await page.screenshot({ path: `probe_${name}.png` });
  }

  // 探索模式近景
  await page.evaluate(() => document.getElementById('skip').click());
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: 'probe_explore.png' });

  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
