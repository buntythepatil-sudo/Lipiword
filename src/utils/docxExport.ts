import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  convertMillimetersToTwip,
  Document,
  HeadingLevel,
  ImageRun,
  LineRuleType,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import type {
  ExamHeaderConfig,
  FigureAlign,
  FigureSize,
  LipiDocument,
  McqOption,
  TypographySettings,
} from '../types';
import { resolveMcqColumns } from './mcqLayout';
import { splitScriptSegments } from './scriptRuns';

function getFontConfig(typeface: TypographySettings['typeface']) {
  switch (typeface) {
    case 'editorial-serif':
      return {
        latin: 'Georgia',
        heading: 'Georgia',
        indic: 'Noto Serif Devanagari',
        gujarati: 'Noto Serif Gujarati',
      };
    case 'modern-sans':
      return {
        latin: 'Calibri',
        heading: 'Calibri',
        indic: 'Noto Sans Devanagari',
        gujarati: 'Noto Sans Gujarati',
      };
    case 'academic-classic':
    default:
      return {
        latin: 'Times New Roman',
        heading: 'Times New Roman',
        indic: 'Noto Serif Devanagari',
        gujarati: 'Noto Serif Gujarati',
      };
  }
}

function getSpacingTwips(density: TypographySettings['density']) {
  switch (density) {
    case 'compact':
      return { before: 0, after: 0, line: 240, headingBefore: 0, headingAfter: 0 };
    case 'airy':
      return { before: 140, after: 180, line: 340, headingBefore: 240, headingAfter: 120 };
    case 'balanced':
    default:
      return { before: 80, after: 100, line: 276, headingBefore: 180, headingAfter: 80 };
  }
}

function makeFontSpec(latinFont: string, indicFont: string) {
  return {
    ascii: latinFont,
    hAnsi: latinFont,
    cs: indicFont,
    eastAsia: indicFont,
  };
}

/**
 * Builds TextRuns with Gujarati at 10pt (20 half-pts) and English/other at 12pt (24 half-pts).
 */
function buildScriptTextRuns(
  text: string,
  fonts: { latin: string; indic: string; gujarati: string },
  opts?: { bold?: boolean; color?: string; gujaratiSize?: number; englishSize?: number }
): TextRun[] {
  const bold = opts?.bold ?? false;
  const color = opts?.color ?? '18181B';
  const gujaratiSize = opts?.gujaratiSize ?? 20; // 10pt
  const englishSize = opts?.englishSize ?? 24; // 12pt

  const lines = text.split(/\r?\n/);
  const runs: TextRun[] = [];

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) {
      runs.push(new TextRun({ break: 1 }));
    }
    const segments = splitScriptSegments(line);
    for (const seg of segments) {
      runs.push(
        new TextRun({
          text: seg.text,
          bold,
          color,
          size: seg.isGujarati ? gujaratiSize : englishSize,
          font: seg.isGujarati
            ? makeFontSpec(fonts.gujarati, fonts.gujarati)
            : makeFontSpec(fonts.latin, fonts.indic),
        })
      );
    }
  });

  return runs;
}

function formatMarksLabel(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed;
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) return trimmed;
  return `[${trimmed}]`;
}

function formatLabeledMeta(
  label: string,
  value: string,
  knownPrefixes: string[]
): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (knownPrefixes.some((p) => lower.startsWith(p.toLowerCase()))) {
    return trimmed;
  }
  return `${label}: ${trimmed}`;
}

async function buildFigureImageRun(
  dataUrl: string,
  size: FigureSize = 'medium',
  hasMarksColumn = false
): Promise<ImageRun | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load figure image'));
      el.src = dataUrl;
    });

    const natW = img.naturalWidth || 200;
    const natH = img.naturalHeight || 150;

    // A4 Narrow content width: ~697px (or ~607px with right marks column) at 96 DPI
    const fullWidthPx = hasMarksColumn ? 590 : 680;
    const targetMaxWidthPx =
      size === 'small'
        ? 190
        : size === 'large'
        ? 470
        : size === 'full'
        ? fullWidthPx
        : 320;
    const targetMaxHeightPx = size === 'full' ? 520 : 400;

    const scale = Math.min(targetMaxWidthPx / natW, targetMaxHeightPx / natH, 1.5);
    const width = Math.max(40, Math.round(natW * scale));
    const height = Math.max(30, Math.round(natH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = natW;
    canvas.height = natH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const pngDataUrl = canvas.toDataURL('image/png');
    const base64 = pngDataUrl.split(',')[1] || '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new ImageRun({
      type: 'png',
      data: bytes,
      transformation: { width, height },
    });
  } catch {
    return null;
  }
}

