import { plaBasicColors } from './pla-basic.js';
import * as THREE from 'three';
import { OrbitControls } from './vendor/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from './vendor/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/examples/jsm/libs/meshopt_decoder.module.js';
import { verticalLayout as calculateLayout, railLimits, gripLayout } from './geometry-parameters.js';

const byId = (id) => document.getElementById(id);
const stage = byId('stage');
const source = byId('source');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e8eeed');
const camera = new THREE.PerspectiveCamera(34, 1, 1, 4000);
const cabinet = new THREE.Group();
cabinet.rotation.x = -Math.PI / 2; // CAD Z-up to Three.js Y-up.
scene.add(cabinet);

const shellMaterial = new THREE.MeshStandardMaterial({ roughness: 0.82 });
const drawerMaterial = new THREE.MeshStandardMaterial({ roughness: 0.74 });
const originalWall = 4;
const rearClearance = 2;
const railSetback = 5;
const originalUpperLevel = 90;
const originalTrayHeight = 78;
// Match cabinet.scad: leave at least 1 mm above the lower tray.
const maxRailThickness = originalUpperLevel - originalWall - originalTrayHeight - 1;
const dimensions = [
  ['width', '宽度', 250, 30, 256, 1],
  ['depth', '深度', 235, 30, 256, 1],
  ['height', '高度', 180, 30, 256, 1],
  ['wall', '柜体壁厚', originalWall, 2, 8, 1],
  ['hex_flat', '孔对边', 12, 8, 18, 1],
  ['hex_web', '蜂窝筋宽', 2.4, 2, 4, 0.2],
  ['frame', '周边框宽', 10, 6, 22, 1],
  ['rail_projection', '伸出宽度', 8, 2, 20, 0.5],
  ['rail_thickness', '截面高度', 3, 1, maxRailThickness, 0.5],
];
const defaultTravel = dimensions[1][2] - originalWall - rearClearance;
const pulls = [
  ['upper', '上层', 0, 0, defaultTravel, 1],
  ['lower', '下层', 60, 0, defaultTravel, 1],
];
const defaults = Object.fromEntries([...dimensions, ...pulls].map(([id, , value]) => [id, value]));
const values = { ...defaults };
const colorDefaults = { shellColor: '10100', drawerColor: '10103' };
const colorsByCode = new Map(plaBasicColors.map(([code, , hex]) => [code, hex]));
const drawerDepth = () => values.depth - values.wall - rearClearance;
// Preserve the 1 mm reinforcement on the top panel.
const topThickness = () => values.wall + 1;
function verticalLayout() {
  return calculateLayout(values);
}
const trayWall = 2.4;
const floor = 2.4;
const face = 3;
const sideClearance = 1;
const fields = new Map();
const viewDirections = {
  iso: [1, 0.76, 1.24], front: [0, 0, 1], side: [1, 0, 0], top: [0, 1, 0.00001],
};
let shell, upper, lower, originals, renderer, controls;
let exploded = false;
let view = 'iso';
let rebuildFrame = 0;
let framedDimensions = '';

function rectangle(width, height) {
  return [[0, 0], [width, 0], [width, height], [0, height]];
}
function trace(path, points) {
  points.forEach(([x, y], index) => index ? path.lineTo(x, y) : path.moveTo(x, y));
  path.closePath();
  return path;
}
function extrusion(shape, thickness) {
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
}
function box(group, material, width, depth, height, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, depth, height), material);
  mesh.position.set(x + width / 2, y + depth / 2, z + height / 2);
  group.add(mesh);
}

