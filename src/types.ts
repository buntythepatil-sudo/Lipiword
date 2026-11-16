export type LanguageFocus = 'auto' | 'hindi' | 'gujarati' | 'sanskrit' | 'english';

export type StructurePreset = 'exam' | 'notes' | 'manuscript';

export type BlockType =
  | 'heading1'
  | 'heading2'
  | 'paragraph'
  | 'bullet'
  | 'numbered'
  | 'shloka'
  | 'mcq'
  | 'figure'
  | 'divider';

export type IndentLevel = 0 | 1 | 2;

export interface McqOption {
  label: string;
  text: string;
}

export type McqLayoutMode = 'auto' | '4col' | '2col' | '1col';

export interface FigureBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export type FigureSize = 'small' | 'medium' | 'large' | 'full';
export type FigureAlign = 'left' | 'center' | 'right';

export interface DocumentBlock {
  id: string;
  type: BlockType;
  text: string;
  indentLevel: IndentLevel;
  marks?: string;
  pageIndex?: number;
  options?: McqOption[];
  mcqLayout?: McqLayoutMode;
  figureBox?: FigureBox;
  figureDataUrl?: string;
  rawFigureDataUrl?: string;
  refinedSvg?: string;
  isRefinedFigure?: boolean;
  figureEnhance?: boolean;
  figureSize?: FigureSize;
  figureAlign?: FigureAlign;
}

export interface ExamHeaderConfig {
  enabled: boolean;
  schoolName: string;
  examName: string;
  standard: string;
  date: string;
  subject: string;
  totalMarks: string;
  includeMarksGrid: boolean;
}

export interface DocumentMeta {
  title: string;
  subtitle: string;
  totalMarks: string;
  detectedScripts: string[];
  examHeader: ExamHeaderConfig;
}

export interface LipiDocument {
  meta: DocumentMeta;
  blocks: DocumentBlock[];
}

export type TypefaceStyle = 'editorial-serif' | 'modern-sans' | 'academic-classic';
export type SpacingDensity = 'compact' | 'balanced' | 'airy';
export type BulletSymbol = '•' | '▪' | '—';

export interface TypographySettings {
  typeface: TypefaceStyle;
  density: SpacingDensity;
  bulletSymbol: BulletSymbol;
  headingAccentRules: boolean;
  showMarksBadges: boolean;
}

export interface PaperPage {
  id: string;
  name: string;
  dataUrl: string;
  mimeType: string;
  rotation: number;
}