function getDocxAlignment(align?: FigureAlign) {
  if (align === 'left') return AlignmentType.LEFT;
  if (align === 'right') return AlignmentType.RIGHT;
  return AlignmentType.CENTER;
}

const NO_CELL_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
};

const NO_TABLE_BORDERS = {
  ...NO_CELL_BORDERS,
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
};

const SOLID_CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 6, color: '18181B' },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: '18181B' },
  left: { style: BorderStyle.SINGLE, size: 6, color: '18181B' },
  right: { style: BorderStyle.SINGLE, size: 6, color: '18181B' },
};

const SOLID_TABLE_BORDERS = {
  ...SOLID_CELL_BORDERS,
  insideHorizontal: { style: BorderStyle.SINGLE, size: 6, color: '18181B' },
  insideVertical: { style: BorderStyle.SINGLE, size: 6, color: '18181B' },
};

const ZERO_CELL_MARGINS = {
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
};

// A4 (210mm x 297mm) with Word "Narrow" margins (0.5 in = 720 twips)
const A4_WIDTH_TWIPS = convertMillimetersToTwip(210);
const A4_HEIGHT_TWIPS = convertMillimetersToTwip(297);
const NARROW_MARGIN_TWIPS = convertInchesToTwip(0.5);
const TOTAL_CONTENT_TWIPS = A4_WIDTH_TWIPS - NARROW_MARGIN_TWIPS * 2;
const MARKS_COL_TWIPS = 1350;
const MAIN_WITH_MARKS_TWIPS = TOTAL_CONTENT_TWIPS - MARKS_COL_TWIPS;

