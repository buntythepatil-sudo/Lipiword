import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Crop,
  Download,
  FileText,
  GripVertical,
  Loader2,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { ExamHeaderForm, ExamHeaderModal } from './components/ExamHeaderForm';
import { FigureCropModal } from './components/FigureCropModal';
import { FormattedSheet } from './components/FormattedSheet';
import { PaperViewer } from './components/PaperViewer';
import { ScriptGuideModal } from './components/ScriptGuideModal';
import { TypographyBar } from './components/TypographyBar';
import { WebcamModal } from './components/WebcamModal';
import type {
  BlockType,
  DocumentBlock,
  DocumentMeta,
  ExamHeaderConfig,
  FigureBox,
  LanguageFocus,
  LipiDocument,
  PaperPage,
  StructurePreset,
  TypographySettings,
} from './types';
import { exportLipiDocumentToDocx } from './utils/docxExport';
import { cropFigureFromPage, renderSvgToHighDpiPng } from './utils/figureCrop';

const LANGUAGE_OPTIONS: Array<{ value: LanguageFocus; label: string; nativeHint: string }> = [
  { value: 'auto', label: 'Auto-detect', nativeHint: 'All Scripts' },
  { value: 'hindi', label: 'Hindi', nativeHint: 'हिन्दी' },
  { value: 'gujarati', label: 'Gujarati', nativeHint: 'ગુજરાતી' },
  { value: 'sanskrit', label: 'Sanskrit', nativeHint: 'संस्कृतम्' },
  { value: 'english', label: 'English', nativeHint: 'Latin' },
];

const PRESET_OPTIONS: Array<{
  value: StructurePreset;
  title: string;
  description: string;
}> = [
  {
    value: 'exam',
    title: 'Exam & Marks',
    description:
      'Extracts paper title, total marks, numbered questions, sub-bullets, and margin marks badges like [5 Marks] or [10 M].',
  },
  {
    value: 'notes',
    title: 'Study Notes',
    description:
      'Structures handwritten lecture or revision notes into clear headings, definitions, and 3-level nested bullet lists.',
  },
  {
    value: 'manuscript',
    title: 'Manuscript & Shloka',
    description:
      'Preserves verses and shlokas with line breaks, halants, visarga, avagraha (ऽ), and dandas (। / ॥) alongside prose commentary.',
  },
];

function createDefaultExamHeader(enabled = true): ExamHeaderConfig {
  return {
    enabled,
    schoolName: '',
    examName: '',
    standard: '',
    date: '',
    subject: '',
    totalMarks: '',
    includeMarksGrid: false,
  };
}

function createEmptyDocument(examHeader?: ExamHeaderConfig): LipiDocument {
  return {
    meta: {
      title: 'Untitled Handwritten Document',
      subtitle: '',
      totalMarks: '',
      detectedScripts: [],
      examHeader: examHeader ? { ...examHeader } : createDefaultExamHeader(true),
    },
    blocks: [
      {
        id: `blk-${Date.now()}-1`,
        type: 'heading1',
        text: 'Section 1',
        indentLevel: 0,
      },
      {
        id: `blk-${Date.now()}-2`,
        type: 'paragraph',
        text: 'Start typing or upload a handwritten paper to transcribe automatically.',
        indentLevel: 0,
      },
    ],
  };
}

async function fileToPaperPage(file: File): Promise<PaperPage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });

  // Downscale if > 2200px or > ~1.8MB so diacritics stay sharp while multi-page uploads stay under proxy limits
  const optimizedUrl = await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 2200;
      const needsResize = img.width > maxDim || img.height > maxDim;
      const needsCompress = dataUrl.length > 1_800_000;
      if (!needsResize && !needsCompress) {
        resolve(dataUrl);
        return;
      }
      const scale = needsResize ? Math.min(maxDim / img.width, maxDim / img.height) : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

  return {
    id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    dataUrl: optimizedUrl,
    mimeType: optimizedUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
    rotation: 0,
  };
}

async function getOrientedPagePayload(page: PaperPage) {
  const normalizedRot = ((page.rotation % 360) + 360) % 360;
  if (normalizedRot === 0) {
    return { mimeType: page.mimeType, data: page.dataUrl, name: page.name };
  }

  const rotatedDataUrl = await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const swap = normalizedRot === 90 || normalizedRot === 270;
      canvas.width = swap ? img.height : img.width;
      canvas.height = swap ? img.width : img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(page.dataUrl);
        return;
      }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((normalizedRot * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(page.dataUrl);
    img.src = page.dataUrl;
  });

  return { mimeType: 'image/jpeg', data: rotatedDataUrl, name: page.name };
}

async function parseApiJson<T extends { error?: string }>(
  res: Response,
  fallbackError: string
): Promise<T> {
  const rawText = await res.text();
  let parsed: T | null = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as T;
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    if (parsed?.error) {
      throw new Error(parsed.error);
    }
    if (res.status === 413) {
      throw new Error('Uploaded pages are too large. Try fewer pages or smaller images.');
    }
    const snippet = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
    throw new Error(snippet ? `${fallbackError} (${res.status}: ${snippet})` : `${fallbackError} (HTTP ${res.status})`);
  }

  if (!parsed) {
    throw new Error(`${fallbackError} Server returned an unexpected response. Please try again.`);
  }

  return parsed;
}