function clipHorizontal(points, boundary, keepBelow) {
  const output = [];
  const inside = ([, y]) => keepBelow ? y <= boundary : y >= boundary;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (inside(a)) output.push(a);
    if (inside(a) !== inside(b)) {
      const t = (boundary - a[1]) / (b[1] - a[1]);
      output.push([a[0] + (b[0] - a[0]) * t, boundary]);
    }
  }
  return output;
}
function panel(width, height, thickness, side = false) {
  const { upperLevel } = verticalLayout();
  const { frame, hex_flat: flat, hex_web: web } = values;
  const shape = trace(new THREE.Shape(), rectangle(width, height));
  const radius = flat / Math.sqrt(3);
  const dx = flat + web;
  const dy = dx * Math.sqrt(3) / 2;
  const rows = Math.floor((height - 2 * frame - 2 * radius) / dy) + 1;
  const columns = Math.ceil((width - 2 * frame) / dx);
  const vertices = Array.from({ length: 6 }, (_, i) => {
    const angle = (30 + 60 * i) * Math.PI / 180;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
  for (let row = 0; row < rows; row++) {
    const cy = height / 2 + (row - (rows - 1) / 2) * dy;
    for (let col = -columns; col <= columns; col++) {
      const cx = width / 2 + (col + (row % 2) / 2) * dx;
      if (cx - flat / 2 < frame || cx + flat / 2 > width - frame) continue;
      const points = vertices.map(([x, y]) => [cx + x, cy + y]);
      // Preserve the rail attachment strip, including holes only partly covered by it.
      const holes = side ? [
        clipHorizontal(points, upperLevel - values.rail_thickness - 1.2, true),
        clipHorizontal(points, upperLevel + 1.2, false),
      ] : [points];
      for (const hole of holes) {
        if (hole.length >= 3) shape.holes.push(trace(new THREE.Path(), hole));
      }
    }
  }
  return new THREE.Mesh(extrusion(shape, thickness), shellMaterial);
}

function parametricShell() {
  const { upperLevel } = verticalLayout();
  const { width, depth, height, wall, rail_projection: railProjection, rail_thickness: railThickness } = values;
  const group = new THREE.Group();
  const bottom = panel(width, depth, wall);
  const top = panel(width, depth, topThickness());
  top.position.z = height - topThickness();
  const back = panel(width, height, wall);
  back.rotation.x = Math.PI / 2;
  back.position.y = depth;
  group.add(bottom, top, back);
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0),
  );
  for (const x of [0, width - wall]) {
    const side = panel(depth, height, wall, true);
    side.setRotationFromMatrix(basis);
    side.position.x = x;
    group.add(side);
  }
  for (const x of [wall, width - wall - railProjection]) {
    box(group, shellMaterial, railProjection, depth - wall - railSetback, railThickness, x, railSetback, upperLevel - railThickness);
  }
  return group;
}
function parametricDrawer() {
  const { faceHeight, trayHeight } = verticalLayout();
  const width = values.width - 2 * (values.wall + sideClearance);
  const depth = drawerDepth();
  const group = new THREE.Group();
  // The rounded grip extends above the SCAD face, leaving an open notch.
  const { left, right, radius, bottom } = gripLayout(width, faceHeight);
  const front = new THREE.Shape();
  front.moveTo(0, 0);
  front.lineTo(width, 0);
  front.lineTo(width, faceHeight);
  front.lineTo(right + radius, faceHeight);
  front.lineTo(right + radius, bottom);
  front.absarc(right, bottom, radius, 0, -Math.PI / 2, true);
  front.lineTo(left, bottom - radius);
  front.absarc(left, bottom, radius, -Math.PI / 2, -Math.PI, true);
  front.lineTo(left - radius, faceHeight);
  front.lineTo(0, faceHeight);
  front.closePath();
  const frontMesh = new THREE.Mesh(extrusion(front, face), drawerMaterial);
  frontMesh.rotation.x = Math.PI / 2;
  frontMesh.position.y = face;
  group.add(frontMesh);
  box(group, drawerMaterial, width, depth - face, floor, 0, face, 0);
  for (const x of [0, width - trayWall]) {
    box(group, drawerMaterial, trayWall, depth - face - trayWall, trayHeight - floor, x, face, floor);
  }
  box(group, drawerMaterial, width, trayWall, trayHeight - floor, 0, depth - trayWall, floor);
  return group;
}

function placeDrawers() {
  const { upperLevel } = verticalLayout();
  const x = values.wall + sideClearance;
  const offset = values.depth + 24;
  upper.position.set(x, exploded ? -offset : -values.upper, upperLevel + (exploded ? 40 : 0));
  lower.position.set(x, exploded ? -offset : -values.lower, values.wall);
}
function syncFrameLimit() {
  // Keep the panel borders solid where the shell panels meet.
  const minimum = Math.max(6, topThickness());
  values.frame = Math.max(minimum, values.frame);
  for (const input of fields.get('frame')) {
    input.min = minimum;
    input.value = values.frame;
  }
}
function syncRailLimits() {
  const limits = railLimits(values);
  for (const [id, max] of [['rail_projection', limits.projection], ['rail_thickness', limits.thickness]]) {
    values[id] = Math.min(values[id], max);
    for (const input of fields.get(id)) {
      input.max = max;
      input.value = values[id];
    }
  }
}
function syncTravelLimits() {
  const maximum = drawerDepth();
  for (const [id] of pulls) {
    values[id] = Math.min(values[id], maximum);
    for (const input of fields.get(id)) {
      input.max = maximum;
      input.value = values[id];
    }
  }
  byId('travel-note').textContent = `完全取出 ${maximum} mm · 上层在 ${maximum - railSetback} mm 脱离滑轨`;
}

