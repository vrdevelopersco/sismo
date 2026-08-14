// scripts/generate_png_icons.js
// Genera iconos PNG para PWA con el diseño del Planeta Tierra Quebrado / Falla Sísmica
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '../public/icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

function createFracturedEarthPng(width, height) {
  const rawData = Buffer.alloc(height * (width * 4 + 1));
  const cx = width / 2;
  const cy = height / 2;
  const globeR = width * 0.35; // Radio del planeta
  const maxR = width / 2;

  // Segmentos de la falla quebrada (en coordenadas relativas al centro [-1 a 1])
  const fracturePoints = [
    { x: -0.22, y: -0.32 },
    { x: -0.12, y: -0.20 },
    { x: -0.18, y: -0.08 },
    { x: -0.05, y: 0.04 }, // Epicentro
    { x: 0.05, y: -0.02 },
    { x: 0.08, y: 0.16 },
    { x: 0.20, y: 0.26 },
    { x: 0.28, y: 0.34 }
  ];

  // Distancia a segmento de línea
  function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  // Distancia mínima a toda la grieta
  function distToCrack(px, py) {
    let minDist = 99999;
    for (let i = 0; i < fracturePoints.length - 1; i++) {
      const p1 = fracturePoints[i];
      const p2 = fracturePoints[i + 1];
      const d = distToSegment(px, py, p1.x * width, p1.y * height, p2.x * width, p2.y * height);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // PNG filter byte (None)
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Contenedor con esquinas redondeadas
      const cornerRadius = width * 0.23;
      const rx = Math.abs(dx) - (cx - cornerRadius);
      const ry = Math.abs(dy) - (cy - cornerRadius);
      const isInsideCard = (rx <= 0 || ry <= 0) || (rx * rx + ry * ry <= cornerRadius * cornerRadius);

      if (!isInsideCard) {
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        continue;
      }

      // Fondo de espacio profundo con viñeta
      const normDist = dist / maxR;
      let r = Math.round(11 + 10 * (1 - normDist));
      let g = Math.round(17 + 14 * (1 - normDist));
      let b = Math.round(32 + 20 * (1 - normDist));
      let a = 255;

      // Anillos de radar sísmico concéntricos tenues en el fondo
      const epicenterDx = dx - (-0.05 * width);
      const epicenterDy = dy - (0.04 * height);
      const distEpicenter = Math.sqrt(epicenterDx * epicenterDx + epicenterDy * epicenterDy);

      const wave1 = width * 0.42;
      const wave2 = width * 0.32;
      const wRing = width * 0.012;

      if (Math.abs(distEpicenter - wave1) < wRing) {
        r = Math.min(255, r + 90); g = Math.min(255, g + 40); b = Math.min(255, b + 40);
      } else if (Math.abs(distEpicenter - wave2) < wRing) {
        r = Math.min(255, r + 40); g = Math.min(255, g + 80); b = Math.min(255, b + 140);
      }

      // Renderizado del Globo Terráqueo
      if (dist <= globeR) {
        // Base de océano / esfera
        const globeNorm = dist / globeR;
        const lightX = -0.3 * globeR;
        const lightY = -0.4 * globeR;
        const lightDist = Math.hypot(dx - lightX, dy - lightY) / (globeR * 1.6);
        const sphereShade = Math.max(0.15, 1 - lightDist);

        // Color océano azul profundo
        r = Math.round((20 + 20 * sphereShade));
        g = Math.round((45 + 50 * sphereShade));
        b = Math.round((110 + 130 * sphereShade));

        // Continentes aproximados (Manchas orgánicas de tierra)
        // Continente Norte
        const c1Dist = Math.hypot(dx - (-0.14 * width), dy - (-0.16 * height));
        // Continente Sur (Sudamérica)
        const c2Dist = Math.hypot(dx - (-0.08 * width), dy - (0.12 * height));

        if (c1Dist < globeR * 0.48 || c2Dist < globeR * 0.42) {
          // Color tierra / vegetación esmeralda
          r = Math.round((14 + 18 * sphereShade));
          g = Math.round((130 + 90 * sphereShade));
          b = Math.round((80 + 40 * sphereShade));
        }

        // Atmósfera borde exterior
        if (dist > globeR - width * 0.02) {
          const edgeAlpha = (dist - (globeR - width * 0.02)) / (width * 0.02);
          r = Math.round(r * (1 - edgeAlpha) + 56 * edgeAlpha);
          g = Math.round(g * (1 - edgeAlpha) + 189 * edgeAlpha);
          b = Math.round(b * (1 - edgeAlpha) + 248 * edgeAlpha);
        }
      }

      // ⚡ FRACTURA SÍSMICA QUEBRADA (GRIETA MAGMÁTICA ARDIENTE)
      const crackDist = distToCrack(dx, dy);
      const crackWidth = width * 0.015;
      const glowWidth = width * 0.07;

      if (dist <= globeR * 1.05) {
        if (crackDist < crackWidth) {
          // Núcleo ardiente de la grieta (blanco / amarillo incandescente)
          const coreT = crackDist / crackWidth;
          r = Math.round(255 * (1 - coreT) + 245 * coreT);
          g = Math.round(255 * (1 - coreT) + 158 * coreT);
          b = Math.round(255 * (1 - coreT) + 11 * coreT);
        } else if (crackDist < glowWidth) {
          // Resplandor de magma / calor rojo-naranja
          const glowT = (crackDist - crackWidth) / (glowWidth - crackWidth);
          const heatAlpha = (1 - glowT) * (1 - glowT);
          r = Math.min(255, Math.round(r + 239 * heatAlpha));
          g = Math.min(255, Math.round(g + 80 * heatAlpha));
          b = Math.min(255, Math.round(b + 20 * heatAlpha));
        }
      }

      // Epicentro / Punto de ruptura (Destello central)
      if (distEpicenter < width * 0.05) {
        const epiT = distEpicenter / (width * 0.05);
        if (distEpicenter < width * 0.02) {
          r = 255; g = 255; b = 255;
        } else {
          r = Math.min(255, r + Math.round(240 * (1 - epiT)));
          g = Math.min(255, g + Math.round(100 * (1 - epiT)));
        }
      }

      // Borde del contenedor
      if (dist > maxR - 2) {
        r = Math.min(255, r + 40);
        g = Math.min(255, g + 60);
        b = Math.min(255, b + 90);
      }

      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-32.png', size: 32 }
];

for (const s of sizes) {
  const png = createFracturedEarthPng(s.size, s.size);
  const filePath = path.join(iconsDir, s.name);
  fs.writeFileSync(filePath, png);
  console.log(`✅ [Icono Quebrado] ${s.name} (${s.size}x${s.size}) -> ${filePath}`);
}
