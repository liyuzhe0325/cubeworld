import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

window.__booted = true;

/* ================= 可调参数 ================= */
const CFG = {
  glb: './assets/cubeworld_web.glb',
  camJson: './assets/web_camera.json',
  lightJson: './assets/web_lights.json',
  exposure: 1.12,
  sunIntensity: 2.6,        // DawnSun 平行光
  seaPathIntensity: 0.5,    // DawnSeaPath 海面反光平行光
  hemiIntensity: 0.55,      // FillSky 天光
  ambient: 0.22,
  envIntensity: 0.38,
  pointScale: 0.45,         // 点光能量换算
  exploreTarget: [0, 0.05, -0.45],
  minDist: 0.5,
  maxDist: 20,
};

/* ================= 热点文案 ================= */
const HOTSPOTS = [
  { match: n => n === 'Note' || n === 'NoteText_Quad', dotAt: 'Note',
    title: '信笺', dist: 0.30,
    text: '「愿被世界选中的间隙里，\n你仍给自己留一扇不关的窗。」\n\n生日快乐，奶奶！' },
  { match: n => n === 'Sketch_Sheet' || n === 'Sketch_DogInk', dotAt: 'Sketch_Sheet',
    title: '一幅小画', dist: 0.28,
    text: '纸上画着小狗、太阳和一颗心。\n愿您每天都有小小的、孩子气的快乐。' },
  { match: n => n === 'DriftBottle' || n.startsWith('BottleRope') || n === 'Cork' || n === 'InnerWater', dotAt: 'DriftBottle',
    title: '漂流瓶', dist: 0.38,
    text: '瓶子从很远的海漂来，\n装着一整艘帆船和一句祝福。' },
  { match: n => n.startsWith('Ship_'), dotAt: 'Ship_Hull',
    title: '瓶中帆船「乘风号」', dist: 0.34,
    text: '愿奶奶的日子，一帆风顺。' },
  { match: n => n === 'PorcelainRobot' || n.startsWith('Robot_'), dotAt: 'PorcelainRobot',
    title: '守夜小机器人', dist: 0.38,
    text: '它是这方世界的守夜人，\n替我们守着这片小小的海。' },
  { match: n => n.startsWith('Candle'), dotAt: 'Candle_Dish',
    title: '不灭的蜡烛', dist: 0.32,
    text: '这根蜡烛永远不会熄灭，\n就像我们对您的爱。' },
  { match: n => n.startsWith('Book_'), dotAt: 'Book_Back',
    title: '红皮书', dist: 0.34,
    text: '书里夹着一年四季，\n也夹着我们想对您说的话。' },
  { match: n => n.startsWith('SacredOak'), dotAt: 'SacredOak_MainTwistingTrunk', dotUp: 1.6,
    title: '悬崖上的神橡', dist: 2.4,
    text: '把根扎进石头缝里，向着光生长——\n像您一样，坚韧又温柔。' },
  { match: n => n.startsWith('LH_'), dotAt: 'LH_Polish_LampCore',
    title: '远处的灯塔', dist: 4.0,
    text: '不管多晚，总有一盏灯为您亮着。' },
];

/* ================= 不投影的物件 ================= */
const NO_CAST = new Set(['Vessel_Frame', 'CubeFrame', 'Glass_Shell', 'Sea_Surface', 'Sea_Water',
  'SeaFloor', 'NoteText_Quad', 'LH_Spray_Frozen', 'Picnic_Clearing', 'DriftBottle', 'InnerWater', 'Cork']);

/* ================= 全局 ================= */
const $ = id => document.getElementById(id);
const canvas = $('view');
let renderer, scene, camera, controls, clock;
let giftCam = null, mixer = null, camMeta = null;
let mode = 'loading'; // loading -> cg -> explore
let flame = null, candleLight = null, clouds = [], gulls = [];
let dots = [], dotsGroup = null;
let activeHotspot = null;

