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
  await page.waitForFunction(() => window.__scene, { timeout: 60000 });
  await page.evaluate(() => document.getElementById('skip').click());
  await new Promise(r => setTimeout(r, 2000));

  // 所有带自发光的材质
  const emissives = await page.evaluate(() => {
    const out = [];
    window.__scene.traverse(o => {
      if (o.isMesh && o.material && o.material.emissive) {
        const e = o.material.emissive;
        if (e.r + e.g + e.b > 0.01) {
          out.push(`${o.name}: emissive=${e.getHexString()} intensity=${o.material.emissiveIntensity}`);
        }
      }
    });
    return out;
  });
  console.log('EMISSIVES:\n' + emissives.join('\n'));

  // 相机先拉到一个固定视角（对着野餐区）
  await page.evaluate(() => {
    const cam = window.__camera; // 可能没暴露，备用
  });

  const groups = ['Sea_Surface', 'Sea_Water', 'Vessel_Frame', 'LH_Spray_Frozen', 'CliffFlowers'];
  for (const g of groups) {
    await page.evaluate(name => {
      window.__scene.traverse(o => { if (o.name === name || o.name.startsWith(name)) o.visible = false; });
    }, g);
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: `elim_${g}.png` });
  }

  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
