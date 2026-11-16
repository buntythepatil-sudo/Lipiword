import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import type {
  LanguageFocus,
  StructurePreset,
  BlockType,
  DocumentBlock,
  IndentLevel,
  McqOption,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface TranscribePageInput {
  mimeType: string;
  data: string;
  name?: string;
}

interface TranscribeRequestBody {
  pages: TranscribePageInput[];
  languageFocus: LanguageFocus;
  structurePreset: StructurePreset;
  scanFigures?: boolean;
}

const VALID_BLOCK_TYPES: BlockType[] = [
  'heading1',
  'heading2',
  'paragraph',
  'bullet',
  'numbered',
  'shloka',
  'mcq',
  'figure',
  'divider',
];

function buildSystemInstruction(
  languageFocus: LanguageFocus,
  structurePreset: StructurePreset,
  scanFigures: boolean
): string {
  const languageGuidance: Record<LanguageFocus, string> = {
    auto: 'Auto-detect all scripts present on each page (Hindi Devanagari, Gujarati, Sanskrit Devanagari, English, or mixed-script lines).',
    hindi: 'Primary script focus is Hindi (Devanagari). Pay close attention to matras, nuktas, chandrabindu (ँ), anusvara (ं), and mixed English technical terms if present.',
    gujarati: 'Primary script focus is Gujarati (ગુજરાતી). Pay close attention to Gujarati vowel signs, conjuncts, anusvara (ં), and mixed English terms if present.',
    sanskrit: 'Primary script focus is Sanskrit (Devanagari). Strictly preserve every halant/virama (्), visarga (ः), anusvara (ं), chandrabindu (ँ), avagraha (ऽ), single danda (।), and double danda (॥) exactly as written.',
    english: 'Primary language focus is English, while still preserving any handwritten Indic words or quotes verbatim in their original script.',
  };

  const presetGuidance: Record<StructurePreset, string> = {
    exam: 'Structure Preset: Exam & Marks. Carefully extract the exam/paper title, subtitle (subject, grade, date, instructions), total marks (e.g., "Total Marks: 50"), section or question headers (heading1 or heading2), normal question lines (paragraph), multiple-choice questions (mcq), and EVERY right-side / margin marks indicator. Keep all written question numbers and sub-markers (like "Q.1", "1.", "(a)") verbatim inside the text—do NOT convert lines into auto-bullets.',
    notes: 'Structure Preset: Study Notes. Organize the handwritten notes into clear topic headings (heading1), subtopic headings (heading2), clean explanatory paragraphs (paragraph), and multiple-choice practice items (mcq) if present. Preserve any written markers or numbers verbatim inside "paragraph" text with indentLevel (0, 1, or 2) instead of generating auto-bullets.',
    manuscript: 'Structure Preset: Manuscript & Shloka. Preserve verses, sutras, couplets, and shlokas using block type "shloka" with internal line breaks (\\n) preserved, exact dandas (। and ॥), avagraha (ऽ), visarga (ः), and halants (्). Place commentary or bhashya in "paragraph" blocks, section titles in "heading1"/"heading2", and use "divider" blocks between major chapters or cantos.',
  };

  const figuresGuidance = scanFigures
    ? 'CRITICAL RULE — FIGURES, DIAGRAMS & IMAGES (MATHS / SCIENCE / GENERAL): Whenever a page contains a drawn or printed figure, geometry diagram (triangle, circle, angle, number line, graph, coordinate plane), circuit diagram, ray/optics diagram, physics or chemistry apparatus, chemical structure, biology sketch, chart, map, or standalone picture/image, emit a block with type "figure" at its exact reading-order position (for example, directly after the question stem that refers to it). Provide "figureBox" as tight 0-1000 normalized coordinates { "ymin", "xmin", "ymax", "xmax" } (top-left = 0,0; bottom-right = 1000,1000) enclosing the entire diagram and its figure labels/axes/arrows while excluding unrelated surrounding question text. Put any figure caption or concise figure label in "text" (or empty string if unlabeled), and put any right-side mark aligned exclusively with that figure in "marks". Do NOT emit "figure" for ordinary text or inline equations.'
    : 'Do NOT emit "figure" blocks; transcribe text, questions, and marks only.';

  return [
    'You are LipiWord, a high-precision multilingual handwriting transcription and document structuring engine.',
    'CRITICAL RULE — ZERO TRANSLATION: Transcribe every word in its exact original script and language. NEVER translate Hindi, Gujarati, or Sanskrit into English, and NEVER transliterate Devanagari or Gujarati into Latin/Roman script unless the handwritten page itself uses Roman script.',
    'CRITICAL RULE — EXACT DIACRITICS & PUNCTUATION: For Sanskrit and Hindi, preserve halants (्), visarga (ः), anusvara (ं), chandrabindu (ँ), avagraha (ऽ), single danda (।), and double danda (॥). For Gujarati, preserve all matras, anusvara (ં), and conjunct consonants accurately.',
    'CRITICAL RULE — MATHS & SCIENCE NOTATION: For Mathematics, Physics, Chemistry, and Science papers, transcribe formulas, equations, powers, roots, chemical reactions, units, and symbols cleanly using standard Unicode characters (e.g., x², x³, H₂O, CO₂, H₂SO₄, √, ∛, π, θ, α, β, γ, Δ, Ω, μ, λ, °, °C, ∠, △, ⊥, ∥, ≅, ≤, ≥, ≠, ≈, ×, ÷, ±, →, ⇌, ↑, ↓). Do NOT wrap expressions in LaTeX $...$ or \\frac{}{} syntax.',
    'CRITICAL RULE — NO AUTO BULLETS: Do NOT emit "bullet" blocks or automatically add bullet symbols. Use "paragraph" (with indentLevel 0, 1, or 2 if indented) and preserve any written prefix (such as "1.", "a)", "-") verbatim in the text.',
    'CRITICAL RULE — RIGHT-SIDE MARKS EXTRACTION: Always scan the ENTIRE RIGHT SIDE and RIGHT MARGIN of every page (including outside/inside vertical margin lines, far-right aligned numbers, circled numbers, bracketed or parenthesized numbers like [5], (5), [5 Marks], [10 M], 1x5=5, 5x1=5, ५, ૫, ५ गुण, ૫ ગુણ, or "Marks: 5"). Whenever a mark value appears on the right side aligned with a section header, question, MCQ, or sub-question, ALWAYS capture it in that block\'s "marks" field (formatted cleanly like "[5]" or "[5 Marks]" or "[10 M]" preserving the written mark value). Do NOT omit right-side numbers or append them into the left question text—put them in "marks". Also check the top-right header for "totalMarks".',
    'CRITICAL RULE — MULTIPLE CHOICE QUESTIONS (MCQ): Whenever a question has multiple-choice options (such as A/B/C/D, a/b/c/d, A)/B)/C)/D), (A)/(B)/(C)/(D), 1/2/3/4, अ/ब/क/ड, क/ख/ग/घ, અ/બ/ક/ડ), ALWAYS emit a single block with type "mcq". Put the question stem in "text", put every option in "options" as { "label": "a)", "text": "..." } using LOWERCASE option names (e.g., "a)", "b)", "c)", "d)" instead of uppercase "A)", "B)"), and put any right-side mark in "marks". Do NOT split MCQ options into separate bullet or paragraph blocks.',
    figuresGuidance,
    languageGuidance[languageFocus] || languageGuidance.auto,
    presetGuidance[structurePreset] || presetGuidance.exam,
    'If multiple pages are provided, merge them into one cohesive document in page order and set "pageIndex" (0-based) on every block.',
    'If a page has horizontal dividing lines separating sections, emit a "divider" block with empty text.',
  ].join('\n\n');
}

const transcriptionSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Main document or exam paper title extracted from the top of the handwritten page(s), or a concise inferred title if none is written.',
    },
    subtitle: {
      type: Type.STRING,
      description: 'Optional subtitle such as subject name, chapter, author, date, time, or class/grade. Empty string if absent.',
    },
    totalMarks: {
      type: Type.STRING,
      description: 'Total marks string from the top header or top-right corner if present (e.g., "Max. Marks: 80", "Total: 50 Marks", "कुल अंक: 50"). Empty string if not applicable.',
    },
    detectedScripts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'List of detected scripts/languages, e.g., ["Devanagari (Sanskrit)", "English"].',
    },
    blocks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            description: 'One of: heading1, heading2, paragraph, bullet, numbered, shloka, mcq, figure, divider',
          },
          text: {
            type: Type.STRING,
            description: 'Verbatim transcribed text in original script. For mcq, put only the question stem here. For figure, put the figure caption or label (empty string if unlabeled). Use \\n for multi-line shloka verses. Empty string for divider.',
          },
          indentLevel: {
            type: Type.INTEGER,
            description: 'Nesting level 0, 1, or 2 for bullet and numbered items. Use 0 for other types.',
          },
          marks: {
            type: Type.STRING,
            description: 'Right-side or margin marks tag aligned with this line/question/section (e.g., "[5 Marks]", "[10 M]", "[2]", "[1×5=5]"). Empty string ONLY if no marks appear on the right side for this block.',
          },
          options: {
            type: Type.ARRAY,
            description: 'Required when type is "mcq" (empty array otherwise). List all MCQ options in order with exact label and text.',
            items: {
              type: Type.OBJECT,
              properties: {
                label: {
                  type: Type.STRING,
                  description: 'Option label in lowercase, e.g., "a)", "b)", "(a)", "(ક)", "(અ)", "1)"',
                },
                text: {
                  type: Type.STRING,
                  description: 'Verbatim option text in its original script.',
                },
              },
              required: ['label', 'text'],
            },
          },
          figureBox: {
            type: Type.OBJECT,
            description: 'Required when type is "figure" (use 0,0,0,0 otherwise). Tight 0-1000 normalized bounding box enclosing the diagram, graph, geometry figure, circuit, or image on the source page.',
            properties: {
              ymin: { type: Type.INTEGER },
              xmin: { type: Type.INTEGER },
              ymax: { type: Type.INTEGER },
              xmax: { type: Type.INTEGER },
            },
            required: ['ymin', 'xmin', 'ymax', 'xmax'],
          },
          pageIndex: {
            type: Type.INTEGER,
            description: '0-based index of the source paper image this block originated from.',
          },
        },
        required: ['type', 'text', 'indentLevel', 'marks', 'options', 'figureBox', 'pageIndex'],
      },
    },
  },
  required: ['title', 'subtitle', 'totalMarks', 'detectedScripts', 'blocks'],
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.post('/api/transcribe', async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY is not configured. Please add it in Settings > Secrets.',
        });
      }

      const body = req.body as TranscribeRequestBody;
      if (!body || !Array.isArray(body.pages) || body.pages.length === 0) {
        return res.status(400).json({ error: 'Please upload or capture at least one handwritten paper image.' });
      }

      const languageFocus: LanguageFocus = body.languageFocus || 'auto';
      const structurePreset: StructurePreset = body.structurePreset || 'exam';
      const scanFigures: boolean = body.scanFigures !== false;

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      body.pages.forEach((page, index) => {
        const cleanBase64 = page.data.includes(',') ? page.data.split(',')[1] : page.data;
        parts.push({
          text: `Page ${index + 1} (pageIndex: ${index})${page.name ? ` — ${page.name}` : ''}:`,
        });
        parts.push({
          inlineData: {
            mimeType: page.mimeType || 'image/jpeg',
            data: cleanBase64,
          },
        });
      });

      parts.push({
        text: scanFigures
          ? 'Transcribe all handwritten content (including Maths & Science formulas/symbols) across the provided page image(s) into structured JSON blocks. Preserve original scripts verbatim without translating, capture every right-side / margin mark in "marks", group MCQs into "mcq" blocks, and extract every diagram, graph, geometry figure, circuit, or embedded image as a "figure" block with accurate 0-1000 normalized figureBox coordinates.'
          : 'Transcribe all handwritten content across the provided page image(s) into structured JSON blocks. Preserve original scripts verbatim without translating. Carefully capture every right-side / margin mark in the "marks" field, and group any multiple-choice questions and their options into "mcq" blocks.',
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction: buildSystemInstruction(languageFocus, structurePreset, scanFigures),
          responseMimeType: 'application/json',
          responseSchema: transcriptionSchema,
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        return res.status(502).json({ error: 'Empty transcription response received from Gemini Vision.' });
      }

      const parsed = JSON.parse(rawText);

      const normalizedBlocks = Array.isArray(parsed.blocks)
        ? parsed.blocks.map((b: Record<string, unknown>, idx: number) => {
            const rawType = String(b.type || 'paragraph') as BlockType;
            const type: BlockType = VALID_BLOCK_TYPES.includes(rawType) ? rawType : 'paragraph';
            const rawIndent = Number(b.indentLevel ?? 0);
            const indentLevel: IndentLevel =
              rawIndent >= 2 ? 2 : rawIndent === 1 ? 1 : 0;
            const marks = typeof b.marks === 'string' ? b.marks.trim() : '';
            const pageIndex =
              typeof b.pageIndex === 'number' && b.pageIndex >= 0 && b.pageIndex < body.pages.length
                ? b.pageIndex
                : 0;

            let options: McqOption[] | undefined;
            if (type === 'mcq' && Array.isArray(b.options)) {
              options = b.options
                .map((opt: unknown) => {
                  const o = opt as Record<string, unknown>;
                  return {
                    label: String(o?.label ?? '').trim().toLowerCase(),
                    text: String(o?.text ?? '').trim(),
                  };
                })
                .filter((o: McqOption) => o.label || o.text);
            }

            let figureBox:
              | { ymin: number; xmin: number; ymax: number; xmax: number }
              | undefined;
            if (type === 'figure' && b.figureBox && typeof b.figureBox === 'object') {
              const fb = b.figureBox as Record<string, unknown>;
              const clamp = (n: number) => Math.max(0, Math.min(1000, Math.round(n)));
              const ymin = clamp(Number(fb.ymin ?? 0));
              const xmin = clamp(Number(fb.xmin ?? 0));
              const ymax = clamp(Number(fb.ymax ?? 0));
              const xmax = clamp(Number(fb.xmax ?? 0));
              if (ymax > ymin + 8 && xmax > xmin + 8) {
                figureBox = { ymin, xmin, ymax, xmax };
              }
            }

            return {
              id: `blk-${Date.now()}-${idx}`,
              type,
              text: type === 'divider' ? '' : String(b.text ?? ''),
              indentLevel: type === 'bullet' || type === 'numbered' ? indentLevel : 0,
              marks: marks || undefined,
              options,
              mcqLayout: type === 'mcq' ? ('auto' as const) : undefined,
              figureBox,
              figureEnhance: type === 'figure' ? true : undefined,
              figureSize: type === 'figure' ? ('medium' as const) : undefined,
              figureAlign: type === 'figure' ? ('center' as const) : undefined,
              pageIndex,
            } satisfies DocumentBlock;
          })
          .filter((b: DocumentBlock) => !(b.type === 'figure' && (!scanFigures || !b.figureBox)))
        : [];

      return res.json({
        meta: {
          title: String(parsed.title || 'Untitled Document').trim(),
          subtitle: String(parsed.subtitle || '').trim(),
          totalMarks: String(parsed.totalMarks || '').trim(),
          detectedScripts: Array.isArray(parsed.detectedScripts)
            ? parsed.detectedScripts.map((s: unknown) => String(s))
            : [],
        },
        blocks: normalizedBlocks,
      });
    } catch (error: unknown) {
      console.error('Transcription error:', error);
      const errObj = error as { status?: number; message?: string };
      const status = typeof errObj?.status === 'number' && errObj.status >= 400 ? errObj.status : 500;
      return res.status(status).json({
        error: errObj?.message || 'Failed to transcribe handwritten paper. Please try again.',
      });
    }
  });

  const refineFigureSchema = {
    type: Type.OBJECT,
    properties: {
      svg: {
        type: Type.STRING,
        description:
          'Complete, standalone, publication-grade <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" width="W" height="H">...</svg> diagram faithfully reconstructing the hand-drawn sketch.',
      },
      detectedCaption: {
        type: Type.STRING,
        description:
          'Optional figure caption or title if written inside/below the diagram in its original script; empty string otherwise.',
      },
    },
    required: ['svg', 'detectedCaption'],
  };

  function sanitizeSvgMarkup(raw: string): string {
    const match = raw.match(/<svg[\s\S]*?<\/svg>/i);
    if (!match) return '';
    let svg = match[0]
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/<image\b[^>]*\/?>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, '');

    if (!/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(svg)) {
      svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    return svg.trim();
  }

  app.post('/api/refine-figure', async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY is not configured. Please add it in Settings > Secrets.',
        });
      }

      const { imageDataUrl, caption } = req.body as {
        imageDataUrl?: string;
        caption?: string;
      };

      if (!imageDataUrl || typeof imageDataUrl !== 'string') {
        return res.status(400).json({ error: 'Missing figure image data.' });
      }

      const mimeMatch = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
      const cleanBase64 = imageDataUrl.includes(',')
        ? imageDataUrl.split(',')[1]
        : imageDataUrl;

      const systemInstruction = [
        'You are an expert technical textbook illustrator and scientific vector draftsman.',
        'Your task is to redraw a cropped hand-drawn Maths, Physics, Chemistry, Biology, or exam-paper figure into a crisp, clean, publication-grade SVG diagram.',
        'STRICT ACCURACY RULES:',
        '1. Faithfully preserve EVERY geometric shape, angle, curve, arrow, circuit symbol, ray, axis, apparatus part, vertex label, measurement, number, equation, and text label shown in the hand-drawn sketch.',
        '2. Preserve all labels in their exact original script and language (English, Gujarati, Hindi Devanagari, Sanskrit) — NEVER translate labels.',
        '3. Use a pure white background: include <rect x="0" y="0" width="100%" height="100%" fill="#FFFFFF" /> as the first element inside <svg>.',
        '4. Set a clean viewBox (typically 420x300 to 680x480) with at least 28px padding around all strokes and text labels so nothing is clipped.',
        '5. Use crisp uniform strokes (stroke="#18181B", stroke-width="2", stroke-linecap="round", stroke-linejoin="round"), true geometric primitives (<line>, <polygon>, <circle>, <ellipse>, <path>, <rect>), dashed auxiliary/hidden lines (stroke-dasharray="5,4"), right-angle square markers where drawn, and clean <marker id="arrow" ...> arrowheads where arrows appear.',
        '6. Place text labels (<text>) cleanly with font-family="Plus Jakarta Sans, Noto Sans Gujarati, Noto Sans Devanagari, sans-serif", font-size="15" to "18", fill="#18181B", and clear spacing so labels never overlap lines or shapes.',
        '7. Do NOT use <script>, <foreignObject>, <image>, or external URLs.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: caption?.trim()
                ? `Redraw this hand-drawn figure (context caption: "${caption.trim()}") into a crisp, textbook-quality SVG diagram with all labels preserved accurately.`
                : 'Redraw this hand-drawn figure into a crisp, textbook-quality SVG diagram with all shapes, lines, arrows, and labels preserved accurately.',
            },
          ],
        },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: refineFigureSchema,
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        return res.status(502).json({ error: 'Empty diagram refinement response.' });
      }

      const parsed = JSON.parse(rawText) as {
        svg?: string;
        detectedCaption?: string;
      };
      const cleanSvg = sanitizeSvgMarkup(String(parsed.svg || ''));
      if (!cleanSvg) {
        return res.status(422).json({ error: 'Could not construct a valid vector diagram for this figure.' });
      }

      return res.json({
        svg: cleanSvg,
        detectedCaption: String(parsed.detectedCaption || '').trim(),
      });
    } catch (error: unknown) {
      console.error('Refine figure error:', error);
      const errObj = error as { status?: number; message?: string };
      const status = typeof errObj?.status === 'number' && errObj.status >= 400 ? errObj.status : 500;
      return res.status(status).json({
        error: errObj?.message || 'Failed to refine figure diagram.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LipiWord server listening on http://localhost:${PORT}`);
  });
}

startServer();