function syncColors() {
  for (const [id, material] of [['shellColor', shellMaterial], ['drawerColor', drawerMaterial]]) {
    const select = byId(id);
    const hex = colorsByCode.get(select.value);
    material.color.set(hex);
    select.previousElementSibling.style.backgroundColor = hex;
  }
}
function rebuild() {
  const dispose = new Set();
  cabinet.traverse((part) => {
    if (part.geometry && part.geometry !== originals?.shell && part.geometry !== originals?.drawer) {
      dispose.add(part.geometry);
    }
  });
  cabinet.clear();
  for (const geometry of dispose) geometry.dispose();
  syncFrameLimit();
  syncRailLimits();
  const useSTL = originals && dimensions.every(([id]) => values[id] === defaults[id]);
  shell = useSTL ? new THREE.Mesh(originals.shell, shellMaterial) : parametricShell();
  upper = useSTL ? new THREE.Mesh(originals.drawer, drawerMaterial) : parametricDrawer();
  lower = upper.clone();
  cabinet.add(shell, upper, lower);
  syncTravelLimits();
  placeDrawers();
  syncColors();
  byId('dimensions').value = [values.width, values.depth, values.height].join(' × ');
  source.textContent = useSTL ? '原始模型 · 装配预览' : '参数化预览 · 尚未切片';
  const sizeKey = [values.width, values.depth, values.height].join(',');
  if (sizeKey !== framedDimensions && controls) {
    framedDimensions = sizeKey;
    setView(view);
  }
}

function setView(name) {
  view = name;
  const bounds = new THREE.Box3().setFromObject(cabinet);
  const target = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const vertical = Math.tan(fov / 2);
  const distance = size.length() / (2 * vertical * Math.min(1, camera.aspect)) * 1.15;
  controls.target.copy(target);
  camera.position.copy(target).addScaledVector(new THREE.Vector3(...viewDirections[name]).normalize(), distance);
  controls.update();
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.view === name);
  });
}

function updateParameter(id, value, geometry) {
  values[id] = value;
  for (const field of fields.get(id)) field.value = value;
  if (geometry) {
    syncFrameLimit();
    syncRailLimits();
    if (id === 'depth' || id === 'wall') syncTravelLimits();
    cancelAnimationFrame(rebuildFrame);
    rebuildFrame = requestAnimationFrame(rebuild);
  } else {
    exploded = false;
    byId('exploded').setAttribute('aria-pressed', 'false');
    placeDrawers();
  }
}
function addControls(definitions, container, geometry) {
  for (const [id, label, value, min, max, step] of definitions) {
    const row = document.createElement('div');
    row.className = 'control';
    row.innerHTML = `<label for="${id}-number">${label}</label>
      <input aria-label="${label}（毫米）" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
      <input id="${id}-number" type="number" min="${min}" max="${max}" step="${step}" value="${value}">`;
    const [slider, number] = row.querySelectorAll('input');
    fields.set(id, [slider, number]);
    slider.addEventListener('input', () => updateParameter(id, slider.valueAsNumber, geometry));
    number.addEventListener('change', () => {
      const parsed = number.valueAsNumber;
      const minimum = Number(number.min);
      const clamped = THREE.MathUtils.clamp(Number.isFinite(parsed) ? parsed : values[id], minimum, Number(number.max));
      const snapped = Number((minimum + Math.round((clamped - minimum) / step) * step).toFixed(2));
      updateParameter(id, snapped, geometry);
    });
    byId(container).append(row);
  }
}

let exportWorker;

function exportArchive(settings, status) {
  exportWorker ??= new Worker('./export-worker.js', { type: 'module' });
  const worker = exportWorker;
  return new Promise((resolve, reject) => {
    const onMessage = ({ data }) => {
      if (data.type === 'progress') {
        status.textContent = data.text;
        return;
      }
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      if (data.ok) resolve(data.zip);
      else reject(new Error(data.message));
    };
    const onError = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.terminate();
      exportWorker = undefined;
      reject(new Error('导出引擎加载失败，请刷新页面后重试。'));
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ settings });
  });
}

