import * as THREE from 'three';

/**
 * Shared Flower Atlas Configuration & Botanical Sprites Generator
 * Generates an offscreen Canvas 2D texture atlas with 6 distinct floral types:
 * 0: Five-petal blossom (soft pink/rose)
 * 1: Many-petal Marigold head (traditional Indian Genda)
 * 2: Single drifting petal (teardrop blush petal)
 * 3: Small floral bud with calyx
 * 4: Tiny sage-green leaf with spine
 * 5: Jasmine / Mogra star flower (auspicious ivory & gold)
 *
 * Each sprite has a soft radial gradient and a thin subtle darker edge to
 * guarantee crisp visibility and contrast against the cream #faf8f5 background.
 */
export const ATLAS_CONFIG = {
  cols: 3,
  rows: 2,
  size: 1024,
  customTextureUrl: null, // Swap with custom PNG/SVG sprites through this entry
  palette: [
    '#e8a33d', // marigold orange
    '#d9822b', // deep marigold
    '#e8a0a8', // rose pink
    '#f4c9c6', // blush
    '#fffaf0', // jasmine ivory
    '#b8975a', // gold accent
    '#a9b79a', // sage green
  ]
};

let cachedTexture = null;

export function getSharedFlowerAtlas(userConfig = {}) {
  const cfg = { ...ATLAS_CONFIG, ...userConfig };

  if (cfg.customTextureUrl) {
    const loader = new THREE.TextureLoader();
    const texture = loader.load(cfg.customTextureUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    return { texture, cols: cfg.cols, rows: cfg.rows, totalTypes: cfg.cols * cfg.rows };
  }

  if (cachedTexture) {
    return { texture: cachedTexture, cols: cfg.cols, rows: cfg.rows, totalTypes: cfg.cols * cfg.rows };
  }

  const canvas = document.createElement('canvas');
  canvas.width = cfg.size;
  canvas.height = cfg.size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cellW = canvas.width / cfg.cols;
  const cellH = canvas.height / cfg.rows;

  // Cell 0: Five-petal blossom (col 0, row 0)
  drawBlossom(ctx, 0 * cellW + cellW * 0.5, 0 * cellH + cellH * 0.5, cellW * 0.42);

  // Cell 1: Marigold head (col 1, row 0)
  drawMarigold(ctx, 1 * cellW + cellW * 0.5, 0 * cellH + cellH * 0.5, cellW * 0.44);

  // Cell 2: Single drifting petal (col 2, row 0)
  drawSinglePetal(ctx, 2 * cellW + cellW * 0.5, 0 * cellH + cellH * 0.5, cellW * 0.38);

  // Cell 3: Small floral bud with calyx (col 0, row 1)
  drawBud(ctx, 0 * cellW + cellW * 0.5, 1 * cellH + cellH * 0.5, cellW * 0.36);

  // Cell 4: Tiny sage-green leaf (col 1, row 1)
  drawLeaf(ctx, 1 * cellW + cellW * 0.5, 1 * cellH + cellH * 0.5, cellW * 0.40);

  // Cell 5: Jasmine / Mogra star head (col 2, row 1)
  drawJasmine(ctx, 2 * cellW + cellW * 0.5, 1 * cellH + cellH * 0.5, cellW * 0.42);

  cachedTexture = new THREE.CanvasTexture(canvas);
  cachedTexture.colorSpace = THREE.SRGBColorSpace;
  cachedTexture.minFilter = THREE.LinearMipmapLinearFilter;
  cachedTexture.magFilter = THREE.LinearFilter;
  cachedTexture.generateMipmaps = true;
  cachedTexture.needsUpdate = true;

  return { texture: cachedTexture, cols: cfg.cols, rows: cfg.rows, totalTypes: cfg.cols * cfg.rows };
}

function drawBlossom(ctx, cx, cy, r) {
  ctx.save();
  const petalCount = 5;
  for (let i = 0; i < petalCount; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i * 2 * Math.PI) / petalCount - Math.PI / 2);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-r * 0.35, -r * 0.3, -r * 0.5, -r * 0.85, 0, -r);
    ctx.bezierCurveTo(r * 0.5, -r * 0.85, r * 0.35, -r * 0.3, 0, 0);

    const grad = ctx.createRadialGradient(0, -r * 0.5, 2, 0, -r * 0.5, r * 0.8);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, '#fff5f3');
    grad.addColorStop(0.85, '#e8a0a8');
    grad.addColorStop(1.0, '#c77d88');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(180, 100, 110, 0.45)';
    ctx.lineWidth = Math.max(2, r * 0.035);
    ctx.stroke();
    ctx.restore();
  }

  // Center Pistil
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
  const centerGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, r * 0.18);
  centerGrad.addColorStop(0, '#ffeaa7');
  centerGrad.addColorStop(0.5, '#e8a33d');
  centerGrad.addColorStop(1, '#b8975a');
  ctx.fillStyle = centerGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(140, 90, 30, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Golden stamen dots
  for (let s = 0; s < 8; s++) {
    const angle = (s * Math.PI * 2) / 8;
    const sx = cx + Math.cos(angle) * (r * 0.12);
    const sy = cy + Math.sin(angle) * (r * 0.12);
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.025, 0, Math.PI * 2);
    ctx.fillStyle = '#b8975a';
    ctx.fill();
  }
  ctx.restore();
}

