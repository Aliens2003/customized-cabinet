import OpenSCAD from './vendor/openscad/openscad.js';

// Validate geometry parameters before running OpenSCAD in the browser.
const LIMITS = {
  width: [120, 256, 1],
  depth: [100, 256, 1],
  height: [100, 256, 1],
  wall: [2, 8, 1],
  hex_flat: [8, 18, 1],
  hex_web: [2, 4, 0.2],
  frame: [6, 22, 1],
  rail_projection: [2, 20, 0.5],
  rail_thickness: [1, 7, 0.5],
};

const scadUrl = new URL('../cabinet.scad', import.meta.url);
let scadText;

function report(text) {
  self.postMessage({ type: 'progress', text });
}

function design(data) {
  if (!data || Object.keys(data).length !== Object.keys(LIMITS).length) {
    throw new Error('导出参数不完整，请刷新页面后重试。');
  }
  for (const [key, [minimum, maximum, step]] of Object.entries(LIMITS)) {
    const value = data[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
      throw new Error(`参数超出范围：${key}`);
    }
    const units = (value - minimum) / step;
    if (Math.abs(units - Math.round(units)) > 1e-8) {
      throw new Error(`参数步长不正确：${key}`);
    }
  }
  if (data.frame < data.wall + 1) {
    throw new Error('边框宽度须至少等于顶板厚度。');
  }
  const growth = (data.height - 180) / 2;
  const drawerGrowth = growth - (data.wall - 4);
  return {
    ...data,
    top_thickness: data.wall + 1,
    upper_level: 90 + growth,
    face_height: 84 + drawerGrowth,
    tray_height: 78 + drawerGrowth,
  };
}

async function loadScad() {
  if (scadText !== undefined) return scadText;
  const response = await fetch(scadUrl);
  if (!response.ok) throw new Error('无法加载 cabinet.scad，请确认文件已随网站一起发布。');
  scadText = await response.text();
  return scadText;
}

async function render(settings, part, label) {
  report(`正在生成${label}…`);
  const scad = await loadScad();
  let stderr = '';
  const instance = await OpenSCAD({
    noInitialRun: true,
    print: () => {},
    printErr: (text) => { stderr += text; },
  });
  instance.FS.writeFile('/cabinet.scad', scad);
  const args = ['/cabinet.scad', '--backend', 'Manifold', '--export-format', 'binstl', '-o', '/out.stl'];
  for (const [key, value] of Object.entries(settings)) args.push('-D', `${key}=${value}`);
  args.push('-D', `part="${part}"`);
  const code = instance.callMain(args);
  if (code !== 0) {
    const detail = (stderr.match(/ERROR:.*$/m) || [])[0];
    throw new Error(detail || `OpenSCAD 退出码 ${code}，无法生成${label}。`);
  }
  let stl;
  try {
    stl = instance.FS.readFile('/out.stl');
  } catch {
    throw new Error(`OpenSCAD 未生成${label} STL。`);
  }
  return stl;
}

function validateStl(data, expected) {
  if (data.length < 84) throw new Error('OpenSCAD 未生成完整的二进制 STL。');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const triangles = view.getUint32(80, true);
  if (!triangles || data.length !== 84 + 50 * triangles) {
    throw new Error('OpenSCAD 未生成完整的二进制 STL。');
  }
  const parents = new Int32Array(triangles);
  for (let index = 0; index < triangles; index++) parents[index] = index;
  const root = (index) => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const edges = new Map();
  const mins = [Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity];
  for (let triangle = 0; triangle < triangles; triangle++) {
    const points = [];
    for (let corner = 0; corner < 3; corner++) {
      const base = 84 + triangle * 50 + 12 + corner * 12;
      const point = [
        view.getFloat32(base, true),
        view.getFloat32(base + 4, true),
        view.getFloat32(base + 8, true),
      ];
      if (!point.every(Number.isFinite)) throw new Error('STL 含有无效三角面。');
      points.push(point);
      for (let axis = 0; axis < 3; axis++) {
        mins[axis] = Math.min(mins[axis], point[axis]);
        maxs[axis] = Math.max(maxs[axis], point[axis]);
      }
    }
    const [a, b, c] = points;
    if (samePoint(a, b) || samePoint(b, c) || samePoint(a, c)) {
      throw new Error('STL 含有无效三角面。');
    }
    for (const [start, end] of [[a, b], [b, c], [c, a]]) {
      const key = edgeKey(start, end);
      if (!edges.has(key)) {
        edges.set(key, { triangle, start });
        continue;
      }
      const previous = edges.get(key);
      if (previous === null || samePoint(previous.start, start)) {
        throw new Error('STL 含有非流形边或面朝向错误。');
      }
      parents[root(triangle)] = root(previous.triangle);
      edges.set(key, null);
    }
  }
  for (const value of edges.values()) {
    if (value !== null) throw new Error('STL 未形成一个封闭连通实体。');
  }
  const first = root(0);
  for (let index = 1; index < triangles; index++) {
    if (root(index) !== first) throw new Error('STL 未形成一个封闭连通实体。');
  }
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(mins[axis]) > 0.02 || Math.abs(maxs[axis] - mins[axis] - expected[axis]) > 0.02) {
      throw new Error('STL 尺寸或落板位置与参数不符。');
    }
  }
}

function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function edgeKey(a, b) {
  const [first, second] = comparePoint(a, b) <= 0 ? [a, b] : [b, a];
  return `${first[0]},${first[1]},${first[2]}|${second[0]},${second[1]},${second[2]}`;
}

function comparePoint(a, b) {
  for (let axis = 0; axis < 3; axis++) {
    if (a[axis] !== b[axis]) return a[axis] < b[axis] ? -1 : 1;
  }
  return 0;
}

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index++) {
    crc = crcTable[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);
    chunks.push(header, data);

    const entry = new Uint8Array(46 + nameBytes.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(4, 20, true);
    entryView.setUint16(6, 20, true);
    entryView.setUint16(8, 0, true);
    entryView.setUint16(10, 0, true);
    entryView.setUint16(12, time, true);
    entryView.setUint16(14, date, true);
    entryView.setUint32(16, crc, true);
    entryView.setUint32(20, data.length, true);
    entryView.setUint32(24, data.length, true);
    entryView.setUint16(28, nameBytes.length, true);
    entryView.setUint32(42, offset, true);
    entry.set(nameBytes, 46);
    central.push(entry);

    offset += header.length + data.length;
  }
  const centralSize = central.reduce((total, entry) => total + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const total = chunks.reduce((size, chunk) => size + chunk.length, 0)
    + centralSize + end.length;
  const zip = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of [...chunks, ...central, end]) {
    zip.set(chunk, cursor);
    cursor += chunk.length;
  }
  return zip;
}

self.addEventListener('message', async ({ data }) => {
  try {
    const settings = design(data.settings);
    report('正在加载 OpenSCAD 引擎…');
    const shell = await render(settings, 'shell_print', '外壳');
    validateStl(shell, [settings.width, settings.height, settings.depth]);
    const drawer = await render(settings, 'drawer', '抽屉');
    validateStl(drawer, [
      settings.width - 2 * (settings.wall + 1),
      settings.depth - settings.wall - 2,
      settings.face_height,
    ]);
    report('正在打包 ZIP…');
    const zip = zipStore([
      { name: 'cabinet-shell.stl', data: shell },
      { name: 'cabinet-drawer.stl', data: drawer },
    ]);
    self.postMessage({ ok: true, zip }, [zip.buffer]);
  } catch (error) {
    self.postMessage({ ok: false, message: error?.message || '导出失败，请重试。' });
  }
});