/* ================= 错误提示（无控制台也能看到） ================= */
function showError(msg) {
  const el = $('load-err');
  if (el) el.textContent += msg + '\n';
}
function setStage(txt) {
  const el = $('load-stage');
  if (el) el.textContent = txt;
}
window.addEventListener('error', e => showError('出错了: ' + e.message));
window.addEventListener('unhandledrejection', e => showError('出错了: ' + (e.reason && e.reason.message || e.reason)));

/* ================= 天空背景 ================= */
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 1024;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0.00, '#4a6b9d');
  grad.addColorStop(0.35, '#8d7fa8');
  grad.addColorStop(0.52, '#e0a184');
  grad.addColorStop(0.62, '#f5c9a0');
  grad.addColorStop(0.72, '#e8a97e');
  grad.addColorStop(1.00, '#33506e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 1024);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ================= 灯光重建 ================= */
function buildLights(data) {
  const dir = new THREE.Vector3();
  for (const L of data.lights) {
    const color = new THREE.Color(L.color[0], L.color[1], L.color[2]);
    if (L.type === 'SUN') {
      const sun = new THREE.DirectionalLight(color, CFG.sunIntensity);
      dir.set(L.direction[0], L.direction[1], L.direction[2]);
      sun.position.copy(dir.clone().multiplyScalar(-30));
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const s = 9;
      Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 5, far: 60 });
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.02;
      scene.add(sun, sun.target);
    } else if (L.type === 'POINT') {
      const p = new THREE.PointLight(color, L.energy * CFG.pointScale, 0, 2);
      p.position.set(L.location[0], L.location[1], L.location[2]);
      scene.add(p);
      if (L.name === 'CandleLight') candleLight = p;
    } else if (L.type === 'AREA') {
      if (L.name === 'FillSky') {
        scene.add(new THREE.HemisphereLight(new THREE.Color(0.62, 0.72, 0.9), new THREE.Color(0.45, 0.38, 0.3), CFG.hemiIntensity));
      } else if (L.name === 'DawnSeaPath') {
        const d = new THREE.DirectionalLight(color, CFG.seaPathIntensity);
        dir.set(L.direction[0], L.direction[1], L.direction[2]);
        d.position.copy(dir.clone().multiplyScalar(-25));
        scene.add(d, d.target);
      } else {
        const p = new THREE.PointLight(color, L.energy * CFG.pointScale * 0.8, 0, 2);
        p.position.set(L.location[0], L.location[1], L.location[2]);
        scene.add(p);
      }
    }
  }
  scene.add(new THREE.AmbientLight(0xfff2e0, CFG.ambient));
}

/* ================= 焦距 → 垂直FOV ================= */
let lensSamples = [[0, 40]], sensorW = 36;
function lensAt(t) {
  const s = lensSamples;
  if (t <= s[0][0]) return s[0][1];
  if (t >= s[s.length - 1][0]) return s[s.length - 1][1];
  for (let i = 1; i < s.length; i++) {
    if (s[i][0] >= t) {
      const [t0, l0] = s[i - 1], [t1, l1] = s[i];
      return l0 + (l1 - l0) * (t - t0) / (t1 - t0);
    }
  }
  return s[s.length - 1][1];
}
function applyLensFov(t) {
  const lens = lensAt(t);
  const hfov = 2 * Math.atan(sensorW / (2 * lens));
  const aspect = window.innerWidth / window.innerHeight;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect));
  camera.updateProjectionMatrix();
}

/* ================= 加载 ================= */
async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('加载失败: ' + url);
  return r.json();
}

async function init() {
  setStage('正在初始化渲染器…');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CFG.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(0xe8b48c, 25, 90);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.02, 300);
  camera.position.set(0, 0.5, 6);

  clock = new THREE.Clock();

  setStage('正在读取配置…');
  [camMeta] = await Promise.all([loadJSON(CFG.camJson)]);
  const lightsData = await loadJSON(CFG.lightJson);
  lensSamples = camMeta.lens_samples;
  sensorW = camMeta.sensor_width || 36;

  const manager = new THREE.LoadingManager();
  const draco = new DRACOLoader(manager).setDecoderPath('./vendor/three/addons/libs/draco/gltf/');
  const loader = new GLTFLoader(manager).setDRACOLoader(draco);

  setStage('正在下载模型…');
  const gltf = await loader.loadAsync(CFG.glb, e => {
    const mb = (e.loaded / 1048576).toFixed(1);
    if (e.total) {
      const pct = Math.round(e.loaded / e.total * 100);
      $('load-fill').style.width = pct + '%';
      $('load-pct').textContent = pct + '%';
      setStage(`正在下载模型… ${mb} MB`);
    } else {
      setStage(`正在下载模型… 已下载 ${mb} MB`);
    }
  });
  setStage('正在解析模型（Draco 解码）…');
  $('load-fill').style.width = '100%';
  $('load-pct').textContent = '100%';
  onLoaded(gltf, lightsData);
}