async function downloadSTL() {
  const button = byId('export-stl');
  const status = byId('export-status');
  // Snapshot geometry so later edits cannot change this export.
  const settings = Object.fromEntries(dimensions.map(([id]) => [id, values[id]]));
  const size = [settings.width, settings.depth, settings.height].join('x');
  button.disabled = true;
  status.textContent = `正在准备 ${size} mm 的外壳和抽屉，首次导出需下载约 11 MB 引擎…`;
  try {
    const archive = await exportArchive(settings, status);
    const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `cabinet-${size}-stl.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = `已生成 ${size} mm STL。解压后导入 Bambu Studio，抽屉复制成 2 件。`;
  } catch (error) {
    status.textContent = `导出失败：${error.message}`;
  } finally {
    button.disabled = false;
  }
}

function previewGeometry(mesh) {
  const geometry = mesh.geometry.clone();
  // Meshopt stores quantized positions. Expand before applying millimeter transforms.
  for (const name of ['position', 'normal']) {
    const attribute = geometry.getAttribute(name);
    const array = new Float32Array(attribute.count * 3);
    for (let index = 0; index < attribute.count; index++) {
      array[index * 3] = attribute.getX(index);
      array[index * 3 + 1] = attribute.getY(index);
      array[index * 3 + 2] = attribute.getZ(index);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(array, 3));
  }
  return geometry.applyMatrix4(mesh.matrixWorld);
}

async function start() {
  addControls(pulls, 'travel', false);
  for (const [id, defaultCode] of Object.entries(colorDefaults)) {
    const select = byId(id);
    for (const [code, name] of plaBasicColors) {
      select.add(new Option(`${name} · ${code}`, code, code === defaultCode));
    }
    select.value = defaultCode;
    select.addEventListener('change', syncColors);
  }
  addControls(dimensions.slice(0, 4), 'size', true);
  addControls(dimensions.slice(4, 7), 'lattice', true);
  addControls(dimensions.slice(7), 'rails', true);
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (error) {
    source.textContent = '无法启动 WebGL 2，请检查浏览器的图形加速设置';
    console.error(error);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  stage.append(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 70;
  controls.maxDistance = 2100;
  scene.add(new THREE.HemisphereLight('#ffffff', '#a3b2bc', 2.05));
  for (const [x, y, z, brightness] of [[-300, 450, 420, 2.0], [250, 220, -340, 1.1]]) {
    const light = new THREE.DirectionalLight('#fffaf1', brightness);
    light.position.set(x, y, z);
    scene.add(light);
  }
  const grid = new THREE.GridHelper(1300, 65, '#a4b9be', '#cdd9da');
  grid.position.set(125, -0.5, -95);
  scene.add(grid);
  const refreshSize = () => {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  refreshSize();
  new ResizeObserver(refreshSize).observe(stage);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  try {
    const gltf = await loader.loadAsync('../previews/defaults.glb');
    gltf.scene.updateMatrixWorld(true);
    const shellMesh = gltf.scene.getObjectByName('shell');
    const drawerMesh = gltf.scene.getObjectByName('drawer');
    const shell = previewGeometry(shellMesh);
    const drawer = previewGeometry(drawerMesh);
    gltf.scene.traverse((object) => {
      object.geometry?.dispose();
      if (object.material) object.material.dispose();
    });
    // The source shell was exported back-down for printing.
    shell.translate(0, 0, -defaults.depth);
    shell.rotateX(Math.PI / 2);
    originals = { shell, drawer };
  } catch (error) {
    console.warn('Compressed preview could not be loaded. Showing parametric geometry.', error);
  }
  rebuild();
  setView('iso');
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
  byId('params').addEventListener('submit', (event) => event.preventDefault());
  byId('fields').disabled = false;
  byId('reset').disabled = false;
  byId('export-stl').disabled = false;
  byId('export-stl').addEventListener('click', downloadSTL);
  byId('closed').addEventListener('click', () => {
    updateParameter('upper', 0, false);
    updateParameter('lower', 0, false);
  });
  byId('exploded').addEventListener('click', () => {
    exploded = !exploded;
    byId('exploded').setAttribute('aria-pressed', String(exploded));
    placeDrawers();
    setView(view);
  });
  byId('reset').addEventListener('click', () => {
    cancelAnimationFrame(rebuildFrame);
    Object.assign(values, defaults);
    for (const [id, inputs] of fields) for (const input of inputs) input.value = values[id];
    for (const [id, code] of Object.entries(colorDefaults)) byId(id).value = code;
    exploded = false;
    byId('exploded').setAttribute('aria-pressed', 'false');
    rebuild();
    setView('iso');
  });
}

start().catch((error) => {
  source.textContent = '预览初始化失败，请刷新页面重试';
  console.error(error);
});