function drawMarigold(ctx, cx, cy, r) {
  ctx.save();
  // Layer 1: Outer ruffled petals (20)
  drawMarigoldLayer(ctx, cx, cy, 20, r * 0.95, r * 0.19, '#e8a33d', '#f5b041', 'rgba(165, 75, 20, 0.45)');
  // Layer 2: Middle ruffled petals (16)
  drawMarigoldLayer(ctx, cx, cy, 16, r * 0.72, r * 0.16, '#d9822b', '#e8a33d', 'rgba(150, 65, 15, 0.45)');
  // Layer 3: Inner ruffled petals (12)
  drawMarigoldLayer(ctx, cx, cy, 12, r * 0.48, r * 0.14, '#b35d1e', '#d9822b', 'rgba(130, 50, 10, 0.45)');

  // Dense center tuft
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  const coreGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r * 0.22);
  coreGrad.addColorStop(0, '#f9ca24');
  coreGrad.addColorStop(0.5, '#e67e22');
  coreGrad.addColorStop(1, '#d35400');
  ctx.fillStyle = coreGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(140, 60, 15, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawMarigoldLayer(ctx, cx, cy, count, len, pw, colorInner, colorOuter, strokeColor) {
  for (let i = 0; i < count; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i * 2 * Math.PI) / count);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-pw, -len * 0.3, -pw * 1.15, -len * 0.8, -pw * 0.35, -len);
    ctx.bezierCurveTo(0, -len * 0.95, pw * 0.35, -len, pw * 1.15, -len * 0.8);
    ctx.bezierCurveTo(pw, -len * 0.3, 0, 0, 0, 0);

    const grad = ctx.createLinearGradient(0, 0, 0, -len);
    grad.addColorStop(0, colorInner);
    grad.addColorStop(0.7, colorOuter);
    grad.addColorStop(1, '#ffeaa7');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
  }
}