async function buildExamHeaderElements(
  header: ExamHeaderConfig,
  fonts: { latin: string; indic: string; gujarati: string }
): Promise<Array<Paragraph | Table>> {
  const elements: Array<Paragraph | Table> = [];

  if (header.schoolName.trim()) {
    elements.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 20, line: 240, lineRule: LineRuleType.AUTO },
        children: buildScriptTextRuns(header.schoolName.trim(), fonts, {
          bold: true,
          color: '18181B',
          gujaratiSize: 22,
          englishSize: 26,
        }),
      })
    );
  }
  if (header.examName.trim()) {
    elements.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
        children: buildScriptTextRuns(header.examName.trim(), fonts, {
          bold: true,
          color: '18181B',
          gujaratiSize: 20,
          englishSize: 24,
        }),
      })
    );
  }

  // Row 2: 3-Column Metadata (Std + Date | Subject | Total Marks)
  const col3Twips = Math.floor(TOTAL_CONTENT_TWIPS / 3);
  const stdText = header.standard.trim()
    ? formatLabeledMeta('Std', header.standard, ['std', 'class', 'કક્ષા', 'ધોરણ'])
    : '';
  const dateText = header.date.trim()
    ? formatLabeledMeta('Date', header.date, ['date', 'તારીખ', 'ता.'])
    : '';
  const subjectText = header.subject.trim()
    ? formatLabeledMeta('Subject', header.subject, ['subject', 'sub', 'વિષય', 'विषय'])
    : '';
  const marksText = header.totalMarks.trim()
    ? formatLabeledMeta('Total Marks', header.totalMarks, [
        'total',
        'marks',
        'max',
        'કુલ',
        'ગુણ',
        'कुल',
      ])
    : '';

  const leftMetaParagraphs: Paragraph[] = [];
  if (stdText) {
    leftMetaParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
        children: buildScriptTextRuns(stdText, fonts, { bold: true, color: '18181B' }),
      })
    );
  }
  if (dateText) {
    leftMetaParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
        children: buildScriptTextRuns(dateText, fonts, { bold: true, color: '18181B' }),
      })
    );
  }
  if (leftMetaParagraphs.length === 0) {
    leftMetaParagraphs.push(new Paragraph({ children: [] }));
  }

  elements.push(
    new Table({
      layout: TableLayoutType.FIXED,
      width: { size: TOTAL_CONTENT_TWIPS, type: WidthType.DXA },
      columnWidths: [col3Twips, col3Twips, TOTAL_CONTENT_TWIPS - col3Twips * 2],
      borders: NO_TABLE_BORDERS,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: col3Twips, type: WidthType.DXA },
              verticalAlign: VerticalAlign.BOTTOM,
              borders: NO_CELL_BORDERS,
              margins: { top: 60, bottom: 40, left: 0, right: 40 },
              children: leftMetaParagraphs,
            }),
            new TableCell({
              width: { size: col3Twips, type: WidthType.DXA },
              verticalAlign: VerticalAlign.BOTTOM,
              borders: NO_CELL_BORDERS,
              margins: { top: 60, bottom: 40, left: 40, right: 40 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
                  children: subjectText
                    ? buildScriptTextRuns(subjectText, fonts, {
                        bold: true,
                        color: '18181B',
                      })
                    : [],
                }),
              ],
            }),
            new TableCell({
              width: { size: TOTAL_CONTENT_TWIPS - col3Twips * 2, type: WidthType.DXA },
              verticalAlign: VerticalAlign.BOTTOM,
              borders: NO_CELL_BORDERS,
              margins: { top: 60, bottom: 40, left: 40, right: 0 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
                  children: marksText
                    ? buildScriptTextRuns(marksText, fonts, {
                        bold: true,
                        color: '18181B',
                      })
                    : [],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Optional Student Name / Roll No + Marks & Signature Grid Table
  if (header.includeMarksGrid) {
    const halfTwips = Math.floor(TOTAL_CONTENT_TWIPS / 2);
    elements.push(
      new Table({
        layout: TableLayoutType.FIXED,
        width: { size: TOTAL_CONTENT_TWIPS, type: WidthType.DXA },
        columnWidths: [halfTwips + 1200, TOTAL_CONTENT_TWIPS - (halfTwips + 1200)],
        borders: NO_TABLE_BORDERS,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: halfTwips + 1200, type: WidthType.DXA },
                borders: NO_CELL_BORDERS,
                margins: { top: 40, bottom: 40, left: 0, right: 40 },
                children: [
                  new Paragraph({
                    spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
                    children: buildScriptTextRuns(
                      'Name : _______________________________',
                      fonts,
                      { bold: true, color: '18181B' }
                    ),
                  }),
                ],
              }),
              new TableCell({
                width: { size: TOTAL_CONTENT_TWIPS - (halfTwips + 1200), type: WidthType.DXA },
                borders: NO_CELL_BORDERS,
                margins: { top: 40, bottom: 40, left: 40, right: 0 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
                    children: buildScriptTextRuns('Roll No : ___________', fonts, {
                      bold: true,
                      color: '18181B',
                    }),
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );

    const gridCols = [1350, 960, 960, 960, 960, 960, 1150, 1850, 1316];
    const row1Headers = ['Q. No.', 'Q.1', 'Q.2', 'Q.3', 'Q.4', 'Q.5', 'Total', 'Examiner Sign', ''];
    const row2Headers = ['Marks', '', '', '', '', '', '', 'Supervisor Sign', ''];

    elements.push(
      new Table({
        layout: TableLayoutType.FIXED,
        width: { size: TOTAL_CONTENT_TWIPS, type: WidthType.DXA },
        columnWidths: gridCols,
        borders: SOLID_TABLE_BORDERS,
        rows: [
          new TableRow({
            children: row1Headers.map((label, idx) =>
              new TableCell({
                width: { size: gridCols[idx], type: WidthType.DXA },
                borders: SOLID_CELL_BORDERS,
                margins: { top: 30, bottom: 30, left: 40, right: 40 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
                    children: label
                      ? buildScriptTextRuns(label, fonts, {
                          bold: true,
                          color: '18181B',
                          gujaratiSize: 18,
                          englishSize: 18,
                        })
                      : [],
                  }),
                ],
              })
            ),
          }),
          new TableRow({
            children: row2Headers.map((label, idx) =>
              new TableCell({
                width: { size: gridCols[idx], type: WidthType.DXA },
                borders: SOLID_CELL_BORDERS,
                margins: { top: 30, bottom: 30, left: 40, right: 40 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
                    children: label
                      ? buildScriptTextRuns(label, fonts, {
                          bold: true,
                          color: '18181B',
                          gujaratiSize: 18,
                          englishSize: 18,
                        })
                      : [],
                  }),
                ],
              })
            ),
          }),
        ],
      })
    );
  }

  // Solid bottom divider separating Exam Header from Questions
  elements.push(
    new Paragraph({
      spacing: { before: 40, after: 80, line: 240, lineRule: LineRuleType.AUTO },
      border: {
        bottom: {
          color: '18181B',
          space: 1,
          style: BorderStyle.SINGLE,
          size: 14,
        },
      },
      children: [],
    })
  );

  return elements;
}

