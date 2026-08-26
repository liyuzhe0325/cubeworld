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
  await new Promise(r => setTimeout(r, 2500));

  // 云/玻璃的材质信息
  const matInfo = await page.evaluate(() => {
    const out = [];
    window.__scene.traverse(o => {
      if (o.isMesh && (o.name.startsWith('Cloud') || o.name === 'Glass_Shell') && out.length < 6) {
        const m = o.material;
        out.push({
          name: o.name, type: m.type,
          color: m.color ? m.color.getHexString() : null,
          emissive: m.emissive ? m.emissive.getHexString() : null,
          emissiveIntensity: m.emissiveIntensity,
          opacity: m.opacity, transparent: m.transparent,
          transmission: m.transmission,
        });
      }
    });
    return out;
  });
  console.log(JSON.stringify(matInfo, null, 1));

  const shot = async name => { await new Promise(r => setTimeout(r, 400)); await page.screenshot({ path: name }); };
  await shot('ab_base.png');

  await page.evaluate(() => window.__scene.traverse(o => { if (o.name.startsWith('Cloud')) o.visible = false; }));
  await shot('ab_nocloud.png');

  await page.evaluate(() => window.__scene.traverse(o => { if (o.name === 'Glass_Shell') o.visible = false; }));
  await shot('ab_nocloud_noglass.png');

  await page.evaluate(() => window.__scene.traverse(o => { if (o.name.startsWith('Cloud') || o.name === 'Glass_Shell') o.visible = true; }));
  await page.evaluate(() => window.__scene.traverse(o => { if (o.name === 'Glass_Shell') o.visible = false; }));
  await shot('ab_noglass.png');

  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
