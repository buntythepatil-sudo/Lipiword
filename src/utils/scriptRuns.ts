export interface ScriptSegment {
  text: string;
  isGujarati: boolean;
}

const GUJARATI_CHAR_RE = /[\u0A80-\u0AFF]/;
const GUJARATI_GROUP_RE = /([\u0A80-\u0AFF]+(?:[\s.,;:?!'’"()-]+[\u0A80-\u0AFF]+)*)/g;

export function hasGujaratiScript(text: string): boolean {
  return GUJARATI_CHAR_RE.test(text);
}

/**
 * Splits a string into Gujarati segments (rendered at 10pt) and
 * English/other segments (rendered at 12pt).
 */
export function splitScriptSegments(text: string): ScriptSegment[] {
  if (!text) return [];
  if (!GUJARATI_CHAR_RE.test(text)) {
    return [{ text, isGujarati: false }];
  }

  const parts = text.split(GUJARATI_GROUP_RE);
  const segments: ScriptSegment[] = [];

  for (const part of parts) {
    if (!part) continue;
    segments.push({
      text: part,
      isGujarati: GUJARATI_CHAR_RE.test(part),
    });
  }

  return segments;
}