function buildParagraphWithRightMarks(
  leftParagraph: Paragraph,
  marksLabel: string,
  fonts: { latin: string; indic: string; gujarati: string },
  spacing: { before: number; after: number; line: number },
  bottomBorderColor?: string
): Paragraph | Table {
  if (!marksLabel) {
    return leftParagraph;
  }

  const borderStyle = bottomBorderColor
    ? {
        top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: bottomBorderColor },
      }
    : NO_CELL_BORDERS;

  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: TOTAL_CONTENT_TWIPS, type: WidthType.DXA },
    columnWidths: [MAIN_WITH_MARKS_TWIPS, MARKS_COL_TWIPS],
    borders: NO_TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: MAIN_WITH_MARKS_TWIPS, type: WidthType.DXA },
            borders: borderStyle,
            margins: ZERO_CELL_MARGINS,
            children: [leftParagraph],
          }),
          new TableCell({
            width: { size: MARKS_COL_TWIPS, type: WidthType.DXA },
            borders: borderStyle,
            margins: { top: 0, bottom: 0, left: 80, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: {
                  before: spacing.before,
                  after: spacing.after,
                  line: spacing.line,
                  lineRule: LineRuleType.AUTO,
                },
                children: buildScriptTextRuns(marksLabel, fonts, {
                  bold: true,
                  color: '1D3557',
                }),
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function buildMcqOptionsTable(
  options: McqOption[],
  cols: 1 | 2 | 3 | 4,
  fonts: { latin: string; indic: string; gujarati: string },
  spacing: { before: number; after: number; line: number },
  hasMarksColumn: boolean
): Table {
  const indentTwips = 280;
  const availableTableTwips =
    (hasMarksColumn ? MAIN_WITH_MARKS_TWIPS : TOTAL_CONTENT_TWIPS) - indentTwips;
  const colWidthTwips = Math.floor(availableTableTwips / cols);
  const columnWidths = Array.from({ length: cols }, () => colWidthTwips);
  const isSingleSpacing = spacing.before === 0 && spacing.after === 0;

  const rows: TableRow[] = [];
  for (let i = 0; i < options.length; i += cols) {
    const slice = options.slice(i, i + cols);
    const cells: TableCell[] = [];

    for (let c = 0; c < cols; c++) {
      const opt = slice[c];
      const cleanLabel = opt?.label.trim().toLowerCase() ?? '';
      const cleanText = opt?.text.trimStart() ?? '';

      const cellRuns: TextRun[] = opt
        ? [
            ...(cleanLabel
              ? buildScriptTextRuns(`${cleanLabel} `, fonts, {
                  bold: false,
                  color: '18181B',
                })
              : []),
            ...buildScriptTextRuns(cleanText, fonts, {
              bold: false,
              color: '18181B',
            }),
          ]
        : [];

      cells.push(
        new TableCell({
          width: { size: colWidthTwips, type: WidthType.DXA },
          borders: NO_CELL_BORDERS,
          margins: isSingleSpacing
            ? { top: 0, bottom: 0, left: 20, right: 60 }
            : { top: 30, bottom: 30, left: 40, right: 80 },
          children: [
            new Paragraph({
              spacing: {
                before: 0,
                after: 0,
                line: spacing.line,
                lineRule: LineRuleType.AUTO,
              },
              children: cellRuns,
            }),
          ],
        })
      );
    }

    rows.push(new TableRow({ children: cells }));
  }

  return new Table({
    layout: TableLayoutType.FIXED,
    indent: { size: indentTwips, type: WidthType.DXA },
    width: { size: availableTableTwips, type: WidthType.DXA },
    columnWidths,
    borders: NO_TABLE_BORDERS,
    rows,
  });
}

export async function exportLipiDocumentToDocx(
  docData: LipiDocument,
  typography: TypographySettings
): Promise<void> {
  const fonts = getFontConfig(typography.typeface);
  const spacing = getSpacingTwips(typography.density);

  const docChildren: Array<Paragraph | Table> = [];
  const titleText =
    docData.meta.examHeader?.enabled && docData.meta.examHeader.examName.trim()
      ? docData.meta.examHeader.examName.trim()
      : docData.meta.title.trim() || 'Untitled Document';

  if (docData.meta.examHeader?.enabled) {
    const headerElements = await buildExamHeaderElements(docData.meta.examHeader, fonts);
    docChildren.push(...headerElements);
  } else {
    const totalMarksText =
      typography.showMarksBadges && docData.meta.totalMarks.trim()
        ? docData.meta.totalMarks.trim()
        : '';

    const titleParagraph = new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: {
        before: 0,
        after: spacing.after,
        line: spacing.line,
        lineRule: LineRuleType.AUTO,
      },
      children: buildScriptTextRuns(titleText, fonts, {
        bold: true,
        color: '18181B',
        gujaratiSize: 28,
        englishSize: 32,
      }),
    });

    docChildren.push(
      buildParagraphWithRightMarks(titleParagraph, totalMarksText, fonts, spacing)
    );

    if (docData.meta.subtitle.trim()) {
      docChildren.push(
        new Paragraph({
          spacing: {
            before: 0,
            after: spacing.after,
            line: spacing.line,
            lineRule: LineRuleType.AUTO,
          },
          children: buildScriptTextRuns(docData.meta.subtitle.trim(), fonts, {
            bold: false,
            color: '52525B',
          }),
        })
      );
    }
  }

  for (const block of docData.blocks) {
    const marksLabel = typography.showMarksBadges ? formatMarksLabel(block.marks) : '';

    if (block.type === 'divider') {
      docChildren.push(
        new Paragraph({
          spacing: {
            before: spacing.before,
            after: spacing.after,
            line: spacing.line,
            lineRule: LineRuleType.AUTO,
          },
          border: {
            bottom: {
              color: 'D4D4D8',
              space: 1,
              style: BorderStyle.SINGLE,
              size: 6,
            },
          },
          children: [],
        })
      );
      continue;
    }

    // Heading questions (heading1 / heading2): bold only, no horizontal lines, Gujarati 10pt / English 12pt
    if (block.type === 'heading1' || block.type === 'heading2') {
      const headingPara = new Paragraph({
        spacing: {
          before: spacing.headingBefore,
          after: spacing.headingAfter,
          line: spacing.line,
          lineRule: LineRuleType.AUTO,
        },
        children: buildScriptTextRuns(block.text, fonts, {
          bold: true,
          color: '18181B',
        }),
      });
      docChildren.push(buildParagraphWithRightMarks(headingPara, marksLabel, fonts, spacing));
      continue;
    }

    if (block.type === 'shloka') {
      const shlokaPara = new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: {
          before: spacing.before,
          after: spacing.after,
          line: spacing.line,
          lineRule: LineRuleType.AUTO,
        },
        indent: {
          left: convertInchesToTwip(0.35),
          right: convertInchesToTwip(0.35),
        },
        shading: {
          type: ShadingType.CLEAR,
          color: 'auto',
          fill: 'FAF9F6',
        },
        border: {
          top: { color: 'E4E2DC', space: 4, style: BorderStyle.SINGLE, size: 4 },
          bottom: { color: 'E4E2DC', space: 4, style: BorderStyle.SINGLE, size: 4 },
          left: { color: 'E4E2DC', space: 6, style: BorderStyle.SINGLE, size: 4 },
          right: { color: 'E4E2DC', space: 6, style: BorderStyle.SINGLE, size: 4 },
        },
        children: buildScriptTextRuns(block.text, fonts, {
          bold: false,
          color: '1E293B',
        }),
      });

      docChildren.push(buildParagraphWithRightMarks(shlokaPara, marksLabel, fonts, spacing));
      continue;
    }

    if (block.type === 'mcq') {
      const stemPara = new Paragraph({
        spacing: {
          before: spacing.before,
          after: 0,
          line: spacing.line,
          lineRule: LineRuleType.AUTO,
        },
        children: buildScriptTextRuns(block.text, fonts, {
          bold: false,
          color: '18181B',
        }),
      });
      docChildren.push(buildParagraphWithRightMarks(stemPara, marksLabel, fonts, spacing));

      const opts = block.options || [];
      if (opts.length > 0) {
        const wordMeasureWidthPx = marksLabel ? 590 : 680;
        const cols = resolveMcqColumns(
          opts,
          wordMeasureWidthPx,
          typography.typeface,
          block.mcqLayout
        );
        docChildren.push(
          buildMcqOptionsTable(opts, cols, fonts, spacing, Boolean(marksLabel))
        );
        if (spacing.after > 0) {
          docChildren.push(
            new Paragraph({
              spacing: {
                before: 0,
                after: spacing.after,
                line: spacing.line,
                lineRule: LineRuleType.AUTO,
              },
              children: [],
            })
          );
        }
      }
      continue;
    }

    if (block.type === 'figure') {
      const align = getDocxAlignment(block.figureAlign);
      const imgRun = block.figureDataUrl
        ? await buildFigureImageRun(
            block.figureDataUrl,
            block.figureSize || 'medium',
            Boolean(marksLabel)
          )
        : null;

      if (imgRun) {
        const figPara = new Paragraph({
          alignment: align,
          spacing: {
            before: spacing.before || 40,
            after: block.text.trim() ? 20 : spacing.after || 40,
            line: spacing.line,
            lineRule: LineRuleType.AUTO,
          },
          children: [imgRun],
        });
        docChildren.push(buildParagraphWithRightMarks(figPara, marksLabel, fonts, spacing));
      }

      if (block.text.trim()) {
        const capPara = new Paragraph({
          alignment: align,
          spacing: {
            before: 0,
            after: spacing.after || 40,
            line: spacing.line,
            lineRule: LineRuleType.AUTO,
          },
          children: buildScriptTextRuns(block.text.trim(), fonts, {
            bold: false,
            color: '52525B',
          }),
        });
        docChildren.push(
          !imgRun && marksLabel
            ? buildParagraphWithRightMarks(capPara, marksLabel, fonts, spacing)
            : capPara
        );
      }
      continue;
    }

    // No auto-bullets: render bullet / numbered / paragraph cleanly with optional indent only
    const leftIndentTwips =
      (block.type === 'bullet' || block.type === 'numbered') && block.indentLevel > 0
        ? convertInchesToTwip(0.32 * block.indentLevel)
        : 0;

    const para = new Paragraph({
      indent: leftIndentTwips > 0 ? { left: leftIndentTwips } : undefined,
      spacing: {
        before: spacing.before,
        after: spacing.after,
        line: spacing.line,
        lineRule: LineRuleType.AUTO,
      },
      children: buildScriptTextRuns(block.text, fonts, {
        bold: false,
        color: '18181B',
      }),
    });
    docChildren.push(buildParagraphWithRightMarks(para, marksLabel, fonts, spacing));
  }

  const doc = new Document({
    creator: 'LipiWord',
    title: titleText,
    description: docData.meta.subtitle || 'Transcribed handwritten document',
    styles: {
      default: {
        document: {
          paragraph: {
            spacing: {
              before: 0,
              after: 0,
              line: spacing.line,
              lineRule: LineRuleType.AUTO,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH_TWIPS,
              height: A4_HEIGHT_TWIPS,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: NARROW_MARGIN_TWIPS,
              right: NARROW_MARGIN_TWIPS,
              bottom: NARROW_MARGIN_TWIPS,
              left: NARROW_MARGIN_TWIPS,
            },
          },
        },
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeBaseName =
    titleText
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 60) || 'LipiWord_Document';

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeBaseName}.docx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
