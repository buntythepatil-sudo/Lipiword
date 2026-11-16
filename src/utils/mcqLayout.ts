import type { McqLayoutMode, McqOption, TypefaceStyle } from '../types';
import { splitScriptSegments } from './scriptRuns';

let measureCanvas: HTMLCanvasElement | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
  }
  return measureCanvas.getContext('2d');
}

export function getTypefaceFontString(typeface: TypefaceStyle, sizePx = 16): string {
  switch (typeface) {
    case 'editorial-serif':
      return `${sizePx}px "Playfair Display", "Noto Serif Devanagari", "Noto Serif Gujarati", Georgia, serif`;
    case 'modern-sans':
      return `${sizePx}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans Gujarati", sans-serif`;
    case 'academic-classic':
    default:
      return `${sizePx}px "Lora", "Noto Serif Devanagari", "Noto Serif Gujarati", "Times New Roman", serif`;
  }
}

/**
 * Measures option width accurately using Gujarati 10pt (13.33px) and English 12pt (16px).
 */
export function measureOptionPixelWidth(
  option: McqOption,
  typeface: TypefaceStyle
): number {
  const cleanLabel = option.label.trim().toLowerCase();
  const cleanText = option.text.trimStart();
  const fullText = `${cleanLabel ? cleanLabel + ' ' : ''}${cleanText}`.trim();
  if (!fullText) return 0;

  const ctx = getMeasureContext();
  if (ctx) {
    const segments = splitScriptSegments(fullText);
    let total = 0;
    for (const seg of segments) {
      const sizePx = seg.isGujarati ? 13.33 : 16;
      ctx.font = getTypefaceFontString(typeface, sizePx);
      total += ctx.measureText(seg.text).width;
    }
    return total;
  }

  return fullText.length * 8.6;
}

/**
 * Determines optimal column count for MCQ options:
 * - Tier 1 (1 line): 4 columns (or options.length if 2 or 3) when every option fits in column width
 * - Tier 2 (2 lines): 2 columns when any option overflows 4-col width, but fits in 2-col width
 * - Tier 3 (4 lines): 1 column only when 2-col width is also not enough
 */
export function resolveMcqColumns(
  options: McqOption[],
  availableWidthPx: number,
  typeface: TypefaceStyle,
  override?: McqLayoutMode
): 1 | 2 | 3 | 4 {
  if (override === '4col') return 4;
  if (override === '2col') return 2;
  if (override === '1col') return 1;

  if (!options || options.length === 0) return 1;

  const maxOptWidth = options.reduce((max, opt) => {
    const w = measureOptionPixelWidth(opt, typeface);
    return w > max ? w : max;
  }, 0);

  const safeWidth = Math.max(240, availableWidthPx);
  const gapPx = 16;
  const safetyBufferPx = 12;

  // Tier 1: 1 line (4 columns for 4+ options, or N columns for 2-3 options)
  const singleLineCols = (options.length === 2 ? 2 : options.length === 3 ? 3 : 4) as 2 | 3 | 4;
  const tier1CellWidth = (safeWidth - gapPx * (singleLineCols - 1)) / singleLineCols;
  if (maxOptWidth <= tier1CellWidth - safetyBufferPx) {
    return singleLineCols;
  }

  // Tier 2: 2 lines (2 columns)
  const tier2CellWidth = (safeWidth - 24) / 2;
  if (maxOptWidth <= tier2CellWidth - safetyBufferPx) {
    return 2;
  }

  // Tier 3: 4 lines (1 column)
  return 1;
}