function onLoaded(gltf, lightsData) {
  scene.add(gltf.scene);

  // 环境反射（瓷器/玻璃质感）
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = CFG.envIntensity;

  buildLights(lightsData);

  // 阴影规则 + 收集动效对象
  gltf.scene.traverse(o => {
    if (o.isMesh) {
      o.castShadow = !NO_CAST.has(o.name) && !o.name.startsWith('Cloud') && !o.name.startsWith('Gull');
      o.receiveShadow = true;
      if (o.name === 'Candle_Flame') {
        o.material = o.material.clone();
        flame = o;
      }
    }
    if (o.name.startsWith('Cloud')) clouds.push(o);
    if (o.name.startsWith('Gull')) gulls.push(o);
  });

  // 相机与动画
  giftCam = gltf.scene.getObjectByName('GiftCam');
  if (giftCam && gltf.animations.length) {
    mixer = new THREE.AnimationMixer(giftCam);
    const action = mixer.clipAction(gltf.animations[0]);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.addEventListener('finished', enterExplore);
  }

  buildDots();
  startCG();
}

/* ================= CG 播放 ================= */
function startCG() {
  mode = 'cg';
  $('loading').classList.add('hidden');
  const fade = $('fade');
  fade.classList.add('on');
  setTimeout(() => fade.classList.remove('on'), 120);
  if (!mixer) { enterExplore(); return; }
  $('skip').classList.remove('hidden');
  $('skip').onclick = () => {
    mixer.setTime(gltfDuration() - 0.001);
    enterExplore();
  };
}
function gltfDuration() {
  return camMeta ? camMeta.duration : 26;
}

/* ================= 探索模式 ================= */
function enterExplore() {
  if (mode === 'explore') return;
  mode = 'explore';
  $('skip').classList.add('hidden');
  if (mixer) { mixer.stopAllAction(); mixer = null; }

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...CFG.exploreTarget);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = CFG.minDist;
  controls.maxDistance = CFG.maxDist;
  controls.maxPolarAngle = 1.52;
  controls.update();

  const hint = $('hint');
  hint.classList.remove('hidden');
  setTimeout(() => hint.classList.add('hidden'), 7000);
}

/* ================= 热点 ================= */
function findHotspot(obj) {
  let o = obj;
  while (o) {
    for (const h of HOTSPOTS) {
      if (h.match(o.name)) return { def: h, obj: o };
    }
    o = o.parent;
  }
  return null;
}

const raycaster = new THREE.Raycaster();
let downPos = null, downTime = 0;

