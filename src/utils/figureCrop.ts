import type { FigureBox } from '../types';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for figure cropping'));
    img.src = src;
  });
}

/**
 * Applies a levels stretch that pushes paper background to crisp #FFFFFF
 * while keeping pen, pencil, and colored diagram strokes dark and legible.
 */
function cleanPaperBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const totalPixels = width * height;
  if (totalPixels === 0) return;

  // Build luminance histogram to estimate paper background brightness robustly
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[lum]++;
  }

  let acc = 0;
  let bgLum = 230;
  const targetCount = Math.floor(totalPixels * 0.78);
  for (let l = 0; l < 256; l++) {
    acc += hist[l];
    if (acc >= targetCount) {
      bgLum = l;
      break;
    }
  }

  const whitePoint = Math.max(150, Math.min(248, bgLum * 0.93));
  const blackPoint = Math.max(0, Math.min(55, bgLum * 0.18));
  const span = Math.max(40, whitePoint - blackPoint);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (lum >= whitePoint) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
      continue;
    }

    const norm = Math.max(0, Math.min(1, (lum - blackPoint) / span));
    // Gentle gamma < 1 keeps pencil/thin ink lines darker while fading faint ruled lines
    const adjustedLum = Math.pow(norm, 1.15) * 255;
    const scale = lum > 1 ? adjustedLum / lum : 0;

    data[i] = Math.max(0, Math.min(255, Math.round(r * scale)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g * scale)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b * scale)));
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Renders a PaperPage with its current rotation onto an offscreen canvas and
 * crops the normalized 0-1000 bounding box into a PNG data URL.
 */
export async function cropFigureFromPage(
  pageDataUrl: string,
  rotation: number,
  box: FigureBox,
  enhanceInk = true,
  paddingRatio = 0.012
): Promise<string> {
  const img = await loadImage(pageDataUrl);
  const rot = ((rotation % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;

  const orientedW = swap ? img.naturalHeight || img.height : img.naturalWidth || img.width;
  const orientedH = swap ? img.naturalWidth || img.width : img.naturalHeight || img.height;

  // Step 1: orient full page if rotated
  let sourceCanvas: HTMLCanvasElement | HTMLImageElement = img;
  if (rot !== 0) {
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = orientedW;
    rotCanvas.height = orientedH;
    const rCtx = rotCanvas.getContext('2d');
    if (rCtx) {
      rCtx.translate(orientedW / 2, orientedH / 2);
      rCtx.rotate((rot * Math.PI) / 180);
      rCtx.drawImage(img, -(img.naturalWidth || img.width) / 2, -(img.naturalHeight || img.height) / 2);
      sourceCanvas = rotCanvas;
    }
  }

  // Step 2: compute padded pixel crop bounds
  const padPxX = Math.round(orientedW * paddingRatio);
  const padPxY = Math.round(orientedH * paddingRatio);

  const rawX1 = Math.round((box.xmin / 1000) * orientedW) - padPxX;
  const rawY1 = Math.round((box.ymin / 1000) * orientedH) - padPxY;
  const rawX2 = Math.round((box.xmax / 1000) * orientedW) + padPxX;
  const rawY2 = Math.round((box.ymax / 1000) * orientedH) + padPxY;

  const sx = Math.max(0, Math.min(orientedW - 10, rawX1));
  const sy = Math.max(0, Math.min(orientedH - 10, rawY1));
  const sw = Math.max(10, Math.min(orientedW - sx, rawX2 - sx));
  const sh = Math.max(10, Math.min(orientedH - sy, rawY2 - sy));

  // Cap super-huge crops at 1400px max dimension so Word export stays snappy and crisp
  const maxDim = 1400;
  const scale = Math.min(1, maxDim / sw, maxDim / sh);
  const outW = Math.max(12, Math.round(sw * scale));
  const outH = Math.max(12, Math.round(sh * scale));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return pageDataUrl;

  outCtx.fillStyle = '#FFFFFF';
  outCtx.fillRect(0, 0, outW, outH);
  outCtx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

  if (enhanceInk) {
    cleanPaperBackground(outCtx, outW, outH);
  }

  return outCanvas.toDataURL('image/png');
}

export function readUploadedFigureFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function parseSvgDimensions(svgMarkup: string): { width: number; height: number } {
  const vbMatch = svgMarkup.match(/viewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  if (vbMatch) {
    const w = parseFloat(vbMatch[1]);
    const h = parseFloat(vbMatch[2]);
    if (w > 20 && h > 20) {
      return { width: w, height: h };
    }
  }
  const wMatch = svgMarkup.match(/\bwidth\s*=\s*["']([\d.]+)/i);
  const hMatch = svgMarkup.match(/\bheight\s*=\s*["']([\d.]+)/i);
  const w = wMatch ? parseFloat(wMatch[1]) : 500;
  const h = hMatch ? parseFloat(hMatch[1]) : 360;
  return {
    width: w > 20 ? w : 500,
    height: h > 20 ? h : 360,
  };
}

/**
 * Renders a sanitized standalone SVG diagram onto a high-DPI offscreen canvas
 * and exports a crisp white-background PNG data URL suitable for Studio and .docx.
 */
export async function renderSvgToHighDpiPng(
  svgMarkup: string,
  scaleFactor = 2.5
): Promise<string> {
  let normalized = svgMarkup.trim();
  if (!/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(normalized)) {
    normalized = normalized.replace(
      /<svg\b/i,
      '<svg xmlns="http://www.w3.org/2000/svg"'
    );
  }

  const { width, height } = parseSvgDimensions(normalized);
  const targetW = Math.min(1800, Math.max(240, Math.round(width * scaleFactor)));
  const targetH = Math.min(1800, Math.max(180, Math.round(height * scaleFactor)));

  const blob = new Blob([normalized], { type: 'image/svg+xml;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  try {
    const img = await loadImage(blobUrl);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