function drawSinglePetal(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.2);

  ctx.beginPath();
  ctx.moveTo(0, r * 0.5);
  ctx.bezierCurveTo(-r * 0.45, r * 0.3, -r * 0.5, -r * 0.35, -r * 0.15, -r * 0.65);
  ctx.bezierCurveTo(0, -r * 0.75, r * 0.18, -r * 0.68, r * 0.45, -r * 0.42);
  ctx.bezierCurveTo(r * 0.55, -r * 0.1, r * 0.4, r * 0.35, 0, r * 0.5);

  const grad = ctx.createLinearGradient(-r * 0.3, -r * 0.6, r * 0.3, r * 0.5);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, '#f4c9c6');
  grad.addColorStop(0.8, '#e8a0a8');
  grad.addColorStop(1, '#cb7b85');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(180, 95, 105, 0.45)';
  ctx.lineWidth = Math.max(2, r * 0.035);
  ctx.stroke();

  // Subtle delicate center spine
  ctx.beginPath();
  ctx.moveTo(0, r * 0.4);
  ctx.quadraticCurveTo(-r * 0.05, 0, 0, -r * 0.45);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function drawBud(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);

  // Emerging petal tip
  ctx.beginPath();
  ctx.moveTo(0, r * 0.2);
  ctx.bezierCurveTo(-r * 0.3, -r * 0.2, -r * 0.25, -r * 0.7, 0, -r * 0.8);
  ctx.bezierCurveTo(r * 0.25, -r * 0.7, r * 0.3, -r * 0.2, 0, r * 0.2);
  const petalGrad = ctx.createLinearGradient(0, r * 0.2, 0, -r * 0.8);
  petalGrad.addColorStop(0, '#fcedea');
  petalGrad.addColorStop(0.6, '#e8a0a8');
  petalGrad.addColorStop(1, '#d9822b');
  ctx.fillStyle = petalGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(175, 90, 80, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Green calyx sepals at base
  for (let s = -1; s <= 1; s++) {
    ctx.beginPath();
    ctx.moveTo(0, r * 0.55);
    ctx.bezierCurveTo(s * r * 0.25, r * 0.35, s * r * 0.35, r * 0.1, s * r * 0.2, -r * 0.15);
    ctx.bezierCurveTo(s * r * 0.1, r * 0.1, 0, r * 0.3, 0, r * 0.55);
    ctx.fillStyle = s === 0 ? '#8fa382' : '#a9b79a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(75, 100, 65, 0.45)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  ctx.restore();
}

function drawLeaf(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.25);

  ctx.beginPath();
  ctx.moveTo(0, r * 0.65);
  ctx.bezierCurveTo(-r * 0.38, r * 0.3, -r * 0.4, -r * 0.25, 0, -r * 0.75);
  ctx.bezierCurveTo(r * 0.4, -r * 0.25, r * 0.38, r * 0.3, 0, r * 0.65);

  const grad = ctx.createLinearGradient(-r * 0.3, 0, r * 0.3, 0);
  grad.addColorStop(0, '#97aa87');
  grad.addColorStop(0.5, '#a9b79a');
  grad.addColorStop(1, '#819672');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(75, 100, 65, 0.45)';
  ctx.lineWidth = Math.max(2, r * 0.035);
  ctx.stroke();

  // Leaf central spine
  ctx.beginPath();
  ctx.moveTo(0, r * 0.55);
  ctx.quadraticCurveTo(-r * 0.04, 0, 0, -r * 0.65);
  ctx.strokeStyle = 'rgba(60, 85, 50, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

function drawJasmine(ctx, cx, cy, r) {
  ctx.save();
  const petalCount = 6;
  for (let i = 0; i < petalCount; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i * 2 * Math.PI) / petalCount);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-r * 0.22, -r * 0.3, -r * 0.3, -r * 0.8, 0, -r);
    ctx.bezierCurveTo(r * 0.3, -r * 0.8, r * 0.22, -r * 0.3, 0, 0);

    const grad = ctx.createLinearGradient(0, 0, 0, -r);
    grad.addColorStop(0, '#fffdf9');
    grad.addColorStop(0.65, '#fffaf0');
    grad.addColorStop(1, '#f7f1e3');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(184, 151, 90, 0.45)';
    ctx.lineWidth = Math.max(1.8, r * 0.03);
    ctx.stroke();
    ctx.restore();
  }

  // Golden stamen center
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2);
  const coreGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, r * 0.14);
  coreGrad.addColorStop(0, '#ffffff');
  coreGrad.addColorStop(0.6, '#b8975a');
  coreGrad.addColorStop(1, '#9f8045');
  ctx.fillStyle = coreGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 130, 70, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}