canvas.addEventListener('pointerdown', e => {
  downPos = [e.clientX, e.clientY];
  downTime = performance.now();
});
canvas.addEventListener('pointerup', e => {
  if (mode !== 'explore' || !downPos) return;
  const dx = e.clientX - downPos[0], dy = e.clientY - downPos[1];
  downPos = null;
  if (dx * dx + dy * dy > 49 || performance.now() - downTime > 450) return;
  if (!$('caption').classList.contains('hidden')) return;

  const ndc = new THREE.Vector2(
    e.clientX / window.innerWidth * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  for (const hit of hits) {
    const found = findHotspot(hit.object);
    if (found) { openHotspot(found.def, found.obj); return; }
    // 非热点（玻璃罩、海面、云等）跳过继续找，不阻断
  }
});

function openHotspot(def, obj) {
  activeHotspot = def;
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const dirVec = camera.position.clone().sub(center).normalize();
  const dest = center.clone().add(dirVec.multiplyScalar(def.dist));
  dest.y = Math.max(dest.y, center.y - 0.05);
  gsap.to(camera.position, { x: dest.x, y: dest.y, z: dest.z, duration: 1.3, ease: 'power2.inOut' });
  gsap.to(controls.target, {
    x: center.x, y: center.y, z: center.z, duration: 1.3, ease: 'power2.inOut',
    onUpdate: () => controls.update(),
    onComplete: () => {
      $('cap-title').textContent = def.title;
      $('cap-text').textContent = def.text;
      $('caption').classList.remove('hidden');
    }
  });
  dimDots(true);
}

$('cap-close').onclick = closeCaption;
canvas.addEventListener('pointerdown', () => {
  if (!$('caption').classList.contains('hidden')) closeCaption();
});

function closeCaption() {
  $('caption').classList.add('hidden');
  activeHotspot = null;
  dimDots(false);
}

/* ================= 引导光点 ================= */
function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,235,200,1)');
  grad.addColorStop(0.4, 'rgba(255,210,150,.55)');
  grad.addColorStop(1, 'rgba(255,210,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildDots() {
  dotsGroup = new THREE.Group();
  const tex = makeDotTexture();
  HOTSPOTS.forEach((h, i) => {
    const target = scene.getObjectByName(h.dotAt);
    if (!target) return;
    const box = new THREE.Box3().setFromObject(target);
    const center = box.getCenter(new THREE.Vector3());
    center.y += (h.dotUp || 0.06);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.9 });
    const sp = new THREE.Sprite(mat);
    sp.renderOrder = 999;
    sp.position.copy(center);
    const base = h.dist > 1 ? 0.35 : 0.045;
    sp.scale.setScalar(base);
    sp.userData.base = base;
    sp.userData.phase = i * 1.3;
    dotsGroup.add(sp);
    dots.push(sp);
  });
  scene.add(dotsGroup);
}

function dimDots(dim) {
  dots.forEach(d => { d.material.opacity = dim ? 0.15 : 0.9; });
}

/* ================= 主循环 ================= */
let cgTime = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (mode === 'cg' && mixer) {
    mixer.update(dt);
    giftCam.updateWorldMatrix(true, false);
    giftCam.getWorldPosition(camera.position);
    giftCam.getWorldQuaternion(camera.quaternion);
    applyLensFov(mixer.time);
  } else if (controls) {
    controls.update();
  }

  // 烛光闪烁
  if (flame) {
    const f = 0.82 + 0.18 * (Math.sin(t * 11) * 0.5 + Math.sin(t * 23 + 1.7) * 0.35 + Math.sin(t * 41 + 0.5) * 0.15);
    flame.material.emissiveIntensity = 2.4 * f;
    if (candleLight) candleLight.intensity = 0.7 * CFG.pointScale * (0.8 + 0.4 * f);
  }
  // 云漂移
  for (const c of clouds) {
    c.position.x += dt * 0.02;
    if (c.position.x > 14) c.position.x = -14;
  }
  // 海鸥盘旋
  gulls.forEach((g, i) => {
    if (g.userData.cx === undefined) {
      g.userData.cx = g.position.x; g.userData.cz = g.position.z;
      g.userData.r = 0.6 + i * 0.25; g.userData.ph = i * 2.1;
    }
    const a = t * 0.35 + g.userData.ph;
    g.position.x = g.userData.cx + Math.cos(a) * g.userData.r;
    g.position.z = g.userData.cz + Math.sin(a) * g.userData.r;
    g.position.y += Math.sin(t * 1.7 + i) * 0.0006;
    g.rotation.y = -a;
  });
  // 引导光点呼吸
  if (dotsGroup && mode === 'explore') {
    for (const d of dots) {
      d.scale.setScalar(d.userData.base * (1 + 0.3 * Math.sin(t * 2.6 + d.userData.phase)));
    }
  }

  renderer.render(scene, camera);
}

/* ================= 窗口 ================= */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init().catch(e => showError('初始化失败: ' + e.message));
animate();
