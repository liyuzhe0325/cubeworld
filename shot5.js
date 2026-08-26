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
  await new Promise(r => setTimeout(r, 1500));

  // 1) 隐藏整个模型 → 只剩天空背景
  await page.evaluate(() => {
    window.__scene.traverse(o => { if (o.name === 'Scene' || o.type === 'Group') return; });
    // gltf.scene 是 __scene.children 里的 Scene 对象，直接隐藏它
    const gltfRoot = window.__scene.children.find(c => c.type === 'Group' || c.type === 'Object3D' || c.name === 'Scene');
    window.__gltfRoot = gltfRoot;
    if (gltfRoot) gltfRoot.visible = false;
  });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: 'sky_only.png' });

  // 2) 换回纯色背景
  await page.evaluate(() => {
    const THREE_Color = window.__scene.background && window.__scene.background.isTexture;
    window.__scene.background = null; // 先置空看清屏色
  });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: 'sky_null.png' });

  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