export default function App() {
  const [workspaceMode, setWorkspaceMode] = useState<'upload' | 'studio'>('upload');
  const [mobilePane, setMobilePane] = useState<'split' | 'paper' | 'sheet'>('split');

  const [pages, setPages] = useState<PaperPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const [languageFocus, setLanguageFocus] = useState<LanguageFocus>('auto');
  const [structurePreset, setStructurePreset] = useState<StructurePreset>('exam');

  const [examHeader, setExamHeader] = useState<ExamHeaderConfig>(() =>
    createDefaultExamHeader(true)
  );
  const [documentData, setDocumentData] = useState<LipiDocument | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const [typography, setTypography] = useState<TypographySettings>({
    typeface: 'editorial-serif',
    density: 'compact',
    bulletSymbol: '•',
    headingAccentRules: false,
    showMarksBadges: true,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isWebcamOpen, setIsWebcamOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isExamHeaderOpen, setIsExamHeaderOpen] = useState(false);
  const [scanFigures, setScanFigures] = useState(true);
  const [autoRefineFigures, setAutoRefineFigures] = useState(true);
  const [cropBlockId, setCropBlockId] = useState<string | null>(null);
  const [refiningBlockIds, setRefiningBlockIds] = useState<Record<string, boolean>>({});
  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);
  const [dragOverPageIndex, setDragOverPageIndex] = useState<number | null>(null);

  const handleAddFiles = async (fileList: FileList | File[]) => {
    setErrorMessage(null);
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) {
      setErrorMessage('Please select valid image files (PNG, JPG, WEBP).');
      return;
    }
    try {
      const loaded = await Promise.all(files.map(fileToPaperPage));
      setPages((prev) => {
        const next = [...prev, ...loaded];
        if (prev.length === 0) setActivePageIndex(0);
        return next;
      });
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load image files.');
    }
  };

  const handleAddCapturedPhoto = (dataUrl: string) => {
    setErrorMessage(null);
    const newPage: PaperPage = {
      id: `cam-${Date.now()}`,
      name: `Camera Capture ${pages.length + 1}`,
      dataUrl,
      mimeType: 'image/jpeg',
      rotation: 0,
    };
    setPages((prev) => [...prev, newPage]);
    setActivePageIndex(pages.length);
  };

  const handleRotatePage = (index: number) => {
    setPages((prev) =>
      prev.map((p, i) => (i === index ? { ...p, rotation: (p.rotation + 90) % 360 } : p))
    );
  };

  const handleReorderPages = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= pages.length ||
      toIndex >= pages.length
    ) {
      return;
    }
    setPages((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
    setActivePageIndex((prevActive) => {
      if (prevActive === fromIndex) return toIndex;
      if (fromIndex < prevActive && toIndex >= prevActive) return prevActive - 1;
      if (fromIndex > prevActive && toIndex <= prevActive) return prevActive + 1;
      return prevActive;
    });
  };

  const handleMovePage = (index: number, delta: -1 | 1) => {
    handleReorderPages(index, index + delta);
  };

  const handleRemovePage = (index: number) => {
    setPages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (activePageIndex >= next.length) {
        setActivePageIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const handleTranscribe = async (
    overrideLang?: LanguageFocus,
    overridePreset?: StructurePreset
  ) => {
    if (pages.length === 0) {
      setErrorMessage('Upload or capture at least one handwritten paper image first.');
      return;
    }
    setErrorMessage(null);
    setIsTranscribing(true);
    setWorkspaceMode('studio');

    try {
      const payloadPages = await Promise.all(pages.map(getOrientedPagePayload));
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pages: payloadPages,
          languageFocus: overrideLang || languageFocus,
          structurePreset: overridePreset || structurePreset,
          scanFigures,
        }),
      });

      const data = await parseApiJson<{
        meta?: Partial<DocumentMeta>;
        blocks?: DocumentBlock[];
        error?: string;
      }>(res, 'Transcription failed.');

      const rawBlocks: DocumentBlock[] = Array.isArray(data.blocks) ? data.blocks : [];
      const croppedBlocks: DocumentBlock[] = await Promise.all(
        rawBlocks.map(async (blk) => {
          if (blk.type === 'figure' && blk.figureBox) {
            const pIdx = typeof blk.pageIndex === 'number' ? blk.pageIndex : 0;
            const sourcePage = pages[pIdx] || pages[0];
            if (sourcePage) {
              try {
                const croppedUrl = await cropFigureFromPage(
                  sourcePage.dataUrl,
                  sourcePage.rotation,
                  blk.figureBox,
                  blk.figureEnhance !== false
                );
                return {
                  ...blk,
                  figureDataUrl: croppedUrl,
                  rawFigureDataUrl: croppedUrl,
                  isRefinedFigure: false,
                };
              } catch {
                return blk;
              }
            }
          }
          return blk;
        })
      );

      const mergedExamHeader: ExamHeaderConfig = {
        ...examHeader,
        totalMarks: examHeader.totalMarks.trim()
          ? examHeader.totalMarks
          : data.meta?.totalMarks || '',
      };
      setExamHeader(mergedExamHeader);
      setDocumentData({
        meta: {
          title: data.meta?.title || 'Untitled Handwritten Document',
          subtitle: data.meta?.subtitle || '',
          totalMarks: data.meta?.totalMarks || '',
          detectedScripts: data.meta?.detectedScripts || [],
          examHeader: mergedExamHeader,
        },
        blocks: croppedBlocks,
      });
      setSelectedBlockId(croppedBlocks?.[0]?.id ?? null);

      if (autoRefineFigures) {
        const figureBlocks = croppedBlocks.filter(
          (b) => b.type === 'figure' && (b.rawFigureDataUrl || b.figureDataUrl)
        );
        void Promise.all(
          figureBlocks.map((b) =>
            refineFigureBlock(b.id, b.rawFigureDataUrl || b.figureDataUrl || '', b.text)
          )
        );
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to transcribe paper. Please try again.'
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleOpenBlankSheet = () => {
    setErrorMessage(null);
    if (!documentData) {
      setDocumentData(createEmptyDocument(examHeader));
    }
    setWorkspaceMode('studio');
  };

  const handleExportDocx = async () => {
    const docToExport = documentData || createEmptyDocument(examHeader);
    setIsExporting(true);
    setErrorMessage(null);
    try {
      await exportLipiDocumentToDocx(docToExport, typography);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to generate .docx file.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  // Document editing handlers
  const handleExamHeaderChange = (next: ExamHeaderConfig) => {
    setExamHeader(next);
    setDocumentData((prev) =>
      prev ? { ...prev, meta: { ...prev.meta, examHeader: next } } : prev
    );
  };

  const handleUpdateMeta = (meta: DocumentMeta) => {
    if (meta.examHeader) {
      setExamHeader(meta.examHeader);
    }
    setDocumentData((prev) => (prev ? { ...prev, meta } : prev));
  };

  const handleUpdateBlock = (id: string, patch: Partial<DocumentBlock>) => {
    setDocumentData((prev) =>
      prev
        ? {
            ...prev,
            blocks: prev.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
          }
        : prev
    );
  };

  const handleMoveBlock = (id: string, direction: 'up' | 'down') => {
    setDocumentData((prev) => {
      if (!prev) return prev;
      const idx = prev.blocks.findIndex((b) => b.id === id);
      if (idx === -1) return prev;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.blocks.length) return prev;
      const next = [...prev.blocks];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return { ...prev, blocks: next };
    });
  };

  const handleDeleteBlock = (id: string) => {
    setDocumentData((prev) => {
      if (!prev) return prev;
      const next = prev.blocks.filter((b) => b.id !== id);
      return { ...prev, blocks: next };
    });
    if (selectedBlockId === id) {
      setSelectedBlockId(null);
    }
  };

  const refineFigureBlock = async (
    blockId: string,
    sourceDataUrl: string,
    caption?: string
  ) => {
    if (!sourceDataUrl) return;
    setRefiningBlockIds((prev) => ({ ...prev, [blockId]: true }));
    try {
      const res = await fetch('/api/refine-figure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: sourceDataUrl,
          caption: caption || '',
        }),
      });
      const data = await parseApiJson<{
        svg?: string;
        detectedCaption?: string;
        error?: string;
      }>(res, 'Failed to refine diagram.');
      if (!data.svg) {
        throw new Error(data.error || 'Failed to refine diagram.');
      }
      const pngUrl = await renderSvgToHighDpiPng(data.svg);
      setDocumentData((prev) =>
        prev
          ? {
              ...prev,
              blocks: prev.blocks.map((b) =>
                b.id === blockId
                  ? {
                      ...b,
                      rawFigureDataUrl: b.rawFigureDataUrl || sourceDataUrl,
                      refinedSvg: data.svg,
                      figureDataUrl: pngUrl,
                      isRefinedFigure: true,
                      text:
                        !b.text.trim() && data.detectedCaption
                          ? data.detectedCaption
                          : b.text,
                    }
                  : b
              ),
            }
          : prev
      );
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not refine hand-drawn diagram.'
      );
    } finally {
      setRefiningBlockIds((prev) => {
        const next = { ...prev };
        delete next[blockId];
        return next;
      });
    }
  };

  const handleRefineFigure = (id: string) => {
    const doc = documentData || createEmptyDocument(examHeader);
    const blk = doc.blocks.find((b) => b.id === id);
    if (!blk) return;
    const sourceUrl = blk.rawFigureDataUrl || blk.figureDataUrl;
    if (!sourceUrl) return;
    void refineFigureBlock(id, sourceUrl, blk.text);
  };

  const handleToggleRefinedFigure = async (id: string) => {
    const doc = documentData || createEmptyDocument(examHeader);
    const blk = doc.blocks.find((b) => b.id === id);
    if (!blk || !blk.refinedSvg || !blk.rawFigureDataUrl) return;

    if (blk.isRefinedFigure) {
      handleUpdateBlock(id, {
        figureDataUrl: blk.rawFigureDataUrl,
        isRefinedFigure: false,
      });
    } else {
      const pngUrl = await renderSvgToHighDpiPng(blk.refinedSvg);
      handleUpdateBlock(id, {
        figureDataUrl: pngUrl,
        isRefinedFigure: true,
      });
    }
  };

  const handleToggleFigureEnhance = async (id: string) => {
    const doc = documentData || createEmptyDocument(examHeader);
    const blk = doc.blocks.find((b) => b.id === id);
    if (!blk || !blk.figureBox) return;
    const pIdx = typeof blk.pageIndex === 'number' ? blk.pageIndex : activePageIndex;
    const sourcePage = pages[pIdx] || pages[0];
    if (!sourcePage) return;

    const nextEnhance = blk.figureEnhance === false;
    const nextUrl = await cropFigureFromPage(
      sourcePage.dataUrl,
      sourcePage.rotation,
      blk.figureBox,
      nextEnhance
    );
    handleUpdateBlock(id, {
      figureEnhance: nextEnhance,
      figureDataUrl: nextUrl,
      rawFigureDataUrl: nextUrl,
      isRefinedFigure: false,
    });
  };

  const handleApplyFigureCrop = (result: {
    pageIndex: number;
    box: FigureBox;
    dataUrl: string;
    enhance: boolean;
  }) => {
    if (cropBlockId === '__new__') {
      const newBlock: DocumentBlock = {
        id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'figure',
        text: '',
        indentLevel: 0,
        pageIndex: result.pageIndex,
        figureBox: result.box,
        figureDataUrl: result.dataUrl,
        rawFigureDataUrl: result.dataUrl,
        isRefinedFigure: false,
        figureEnhance: result.enhance,
        figureSize: 'medium',
        figureAlign: 'center',
      };
      setDocumentData((prev) => {
        const base = prev || createEmptyDocument(examHeader);
        if (!selectedBlockId) {
          return { ...base, blocks: [...base.blocks, newBlock] };
        }
        const idx = base.blocks.findIndex((b) => b.id === selectedBlockId);
        if (idx === -1) {
          return { ...base, blocks: [...base.blocks, newBlock] };
        }
        const next = [...base.blocks];
        next.splice(idx + 1, 0, newBlock);
        return { ...base, blocks: next };
      });
      setSelectedBlockId(newBlock.id);
      if (autoRefineFigures) {
        void refineFigureBlock(newBlock.id, result.dataUrl, '');
      }
    } else if (cropBlockId) {
      handleUpdateBlock(cropBlockId, {
        pageIndex: result.pageIndex,
        figureBox: result.box,
        figureDataUrl: result.dataUrl,
        rawFigureDataUrl: result.dataUrl,
        refinedSvg: undefined,
        isRefinedFigure: false,
        figureEnhance: result.enhance,
      });
    }
    setCropBlockId(null);
  };

  const handleAddBlock = (type: BlockType, afterId?: string) => {
    if (type === 'figure' && pages.length > 0 && !afterId) {
      setCropBlockId('__new__');
      return;
    }
    const newBlock: DocumentBlock = {
      id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      text:
        type === 'divider'
          ? ''
          : type === 'heading1'
          ? 'New Section'
          : type === 'heading2'
          ? 'Subsection'
          : type === 'mcq'
          ? 'Q. Multiple choice question?'
          : type === 'shloka'
          ? 'श्लोकः / Verse line 1\nश्लोकः / Verse line 2 ॥'
          : '',
      indentLevel: 0,
      options:
        type === 'mcq'
          ? [
              { label: 'a)', text: 'Option 1' },
              { label: 'b)', text: 'Option 2' },
              { label: 'c)', text: 'Option 3' },
              { label: 'd)', text: 'Option 4' },
            ]
          : undefined,
      mcqLayout: type === 'mcq' ? 'auto' : undefined,
      figureSize: type === 'figure' ? 'medium' : undefined,
      figureAlign: type === 'figure' ? 'center' : undefined,
      figureEnhance: type === 'figure' ? true : undefined,
      pageIndex: activePageIndex,
    };

    setDocumentData((prev) => {
      const base = prev || createEmptyDocument(examHeader);
      if (!afterId) {
        return { ...base, blocks: [...base.blocks, newBlock] };
      }
      const idx = base.blocks.findIndex((b) => b.id === afterId);
      const next = [...base.blocks];
      next.splice(idx + 1, 0, newBlock);
      return { ...base, blocks: next };
    });
    setSelectedBlockId(newBlock.id);
  };

  const handleSelectBlock = (id: string | null, pageIndex?: number) => {
    setSelectedBlockId(id);
    if (typeof pageIndex === 'number' && pageIndex >= 0 && pageIndex < pages.length) {
      setActivePageIndex(pageIndex);
    }
  };

  const activeDoc = documentData || createEmptyDocument(examHeader);

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F5F2] text-[#18181B]">
      {/* Top Bar Contract: 3 zones, single row */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 border-b border-[#E4E2DC] bg-white px-4 py-3 sm:px-6 lg:px-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => setWorkspaceMode('upload')}
          className="font-display text-xl font-semibold tracking-tight text-[#18181B] whitespace-nowrap shrink-0 text-left"
        >
          LipiWord
        </button>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#64625D]">
          <button
            type="button"
            onClick={() => setWorkspaceMode('upload')}
            className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 border-b ${
              workspaceMode === 'upload'
                ? 'border-[#1D3557] text-[#18181B]'
                : 'border-transparent hover:text-[#18181B]'
            }`}
          >
            Upload & Capture
          </button>
          <button
            type="button"
            onClick={() => {
              if (!documentData && pages.length > 0) {
                handleTranscribe();
              } else {
                handleOpenBlankSheet();
              }
            }}
            className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 border-b ${
              workspaceMode === 'studio'
                ? 'border-[#1D3557] text-[#18181B]'
                : 'border-transparent hover:text-[#18181B]'
            }`}
          >
            Document Studio
          </button>
          <button
            type="button"
            onClick={() => {
              setDocumentData(createEmptyDocument(examHeader));
              setWorkspaceMode('studio');
            }}
            className="border-b border-transparent transition-colors hover:text-[#18181B] whitespace-nowrap shrink-0 pb-0.5"
          >
            Blank Sheet
          </button>
          <button
            type="button"
            onClick={() => setIsGuideOpen(true)}
            className="border-b border-transparent transition-colors hover:text-[#18181B] whitespace-nowrap shrink-0 pb-0.5"
          >
            Script Guide
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            disabled={isExporting || isTranscribing}
            onClick={handleExportDocx}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1D3557] px-4 py-2 text-xs font-medium text-white hover:bg-[#142640] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isExporting ? 'Generating...' : 'Export .docx'}</span>
          </button>
        </div>
      </header>

      {/* Error Banner (non-intrusive) */}
      {errorMessage && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="font-medium underline hover:no-underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content */}
      {workspaceMode === 'upload' ? (
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {/* Editorial Hero Lead */}
          <div className="max-w-3xl mb-8">
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#18181B] text-balance">
              Convert handwritten multilingual papers into structured Word documents.
            </h1>
            <p className="mt-2.5 text-sm sm:text-base text-[#64625D] leading-relaxed">
              Upload scans or capture pages in Hindi, Gujarati, Sanskrit, and English. LipiWord preserves original scripts, diacritics, nested lists, shlokas, and margin marks directly into an editable .docx studio.
            </p>
          </div>

          {/* 2-Column Upload + Presets Grid */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-stretch">
            {/* Left Column: Drag-and-Drop / Upload / Webcam + Page Queue */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              <div
                onDragOver={(e) => {
                  if (draggedPageIndex !== null) return;
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  if (draggedPageIndex !== null) return;
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.length) {
                    handleAddFiles(e.dataTransfer.files);
                  }
                }}
                className={`flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors min-h-[280px] ${
                  isDragging
                    ? 'border-[#1D3557] bg-[#1D3557]/5'
                    : 'border-[#D8D5CE] bg-white hover:border-[#B8B4AA]'
                }`}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#E4E2DC] bg-[#FAF9F6] text-[#1D3557]">
                  <Upload className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-base font-semibold text-[#18181B]">
                  Drop handwritten paper images here
                </h2>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-[#64625D]">
                  Supports single or multi-page uploads (JPG, PNG, WEBP). Mixed Devanagari, Gujarati, Sanskrit, and English scripts are preserved verbatim.
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1D3557] px-4 py-2.5 text-xs font-medium text-white hover:bg-[#142640] transition-colors whitespace-nowrap">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload Pages</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          handleAddFiles(e.target.files);
                          e.target.value = '';
                        }
                      }}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setIsWebcamOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#E4E2DC] bg-white px-4 py-2.5 text-xs font-medium text-[#18181B] hover:bg-[#FAF9F6] transition-colors whitespace-nowrap"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Capture via Webcam</span>
                  </button>
                </div>
              </div>

              {/* Uploaded Page Queue */}
              {pages.length > 0 && (
                <div className="rounded-xl border border-[#E4E2DC] bg-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs text-[#64625D]">
                      <span className="font-semibold text-[#18181B]">Paper Queue</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {pages.length} {pages.length === 1 ? 'page' : 'pages'} ready
                      </span>
                      {pages.length > 1 && (
                        <>
                          <span className="mx-1.5 hidden sm:inline" aria-hidden="true">·</span>
                          <span className="hidden sm:inline">Drag cards to reorder</span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPages([]);
                        setActivePageIndex(0);
                      }}
                      className="text-xs font-medium text-[#64625D] hover:text-red-600 transition-colors"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {pages.map((page, idx) => {
                      const isBeingDragged = draggedPageIndex === idx;
                      const isDropTarget =
                        dragOverPageIndex === idx &&
                        draggedPageIndex !== null &&
                        draggedPageIndex !== idx;

                      return (
                        <div
                          key={page.id}
                          draggable={pages.length > 1}
                          onDragStart={(e) => {
                            setDraggedPageIndex(idx);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', String(idx));
                          }}
                          onDragOver={(e) => {
                            if (draggedPageIndex === null) return;
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverPageIndex !== idx) {
                              setDragOverPageIndex(idx);
                            }
                          }}
                          onDragEnter={(e) => {
                            if (draggedPageIndex === null) return;
                            e.preventDefault();
                            setDragOverPageIndex(idx);
                          }}
                          onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                              setDragOverPageIndex((prev) => (prev === idx ? null : prev));
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const rawIdx = e.dataTransfer.getData('text/plain');
                            const sourceIdx =
                              draggedPageIndex !== null
                                ? draggedPageIndex
                                : rawIdx
                                ? Number(rawIdx)
                                : NaN;
                            if (!Number.isNaN(sourceIdx) && sourceIdx !== idx) {
                              handleReorderPages(sourceIdx, idx);
                            }
                            setDraggedPageIndex(null);
                            setDragOverPageIndex(null);
                          }}
                          onDragEnd={() => {
                            setDraggedPageIndex(null);
                            setDragOverPageIndex(null);
                          }}
                          className={`rounded-lg border overflow-hidden flex flex-col transition-all ${
                            pages.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${
                            isBeingDragged
                              ? 'opacity-45 scale-[0.98] border-[#1D3557]/50 bg-[#FAF9F6]'
                              : isDropTarget
                              ? 'border-[#1D3557] ring-2 ring-[#1D3557]/35 bg-[#1D3557]/5'
                              : 'border-[#E4E2DC] bg-[#FAF9F6] hover:border-[#B8B4AA]'
                          }`}
                        >
                          <div className="aspect-[4/3] bg-[#F1EFEA] overflow-hidden flex items-center justify-center p-1.5">
                            <img
                              src={page.dataUrl}
                              alt={page.name}
                              draggable={false}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-contain transition-transform pointer-events-none select-none"
                              style={{ transform: `rotate(${page.rotation}deg)` }}
                            />
                          </div>
                          <div className="flex items-center justify-between border-t border-[#E4E2DC] bg-white px-2 py-1.5">
                            <div className="flex items-center gap-1 min-w-0">
                              {pages.length > 1 && (
                                <GripVertical
                                  className="h-3.5 w-3.5 shrink-0 text-[#64625D]/70"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="text-[11px] font-medium text-[#18181B] tabular-nums truncate">
                                Page {idx + 1}
                              </span>
                            </div>
                            <div
                              className="flex items-center gap-0.5 shrink-0"
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMovePage(idx, -1)}
                                className="p-1 text-[#64625D] hover:text-[#18181B] disabled:opacity-30"
                                title="Move earlier"
                                aria-label="Move page earlier"
                              >
                                <ArrowLeft className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === pages.length - 1}
                                onClick={() => handleMovePage(idx, 1)}
                                className="p-1 text-[#64625D] hover:text-[#18181B] disabled:opacity-30"
                                title="Move later"
                                aria-label="Move page later"
                              >
                                <ArrowRight className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRotatePage(idx)}
                                className="p-1 text-[#64625D] hover:text-[#18181B]"
                                title="Rotate 90°"
                                aria-label="Rotate page"
                              >
                                <RotateCw className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemovePage(idx)}
                                className="p-1 text-[#64625D] hover:text-red-600"
                                title="Remove page"
                                aria-label="Remove page"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Language Focus, Structure Presets, & Transcribe CTA */}
            <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-[#E4E2DC] bg-white p-6 space-y-6">
              <div className="space-y-6">
                {/* Language Focus */}
                <div>
                  <h2 className="text-sm font-semibold text-[#18181B]">Language Focus</h2>
                  <p className="mt-0.5 text-xs text-[#64625D]">
                    Guides script disambiguation while keeping every original script intact.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setLanguageFocus(opt.value)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          languageFocus === opt.value
                            ? 'border-[#1D3557] bg-[#1D3557] text-white'
                            : 'border-[#E4E2DC] bg-[#FAF9F6] text-[#18181B] hover:border-[#B8B4AA]'
                        }`}
                      >
                        {opt.label}{' '}
                        <span
                          className={
                            languageFocus === opt.value ? 'text-white/75' : 'text-[#64625D]'
                          }
                        >
                          · {opt.nativeHint}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Structure Presets */}
                <div className="border-t border-[#E4E2DC] pt-5">
                  <h2 className="text-sm font-semibold text-[#18181B]">Structure Preset</h2>
                  <p className="mt-0.5 text-xs text-[#64625D]">
                    Choose how headings, lists, verses, and margin marks are organized.
                  </p>
                  <div className="mt-3 space-y-2.5">
                    {PRESET_OPTIONS.map((preset) => {
                      const active = structurePreset === preset.value;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => {
                            setStructurePreset(preset.value);
                            handleExamHeaderChange({
                              ...examHeader,
                              enabled: preset.value === 'exam',
                            });
                          }}
                          className={`w-full text-left rounded-lg border p-3.5 transition-colors ${
                            active
                              ? 'border-[#1D3557] bg-[#1D3557]/5'
                              : 'border-[#E4E2DC] bg-[#FAF9F6] hover:border-[#B8B4AA]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-[#18181B]">
                              {preset.title}
                            </span>
                            <span
                              className={`text-[11px] font-medium ${
                                active ? 'text-[#1D3557]' : 'text-[#64625D]'
                              }`}
                            >
                              {active ? 'Selected' : 'Select'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-[#64625D]">
                            {preset.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Maths & Science Figures / Diagrams toggles */}
                <div className="border-t border-[#E4E2DC] pt-4 space-y-2.5">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={scanFigures}
                      onChange={(e) => setScanFigures(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-[#E4E2DC] text-[#1D3557] focus:ring-[#1D3557]"
                    />
                    <div>
                      <span className="block text-xs font-semibold text-[#18181B]">
                        Scan Maths & Science Figures / Images
                      </span>
                      <span className="block text-[11px] leading-relaxed text-[#64625D]">
                        Automatically detects and crops geometry diagrams, graphs, circuits, apparatus sketches, and embedded images into the sheet and .docx.
                      </span>
                    </div>
                  </label>

                  {scanFigures && (
                    <label className="flex cursor-pointer items-start gap-2.5 pl-6">
                      <input
                        type="checkbox"
                        checked={autoRefineFigures}
                        onChange={(e) => setAutoRefineFigures(e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-[#E4E2DC] text-[#1D3557] focus:ring-[#1D3557]"
                      />
                      <div>
                        <span className="block text-xs font-medium text-[#18181B]">
                          Refine hand-drawn sketches into proper diagrams
                        </span>
                        <span className="block text-[11px] text-[#64625D]">
                          Redraws rough sketches into crisp textbook-grade vector diagrams with preserved labels.
                        </span>
                      </div>
                    </label>
                  )}
                </div>

                {/* School Exam Paper Heading */}
                <div className="border-t border-[#E4E2DC] pt-5">
                  <ExamHeaderForm
                    value={examHeader}
                    onChange={handleExamHeaderChange}
                    compact
                  />
                </div>
              </div>

              {/* Primary CTA & Secondary Blank Option */}
              <div className="border-t border-[#E4E2DC] pt-5 space-y-2.5">
                <button
                  type="button"
                  disabled={pages.length === 0 || isTranscribing}
                  onClick={() => handleTranscribe()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#1D3557] px-5 py-3 text-sm font-medium text-white hover:bg-[#142640] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {isTranscribing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Transcribing Paper...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>
                        {pages.length > 0
                          ? `Transcribe ${pages.length} ${
                              pages.length === 1 ? 'Page' : 'Pages'
                            } into Studio`
                          : 'Upload a Paper to Transcribe'}
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleOpenBlankSheet}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-[#E4E2DC] bg-white px-4 py-2 text-xs font-medium text-[#64625D] hover:text-[#18181B] hover:bg-[#FAF9F6] transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Open Document Studio Manually</span>
                </button>
              </div>
            </div>
          </div>
        </main>
      ) : (
        /* Interactive Document Studio View */
        <div className="flex flex-1 flex-col min-h-0">
          {/* Studio Action & Preset Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E2DC] bg-white px-4 py-2.5 lg:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setWorkspaceMode('upload')}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#E4E2DC] bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-medium text-[#18181B] hover:bg-[#F1EFEA] transition-colors whitespace-nowrap"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Pages ({pages.length})</span>
              </button>

              <div className="flex items-center gap-1.5">
                <label htmlFor="studio-lang" className="text-xs font-medium text-[#64625D] whitespace-nowrap">
                  Language
                </label>
                <select
                  id="studio-lang"
                  value={languageFocus}
                  onChange={(e) => setLanguageFocus(e.target.value as LanguageFocus)}
                  className="rounded-md border border-[#E4E2DC] bg-white px-2.5 py-1 text-xs font-medium text-[#18181B] outline-none focus:border-[#1D3557]"
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} ({opt.nativeHint})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <label htmlFor="studio-preset" className="text-xs font-medium text-[#64625D] whitespace-nowrap">
                  Preset
                </label>
                <select
                  id="studio-preset"
                  value={structurePreset}
                  onChange={(e) => {
                    const nextPreset = e.target.value as StructurePreset;
                    setStructurePreset(nextPreset);
                    handleExamHeaderChange({
                      ...examHeader,
                      enabled: nextPreset === 'exam',
                    });
                  }}
                  className="rounded-md border border-[#E4E2DC] bg-white px-2.5 py-1 text-xs font-medium text-[#18181B] outline-none focus:border-[#1D3557]"
                >
                  {PRESET_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setIsExamHeaderOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#E4E2DC] bg-[#FAF9F6] px-2.5 py-1 text-xs font-medium text-[#18181B] hover:border-[#1D3557] hover:text-[#1D3557] transition-colors whitespace-nowrap"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Exam Heading</span>
              </button>

              {pages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCropBlockId('__new__')}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#E4E2DC] bg-[#FAF9F6] px-2.5 py-1 text-xs font-medium text-[#18181B] hover:border-[#1D3557] hover:text-[#1D3557] transition-colors whitespace-nowrap"
                >
                  <Crop className="h-3.5 w-3.5" />
                  <span>Crop Figure</span>
                </button>
              )}

              {pages.length > 0 && (
                <button
                  type="button"
                  disabled={isTranscribing}
                  onClick={() => handleTranscribe()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#1D3557] bg-[#1D3557]/8 px-3 py-1 text-xs font-medium text-[#1D3557] hover:bg-[#1D3557]/15 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {isTranscribing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span>{isTranscribing ? 'Transcribing...' : 'Re-transcribe'}</span>
                </button>
              )}
            </div>

            {/* Responsive Mobile/Tablet Pane Switcher */}
            <div className="flex lg:hidden items-center rounded-lg border border-[#E4E2DC] bg-[#FAF9F6] p-0.5">
              {(
                [
                  ['split', 'Side-by-Side'],
                  ['paper', 'Original'],
                  ['sheet', 'Formatted'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setMobilePane(mode)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    mobilePane === mode
                      ? 'bg-white text-[#18181B] shadow-2xs'
                      : 'text-[#64625D]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Live Typography Bar */}
          <TypographyBar settings={typography} onChange={setTypography} />

          {/* Split Studio Panes */}
          <div className="flex-1 p-4 lg:p-6 overflow-hidden">
            <div
              className={`grid h-full gap-5 ${
                mobilePane === 'split'
                  ? 'grid-cols-1 lg:grid-cols-12'
                  : 'grid-cols-1'
              }`}
            >
              {/* Left Pane: Original Handwritten Paper */}
              {(mobilePane === 'split' || mobilePane === 'paper') && (
                <div
                  className={`${
                    mobilePane === 'split' ? 'lg:col-span-5' : ''
                  } min-h-[420px] lg:h-[calc(100vh-205px)]`}
                >
                  <PaperViewer
                    pages={pages}
                    activePageIndex={activePageIndex}
                    onSelectPage={setActivePageIndex}
                    onRotatePage={handleRotatePage}
                    onRemovePage={handleRemovePage}
                    onAddFiles={handleAddFiles}
                    onOpenCamera={() => setIsWebcamOpen(true)}
                  />
                </div>
              )}

              {/* Right Pane: Interactive Formatted Document Sheet */}
              {(mobilePane === 'split' || mobilePane === 'sheet') && (
                <div
                  className={`${
                    mobilePane === 'split' ? 'lg:col-span-7' : ''
                  } min-h-[540px] lg:h-[calc(100vh-205px)] relative`}
                >
                  {isTranscribing ? (
                    <div className="flex h-full flex-col rounded-xl border border-[#E4E2DC] bg-white overflow-hidden">
                      <div className="flex items-center justify-between border-b border-[#E4E2DC] bg-[#FAF9F6] px-4 py-2.5">
                        <span className="text-xs font-semibold text-[#18181B]">
                          Formatted Word Sheet
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-[#1D3557] font-medium">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Reading handwriting...
                        </span>
                      </div>
                      <div className="flex-1 bg-[#F1EFEA] p-6">
                        <div className="mx-auto max-w-[794px] rounded-sm border border-[#E4E2DC] bg-white p-10 space-y-5 animate-pulse">
                          <div className="h-7 w-2/3 rounded bg-[#EAE8E3]" />
                          <div className="h-4 w-1/3 rounded bg-[#F1EFEA]" />
                          <div className="border-t border-[#E4E2DC] pt-5 space-y-3">
                            <div className="h-5 w-1/2 rounded bg-[#EAE8E3]" />
                            <div className="h-4 w-full rounded bg-[#F1EFEA]" />
                            <div className="h-4 w-11/12 rounded bg-[#F1EFEA]" />
                            <div className="h-4 w-4/5 rounded bg-[#F1EFEA]" />
                          </div>
                          <div className="pt-3 space-y-3">
                            <div className="h-5 w-2/5 rounded bg-[#EAE8E3]" />
                            <div className="h-4 w-full rounded bg-[#F1EFEA]" />
                            <div className="h-4 w-5/6 rounded bg-[#F1EFEA]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <FormattedSheet
                      document={activeDoc}
                      typography={typography}
                      selectedBlockId={selectedBlockId}
                      hasPages={pages.length > 0}
                      refiningBlockIds={refiningBlockIds}
                      onSelectBlock={handleSelectBlock}
                      onUpdateMeta={handleUpdateMeta}
                      onOpenExamHeader={() => setIsExamHeaderOpen(true)}
                      onOpenCropFigure={(blockId) => setCropBlockId(blockId)}
                      onToggleFigureEnhance={handleToggleFigureEnhance}
                      onRefineFigure={handleRefineFigure}
                      onToggleRefinedFigure={handleToggleRefinedFigure}
                      onUpdateBlock={handleUpdateBlock}
                      onMoveBlock={handleMoveBlock}
                      onDeleteBlock={handleDeleteBlock}
                      onAddBlock={handleAddBlock}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <WebcamModal
        isOpen={isWebcamOpen}
        onClose={() => setIsWebcamOpen(false)}
        onCapture={handleAddCapturedPhoto}
      />

      <ScriptGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      <ExamHeaderModal
        isOpen={isExamHeaderOpen}
        value={examHeader}
        onChange={handleExamHeaderChange}
        onClose={() => setIsExamHeaderOpen(false)}
      />

      {(() => {
        const cropTargetBlock =
          cropBlockId && cropBlockId !== '__new__'
            ? activeDoc.blocks.find((b) => b.id === cropBlockId)
            : undefined;
        return (
          <FigureCropModal
            isOpen={Boolean(cropBlockId)}
            pages={pages}
            initialPageIndex={cropTargetBlock?.pageIndex ?? activePageIndex}
            initialBox={cropTargetBlock?.figureBox}
            initialEnhance={cropTargetBlock?.figureEnhance !== false}
            onApply={handleApplyFigureCrop}
            onClose={() => setCropBlockId(null)}
          />
        );
      })()}
    </div>
  );
}
