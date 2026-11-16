import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Crop,
  ImagePlus,
  Indent,
  Loader2,
  Outdent,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import type {
  BlockType,
  DocumentBlock,
  DocumentMeta,
  FigureAlign,
  FigureSize,
  IndentLevel,
  LipiDocument,
  McqLayoutMode,
  McqOption,
  TypographySettings,
} from '../types';
import { readUploadedFigureFile } from '../utils/figureCrop';
import { resolveMcqColumns } from '../utils/mcqLayout';
import { hasGujaratiScript, splitScriptSegments } from '../utils/scriptRuns';

interface FormattedSheetProps {
  document: LipiDocument;
  typography: TypographySettings;
  selectedBlockId: string | null;
  hasPages: boolean;
  refiningBlockIds: Record<string, boolean>;
  onSelectBlock: (id: string | null, pageIndex?: number) => void;
  onUpdateMeta: (meta: DocumentMeta) => void;
  onOpenExamHeader: () => void;
  onOpenCropFigure: (blockId: string) => void;
  onToggleFigureEnhance: (blockId: string) => void;
  onRefineFigure: (blockId: string) => void;
  onToggleRefinedFigure: (blockId: string) => void;
  onUpdateBlock: (id: string, patch: Partial<DocumentBlock>) => void;
  onMoveBlock: (id: string, direction: 'up' | 'down') => void;
  onDeleteBlock: (id: string) => void;
  onAddBlock: (type: BlockType, afterId?: string) => void;
}

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  heading1: 'Heading Question (Bold)',
  heading2: 'Subheading Question (Bold)',
  paragraph: 'Paragraph / Question',
  bullet: 'Indented Line',
  numbered: 'Indented Question',
  shloka: 'Shloka / Quote',
  mcq: 'MCQ (Options)',
  figure: 'Figure / Diagram',
  divider: 'Divider',
};

const DEFAULT_MCQ_OPTIONS: McqOption[] = [
  { label: 'a)', text: 'Option a' },
  { label: 'b)', text: 'Option b' },
  { label: 'c)', text: 'Option c' },
  { label: 'd)', text: 'Option d' },
];

const AutoGrowTextarea: React.FC<{
  value: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onChange: (val: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}> = ({ value, placeholder, className, autoFocus, onChange, onFocus, onBlur }) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      const len = ref.current.value.length;
      ref.current.setSelectionRange(len, len);
    }
  }, [autoFocus]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={(e) => onChange(e.target.value)}
      className={`block w-full resize-none overflow-hidden bg-transparent p-0 m-0 outline-none focus:ring-0 ${className || ''}`}
    />
  );
};

/**
 * Renders text with Gujarati at 10pt (13.33px) and English/Latin at 12pt (16px).
 */
const ScriptFormattedText: React.FC<{
  text: string;
  placeholder?: string;
  bold?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}> = ({ text, placeholder, bold, className, onClick }) => {
  const clean = text;
  if (!clean) {
    return (
      <div
        onClick={onClick}
        className={`cursor-text text-[16px] text-[#64625D]/50 ${bold ? 'font-bold' : ''} ${className || ''}`}
      >
        {placeholder || ''}
      </div>
    );
  }

  const lines = clean.split(/\r?\n/);

  return (
    <div
      onClick={onClick}
      className={`cursor-text whitespace-pre-wrap break-words text-[#18181B] ${bold ? 'font-bold' : ''} ${className || ''}`}
    >
      {lines.map((line, lineIdx) => {
        const segments = splitScriptSegments(line);
        return (
          <React.Fragment key={lineIdx}>
            {lineIdx > 0 && <br />}
            {segments.length === 0 ? (
              <span>&nbsp;</span>
            ) : (
              segments.map((seg, segIdx) => (
                <span
                  key={segIdx}
                  className={seg.isGujarati ? 'text-[13.33px]' : 'text-[16px]'}
                >
                  {seg.text}
                </span>
              ))
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

function formatMarksDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed;
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) return trimmed;
  return `[${trimmed}]`;
}

function formatMetaLabel(
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

export const FormattedSheet: React.FC<FormattedSheetProps> = ({
  document,
  typography,
  selectedBlockId,
  hasPages,
  refiningBlockIds,
  onSelectBlock,
  onUpdateMeta,
  onOpenExamHeader,
  onOpenCropFigure,
  onToggleFigureEnhance,
  onRefineFigure,
  onToggleRefinedFigure,
  onUpdateBlock,
  onMoveBlock,
  onDeleteBlock,
  onAddBlock,
}) => {
  const sheetContentRef = useRef<HTMLDivElement | null>(null);
  const [contentWidth, setContentWidth] = useState(640);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingOptionKey, setEditingOptionKey] = useState<string | null>(null);

  useEffect(() => {
    const el = sheetContentRef.current;
    if (!el) return;
    const updateWidth = () => {
      const style = window.getComputedStyle(el);
      const padLeft = parseFloat(style.paddingLeft) || 0;
      const padRight = parseFloat(style.paddingRight) || 0;
      const inner = Math.max(240, el.clientWidth - padLeft - padRight);
      setContentWidth(inner);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, [typography.density]);

  const fontClass =
    typography.typeface === 'editorial-serif'
      ? 'doc-font-editorial-serif'
      : typography.typeface === 'modern-sans'
      ? 'doc-font-modern-sans'
      : 'doc-font-academic-classic';

  const densitySpacing =
    typography.density === 'compact'
      ? {
          blockGap: 'space-y-0',
          blockPad: 'py-0',
          leading: 'leading-[1.25]',
          sheetPadding: 'p-5 sm:p-12',
          mcqWrapperGap: 'space-y-0',
          mcqGridGapY: 'gap-y-0',
        }
      : typography.density === 'airy'
      ? {
          blockGap: 'space-y-5',
          blockPad: 'py-1.5',
          leading: 'leading-loose',
          sheetPadding: 'p-6 sm:p-12',
          mcqWrapperGap: 'space-y-2',
          mcqGridGapY: 'gap-y-2',
        }
      : {
          blockGap: 'space-y-3',
          blockPad: 'py-1',
          leading: 'leading-relaxed',
          sheetPadding: 'p-5 sm:p-12',
          mcqWrapperGap: 'space-y-1.5',
          mcqGridGapY: 'gap-y-1.5',
        };

  const getIndentPadding = (level: IndentLevel) => {
    if (level === 0) return 'pl-0';
    if (level === 1) return 'pl-6';
    return 'pl-12';
  };

  const renderRightMarks = (marks?: string) => {
    if (!typography.showMarksBadges || !marks || !marks.trim()) return null;
    return (
      <div className="shrink-0 ml-auto pl-3 text-right self-start pt-0.5">
        <span className="inline-block rounded border border-[#1D3557]/25 bg-[#1D3557]/6 px-1.5 py-0.5 font-mono-tabular text-xs font-semibold text-[#1D3557] whitespace-nowrap">
          {formatMarksDisplay(marks)}
        </span>
      </div>
    );
  };

  const handleUpdateMcqOption = (
    block: DocumentBlock,
    optIdx: number,
    patch: Partial<McqOption>
  ) => {
    const current = block.options || [];
    const next = current.map((o, i) => (i === optIdx ? { ...o, ...patch } : o));
    onUpdateBlock(block.id, { options: next });
  };

  const handleAddMcqOption = (block: DocumentBlock) => {
    const current = block.options || [];
    const nextChar = String.fromCharCode(97 + (current.length % 26));
    onUpdateBlock(block.id, {
      options: [...current, { label: `${nextChar})`, text: '' }],
    });
  };

  const handleRemoveMcqOption = (block: DocumentBlock, optIdx: number) => {
    const current = block.options || [];
    onUpdateBlock(block.id, {
      options: current.filter((_, i) => i !== optIdx),
    });
  };

  const renderEditableText = (
    block: DocumentBlock,
    options?: { bold?: boolean; placeholder?: string; center?: boolean }
  ) => {
    const isEditing = editingBlockId === block.id;
    const isGuj = hasGujaratiScript(block.text);
    const editSizeClass = isGuj ? 'text-[13.33px]' : 'text-[16px]';

    if (isEditing) {
      return (
        <AutoGrowTextarea
          autoFocus
          value={block.text}
          placeholder={options?.placeholder}
          onBlur={() => setEditingBlockId((prev) => (prev === block.id ? null : prev))}
          onChange={(val) => onUpdateBlock(block.id, { text: val })}
          className={`${editSizeClass} ${options?.bold ? 'font-bold' : ''} ${
            options?.center ? 'text-center' : ''
          } text-[#18181B] ${densitySpacing.leading}`}
        />
      );
    }

    return (
      <ScriptFormattedText
        text={block.text}
        placeholder={options?.placeholder}
        bold={options?.bold}
        className={`${options?.center ? 'text-center' : ''} ${densitySpacing.leading}`}
        onClick={() => {
          onSelectBlock(block.id, block.pageIndex);
          setEditingBlockId(block.id);
        }}
      />
    );
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-[#E4E2DC] bg-white overflow-hidden">
      {/* Sheet Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E2DC] bg-[#FAF9F6] px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0 text-xs text-[#64625D]">
          <span className="font-semibold text-[#18181B] whitespace-nowrap">
            Formatted Word Sheet
          </span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">A4 Narrow</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums whitespace-nowrap">
            {document.blocks.length} {document.blocks.length === 1 ? 'block' : 'blocks'}
          </span>
          {document.meta.detectedScripts.length > 0 && (
            <>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="hidden sm:inline truncate">
                {document.meta.detectedScripts.join(' / ')}
              </span>
            </>
          )}
        </div>
        <span className="text-xs text-[#64625D] whitespace-nowrap">
          Click any block to edit
        </span>
      </div>

      {/* Scrollable Paper Canvas (A4 794x1123px at 96 DPI, Narrow 0.5in margin) */}
      <div className="flex-1 overflow-auto bg-[#F1EFEA] p-4 sm:p-6">
        <div
          ref={sheetContentRef}
          className={`mx-auto max-w-[794px] min-h-[1123px] rounded-sm border border-[#E4E2DC] bg-white shadow-sm ${densitySpacing.sheetPadding} ${fontClass}`}
        >
          {/* Document Header */}
          {document.meta.examHeader?.enabled ? (
            <div className="mb-3">
              {/* Centered Bold School Name & Exam Name */}
              <div className="relative group/header">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={onOpenExamHeader}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenExamHeader();
                    }
                  }}
                  className="text-center cursor-pointer rounded-md px-2 py-1 hover:bg-[#FAF9F6] transition-colors"
                >
                  {document.meta.examHeader.schoolName.trim() ? (
                    <div className="font-bold text-[#18181B] leading-tight">
                      {splitScriptSegments(document.meta.examHeader.schoolName.trim()).map(
                        (seg, i) => (
                          <span
                            key={i}
                            className={seg.isGujarati ? 'text-[14.5px]' : 'text-[18px]'}
                          >
                            {seg.text}
                          </span>
                        )
                      )}
                    </div>
                  ) : (
                    <div className="font-sans text-sm font-semibold text-[#64625D]/60">
                      + Click to enter School Name
                    </div>
                  )}

                  {document.meta.examHeader.examName.trim() ? (
                    <div className="mt-0.5 font-bold text-[#18181B] leading-tight">
                      <ScriptFormattedText
                        text={document.meta.examHeader.examName.trim()}
                        bold
                        className="text-center leading-tight"
                      />
                    </div>
                  ) : (
                    <div className="mt-0.5 font-sans text-xs font-medium text-[#64625D]/60">
                      + Click to enter Exam Name
                    </div>
                  )}
                </div>

                {/* 3-Column Metadata Row: Std & Date (Left) | Subject (Center) | Total Marks (Right) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={onOpenExamHeader}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenExamHeader();
                    }
                  }}
                  className="mt-2 grid grid-cols-3 items-end gap-2 cursor-pointer rounded-md px-1 py-0.5 hover:bg-[#FAF9F6] transition-colors"
                >
                  <div className="text-left leading-tight">
                    {document.meta.examHeader.standard.trim() && (
                      <ScriptFormattedText
                        text={formatMetaLabel('Std', document.meta.examHeader.standard, [
                          'std',
                          'class',
                          'કક્ષા',
                          'ધોરણ',
                        ])}
                        bold
                        className="leading-tight"
                      />
                    )}
                    {document.meta.examHeader.date.trim() ? (
                      <ScriptFormattedText
                        text={formatMetaLabel('Date', document.meta.examHeader.date, [
                          'date',
                          'તારીખ',
                          'ता.',
                        ])}
                        bold
                        className="leading-tight"
                      />
                    ) : (
                      <span className="font-sans text-xs text-[#64625D]/60">Date: ______</span>
                    )}
                  </div>

                  <div className="text-center leading-tight">
                    {document.meta.examHeader.subject.trim() ? (
                      <ScriptFormattedText
                        text={formatMetaLabel('Subject', document.meta.examHeader.subject, [
                          'subject',
                          'sub',
                          'વિષય',
                          'विषय',
                        ])}
                        bold
                        className="text-center leading-tight"
                      />
                    ) : (
                      <span className="font-sans text-xs text-[#64625D]/60">Subject: ______</span>
                    )}
                  </div>

                  <div className="text-right leading-tight">
                    {document.meta.examHeader.totalMarks.trim() ? (
                      <ScriptFormattedText
                        text={formatMetaLabel('Total Marks', document.meta.examHeader.totalMarks, [
                          'total',
                          'marks',
                          'max',
                          'કુલ',
                          'ગુણ',
                          'कुल',
                        ])}
                        bold
                        className="text-right leading-tight"
                      />
                    ) : (
                      <span className="font-sans text-xs text-[#64625D]/60">
                        Total Marks: ___
                      </span>
                    )}
                  </div>
                </div>

                {/* Optional Student Name / Roll No & Question Marks Grid */}
                {document.meta.examHeader.includeMarksGrid && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-4 text-[13.33px] font-bold text-[#18181B]">
                      <span className="flex-1 truncate">
                        Name : _________________________________
                      </span>
                      <span className="shrink-0">Roll No : ___________</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-[#18181B] text-[11px] text-[#18181B]">
                        <tbody>
                          <tr>
                            {['Q. No.', 'Q.1', 'Q.2', 'Q.3', 'Q.4', 'Q.5', 'Total', 'Examiner Sign', ''].map(
                              (col, i) => (
                                <td
                                  key={i}
                                  className={`border border-[#18181B] px-1.5 py-0.5 text-center font-bold ${
                                    i === 8 ? 'w-16' : ''
                                  }`}
                                >
                                  {col || '\u00A0'}
                                </td>
                              )
                            )}
                          </tr>
                          <tr>
                            {['Marks', '', '', '', '', '', '', 'Supervisor Sign', ''].map(
                              (col, i) => (
                                <td
                                  key={i}
                                  className="border border-[#18181B] px-1.5 py-0.5 text-center font-bold"
                                >
                                  {col || '\u00A0'}
                                </td>
                              )
                            )}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Subtle quick edit trigger */}
                <div className="mt-1.5 flex justify-end font-sans">
                  <button
                    type="button"
                    onClick={onOpenExamHeader}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1D3557]/80 hover:text-[#1D3557] transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                    <span>Edit Heading</span>
                  </button>
                </div>
              </div>

              {/* Solid Horizontal Rule below Exam Heading */}
              <div className="mt-1.5 border-b-2 border-[#18181B]" />
            </div>
          ) : (
            /* Standard Document Header (when Exam Heading is disabled) */
            <div className="pb-3 mb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <AutoGrowTextarea
                    value={document.meta.title}
                    placeholder="Document Title"
                    onFocus={() => onSelectBlock(null)}
                    onChange={(val) => onUpdateMeta({ ...document.meta, title: val })}
                    className="text-xl sm:text-2xl font-bold text-[#18181B] tracking-tight leading-tight"
                  />
                </div>
                {typography.showMarksBadges && (
                  <input
                    type="text"
                    value={document.meta.totalMarks}
                    placeholder="Total Marks"
                    onFocus={() => onSelectBlock(null)}
                    onChange={(e) => onUpdateMeta({ ...document.meta, totalMarks: e.target.value })}
                    className="w-36 shrink-0 text-right font-mono-tabular text-xs font-semibold text-[#1D3557] bg-transparent border-b border-transparent focus:border-[#1D3557]/40 outline-none py-1 placeholder:text-[#64625D]/50"
                  />
                )}
              </div>

              <div className="mt-1">
                <AutoGrowTextarea
                  value={document.meta.subtitle}
                  placeholder="Add subtitle, subject, date, or chapter..."
                  onFocus={() => onSelectBlock(null)}
                  onChange={(val) => onUpdateMeta({ ...document.meta, subtitle: val })}
                  className="text-sm text-[#64625D] leading-normal"
                />
              </div>
            </div>
          )}

          {/* Blocks */}
          <div className={densitySpacing.blockGap}>
            {document.blocks.map((block, index) => {
              const isSelected = selectedBlockId === block.id;
              const isIndentedType = block.type === 'bullet' || block.type === 'numbered';
              const indentLevel = block.indentLevel ?? 0;

              const mcqOptions = block.options || [];
              const hasRightMarksForMcq = Boolean(
                typography.showMarksBadges && block.marks?.trim()
              );
              const mcqAvailableWidth =
                contentWidth - (hasRightMarksForMcq ? 92 : 16) - 16;
              const resolvedMcqCols =
                block.type === 'mcq'
                  ? resolveMcqColumns(
                      mcqOptions,
                      mcqAvailableWidth,
                      typography.typeface,
                      block.mcqLayout
                    )
                  : 1;

              const mcqGridClass =
                resolvedMcqCols === 4
                  ? `grid-cols-4 gap-x-3 ${densitySpacing.mcqGridGapY}`
                  : resolvedMcqCols === 3
                  ? `grid-cols-3 gap-x-4 ${densitySpacing.mcqGridGapY}`
                  : resolvedMcqCols === 2
                  ? `grid-cols-2 gap-x-6 ${densitySpacing.mcqGridGapY}`
                  : `grid-cols-1 ${densitySpacing.mcqGridGapY}`;

              return (
                <div
                  key={block.id}
                  onClick={() => onSelectBlock(block.id, block.pageIndex)}
                  className={`group relative rounded-lg transition-colors px-2.5 ${densitySpacing.blockPad} -mx-2.5 ${
                    isSelected
                      ? 'bg-[#FAF9F6] ring-1 ring-[#1D3557]/30'
                      : 'hover:bg-[#FAF9F6]/70'
                  }`}
                >
                  {/* Floating / Inline Block Toolbar when selected */}
                  {isSelected && (
                    <div
                      className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-[#E4E2DC] pb-2 font-sans"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        value={block.type}
                        onChange={(e) => {
                          const nextType = e.target.value as BlockType;
                          onUpdateBlock(block.id, {
                            type: nextType,
                            indentLevel:
                              nextType === 'bullet' || nextType === 'numbered'
                                ? block.indentLevel
                                : 0,
                            options:
                              nextType === 'mcq'
                                ? block.options?.length
                                  ? block.options
                                  : DEFAULT_MCQ_OPTIONS
                                : block.options,
                            mcqLayout: nextType === 'mcq' ? block.mcqLayout || 'auto' : undefined,
                            figureSize:
                              nextType === 'figure' ? block.figureSize || 'medium' : undefined,
                            figureAlign:
                              nextType === 'figure' ? block.figureAlign || 'center' : undefined,
                          });
                        }}
                        aria-label="Block type"
                        className="rounded-md border border-[#E4E2DC] bg-white px-2 py-1 text-xs font-medium text-[#18181B] outline-none focus:border-[#1D3557]"
                      >
                        {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((t) => (
                          <option key={t} value={t}>
                            {BLOCK_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>

                      {isIndentedType && (
                        <div className="flex items-center rounded-md border border-[#E4E2DC] bg-white">
                          <button
                            type="button"
                            disabled={indentLevel === 0}
                            onClick={() =>
                              onUpdateBlock(block.id, {
                                indentLevel: Math.max(0, indentLevel - 1) as IndentLevel,
                              })
                            }
                            className="p-1 text-[#64625D] hover:text-[#18181B] disabled:opacity-30"
                            title="Outdent"
                            aria-label="Outdent item"
                          >
                            <Outdent className="h-3.5 w-3.5" />
                          </button>
                          <span className="px-1.5 text-[11px] font-mono-tabular text-[#64625D]">
                            L{indentLevel + 1}
                          </span>
                          <button
                            type="button"
                            disabled={indentLevel === 2}
                            onClick={() =>
                              onUpdateBlock(block.id, {
                                indentLevel: Math.min(2, indentLevel + 1) as IndentLevel,
                              })
                            }
                            className="p-1 text-[#64625D] hover:text-[#18181B] disabled:opacity-30"
                            title="Indent"
                            aria-label="Indent item"
                          >
                            <Indent className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      {block.type === 'mcq' && (
                        <>
                          <select
                            value={block.mcqLayout || 'auto'}
                            onChange={(e) =>
                              onUpdateBlock(block.id, {
                                mcqLayout: e.target.value as McqLayoutMode,
                              })
                            }
                            aria-label="MCQ column layout"
                            className="rounded-md border border-[#E4E2DC] bg-white px-2 py-1 text-xs font-medium text-[#18181B] outline-none focus:border-[#1D3557]"
                          >
                            <option value="auto">
                              Auto ({resolvedMcqCols === 1 ? '4 Lines' : resolvedMcqCols === 2 ? '2 Lines' : `1 Line (${resolvedMcqCols} Cols)`})
                            </option>
                            <option value="4col">1 Line (4 Cols)</option>
                            <option value="2col">2 Lines (2 Cols)</option>
                            <option value="1col">4 Lines (1 Col)</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => handleAddMcqOption(block)}
                            className="inline-flex items-center gap-1 rounded-md border border-[#E4E2DC] bg-white px-2 py-1 text-xs font-medium text-[#18181B] hover:border-[#1D3557]"
                          >
                            <Plus className="h-3 w-3" />
                            Option
                          </button>
                        </>
                      )}

                      {block.type === 'figure' && (
                        <>
                          <select
                            value={block.figureSize || 'medium'}
                            onChange={(e) =>
                              onUpdateBlock(block.id, {
                                figureSize: e.target.value as FigureSize,
                              })
                            }
                            aria-label="Figure size"
                            className="rounded-md border border-[#E4E2DC] bg-white px-2 py-1 text-xs font-medium text-[#18181B] outline-none focus:border-[#1D3557]"
                          >
                            <option value="small">Small</option>
                            <option value="medium">Medium</option>
                            <option value="large">Large</option>
                            <option value="full">Full Width</option>
                          </select>

                          <select
                            value={block.figureAlign || 'center'}
                            onChange={(e) =>
                              onUpdateBlock(block.id, {
                                figureAlign: e.target.value as FigureAlign,
                              })
                            }
                            aria-label="Figure alignment"
                            className="rounded-md border border-[#E4E2DC] bg-white px-2 py-1 text-xs font-medium text-[#18181B] outline-none focus:border-[#1D3557]"
                          >
                            <option value="left">Align Left</option>
                            <option value="center">Center</option>
                            <option value="right">Align Right</option>
                          </select>

                          {hasPages && (
                            <button
                              type="button"
                              onClick={() => onOpenCropFigure(block.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#E4E2DC] bg-white px-2 py-1 text-xs font-medium text-[#18181B] hover:border-[#1D3557] hover:text-[#1D3557]"
                            >
                              <Crop className="h-3 w-3" />
                              <span>Crop Page</span>
                            </button>
                          )}

                          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E4E2DC] bg-white px-2 py-1 text-xs font-medium text-[#18181B] hover:border-[#1D3557] hover:text-[#1D3557]">
                            <ImagePlus className="h-3 w-3" />
                            <span>Upload</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file || !file.type.startsWith('image/')) return;
                                const dataUrl = await readUploadedFigureFile(file);
                                onUpdateBlock(block.id, {
                                  figureDataUrl: dataUrl,
                                  rawFigureDataUrl: dataUrl,
                                  refinedSvg: undefined,
                                  isRefinedFigure: false,
                                  figureBox: undefined,
                                });
                                e.target.value = '';
                              }}
                              className="hidden"
                            />
                          </label>

                          {hasPages && block.figureBox && !block.isRefinedFigure && (
                            <button
                              type="button"
                              onClick={() => onToggleFigureEnhance(block.id)}
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                                block.figureEnhance !== false
                                  ? 'border-[#1D3557] bg-[#1D3557]/8 text-[#1D3557]'
                                  : 'border-[#E4E2DC] bg-white text-[#64625D]'
                              }`}
                              title="Clean paper background for crisp printing"
                            >
                              <Sparkles className="h-3 w-3" />
                              <span>{block.figureEnhance !== false ? 'Clean Ink' : 'Raw Crop'}</span>
                            </button>
                          )}

                          {(block.figureDataUrl || block.rawFigureDataUrl) && (
                            <button
                              type="button"
                              disabled={Boolean(refiningBlockIds[block.id])}
                              onClick={() => onRefineFigure(block.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#1D3557] bg-[#1D3557] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#142640] disabled:opacity-50 transition-colors"
                              title="Redraw hand-drawn sketch into a crisp textbook diagram"
                            >
                              {refiningBlockIds[block.id] ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Wand2 className="h-3 w-3" />
                              )}
                              <span>
                                {refiningBlockIds[block.id]
                                  ? 'Refining...'
                                  : block.refinedSvg
                                  ? 'Re-refine'
                                  : 'Refine Diagram'}
                              </span>
                            </button>
                          )}

                          {block.refinedSvg && block.rawFigureDataUrl && (
                            <button
                              type="button"
                              onClick={() => onToggleRefinedFigure(block.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#E4E2DC] bg-[#FAF9F6] px-2 py-1 text-xs font-medium text-[#18181B] hover:border-[#1D3557]"
                              title="Switch between refined vector diagram and original hand-drawn crop"
                            >
                              <span>
                                {block.isRefinedFigure ? 'Show Sketch' : 'Show Refined'}
                              </span>
                            </button>
                          )}
                        </>
                      )}

                      {block.type !== 'divider' && (
                        <input
                          type="text"
                          value={block.marks || ''}
                          placeholder="Right marks (e.g. 5 Marks)"
                          onChange={(e) =>
                            onUpdateBlock(block.id, { marks: e.target.value || undefined })
                          }
                          className="w-36 rounded-md border border-[#E4E2DC] bg-white px-2 py-1 text-xs font-mono-tabular text-[#1D3557] outline-none focus:border-[#1D3557] placeholder:text-[#64625D]/60"
                        />
                      )}

                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => onMoveBlock(block.id, 'up')}
                          className="rounded-md border border-[#E4E2DC] bg-white p-1 text-[#64625D] hover:text-[#18181B] disabled:opacity-30"
                          title="Move block up"
                          aria-label="Move block up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === document.blocks.length - 1}
                          onClick={() => onMoveBlock(block.id, 'down')}
                          className="rounded-md border border-[#E4E2DC] bg-white p-1 text-[#64625D] hover:text-[#18181B] disabled:opacity-30"
                          title="Move block down"
                          aria-label="Move block down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onAddBlock('paragraph', block.id)}
                          className="rounded-md border border-[#E4E2DC] bg-white p-1 text-[#64625D] hover:text-[#1D3557]"
                          title="Insert block below"
                          aria-label="Insert block below"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteBlock(block.id)}
                          className="rounded-md border border-[#E4E2DC] bg-white p-1 text-[#64625D] hover:text-red-600"
                          title="Delete block"
                          aria-label="Delete block"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Block Content Rendering */}
                  {block.type === 'divider' ? (
                    <div className="py-2">
                      <hr className="border-t border-[#D4D4D8]" />
                    </div>
                  ) : block.type === 'heading1' || block.type === 'heading2' ? (
                    /* Heading Question: Bold only, NO horizontal line, Gujarati 10pt / English 12pt */
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {renderEditableText(block, {
                          bold: true,
                          placeholder: 'Heading question...',
                        })}
                      </div>
                      {renderRightMarks(block.marks)}
                    </div>
                  ) : block.type === 'shloka' ? (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 rounded-lg border border-[#E4E2DC] bg-[#FAF9F6] px-6 py-4 text-center">
                        {renderEditableText(block, {
                          center: true,
                          placeholder: 'श्लोकः / Verse / Quote...',
                        })}
                      </div>
                      {renderRightMarks(block.marks)}
                    </div>
                  ) : block.type === 'mcq' ? (
                    <div className={densitySpacing.mcqWrapperGap}>
                      {/* Question stem + right marks */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {renderEditableText(block, {
                            placeholder: 'MCQ Question...',
                          })}
                        </div>
                        {renderRightMarks(block.marks)}
                      </div>

                      {/* Adaptive Column CSS Grid for MCQ Options (1 line -> 2 lines -> 4 lines) */}
                      <div
                        className={`grid ${mcqGridClass} items-start pl-3 sm:pl-4 ${
                          hasRightMarksForMcq ? 'pr-16 sm:pr-20' : ''
                        }`}
                      >
                        {mcqOptions.map((opt, optIdx) => {
                          const optionKey = `${block.id}-${optIdx}`;
                          const isEditingOpt = editingOptionKey === optionKey;
                          const cleanLabel = opt.label.trim().toLowerCase();
                          const cleanText = opt.text.trimStart();
                          const optIsGuj = hasGujaratiScript(cleanText);

                          return (
                            <div
                              key={optIdx}
                              onBlur={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                  setEditingOptionKey((prev) =>
                                    prev === optionKey ? null : prev
                                  );
                                }
                              }}
                              className="flex items-start gap-1 min-w-0 rounded px-1 py-0 hover:bg-white/80"
                            >
                              {isEditingOpt ? (
                                <>
                                  <input
                                    type="text"
                                    value={opt.label.toLowerCase()}
                                    onChange={(e) =>
                                      handleUpdateMcqOption(block, optIdx, {
                                        label: e.target.value.toLowerCase(),
                                      })
                                    }
                                    aria-label={`Option ${optIdx + 1} label`}
                                    style={{
                                      width: `${Math.max(2, cleanLabel.length + 0.5)}ch`,
                                    }}
                                    className={`shrink-0 bg-transparent text-[16px] font-normal text-[#18181B] outline-none ${densitySpacing.leading}`}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <AutoGrowTextarea
                                      autoFocus
                                      value={opt.text}
                                      placeholder="Option text"
                                      onChange={(val) =>
                                        handleUpdateMcqOption(block, optIdx, { text: val })
                                      }
                                      className={`${
                                        optIsGuj ? 'text-[13.33px]' : 'text-[16px]'
                                      } text-[#18181B] ${densitySpacing.leading}`}
                                    />
                                  </div>
                                </>
                              ) : (
                                <div
                                  role="button"
                                  tabIndex={0}
                                  title={opt.text || undefined}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectBlock(block.id, block.pageIndex);
                                    setEditingOptionKey(optionKey);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      onSelectBlock(block.id, block.pageIndex);
                                      setEditingOptionKey(optionKey);
                                    }
                                  }}
                                  className={`flex-1 min-w-0 break-words cursor-text ${densitySpacing.leading}`}
                                >
                                  {cleanLabel && (
                                    <span
                                      className={`font-normal text-[#18181B] ${
                                        hasGujaratiScript(cleanLabel)
                                          ? 'text-[13.33px]'
                                          : 'text-[16px]'
                                      }`}
                                    >
                                      {cleanLabel}{' '}
                                    </span>
                                  )}
                                  {cleanText ? (
                                    splitScriptSegments(cleanText).map((seg, segIdx) => (
                                      <span
                                        key={segIdx}
                                        className={`text-[#18181B] ${
                                          seg.isGujarati ? 'text-[13.33px]' : 'text-[16px]'
                                        }`}
                                      >
                                        {seg.text}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[16px] text-[#64625D]/50">
                                      Option text
                                    </span>
                                  )}
                                </div>
                              )}
                              {isSelected && mcqOptions.length > 2 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveMcqOption(block, optIdx);
                                  }}
                                  className="shrink-0 p-0.5 text-[#64625D] hover:text-red-600"
                                  title="Remove option"
                                  aria-label="Remove option"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : block.type === 'figure' ? (
                    <div className="flex items-start justify-between gap-4 py-1">
                      <div className="flex-1 min-w-0">
                        {(() => {
                          const align = block.figureAlign || 'center';
                          const size = block.figureSize || 'medium';
                          const alignFlexClass =
                            align === 'left'
                              ? 'items-start text-left'
                              : align === 'right'
                              ? 'items-end text-right'
                              : 'items-center text-center';
                          const maxWClass =
                            size === 'small'
                              ? 'max-w-[190px]'
                              : size === 'large'
                              ? 'max-w-[470px]'
                              : size === 'full'
                              ? 'max-w-full'
                              : 'max-w-[320px]';

                          return (
                            <div className={`flex flex-col ${alignFlexClass} gap-1`}>
                              {block.figureDataUrl ? (
                                <div className="relative inline-block">
                                  <img
                                    src={block.figureDataUrl}
                                    alt={block.text || 'Scanned diagram or figure'}
                                    referrerPolicy="no-referrer"
                                    className={`${maxWClass} w-auto max-h-[380px] object-contain rounded border border-[#E4E2DC]/60 bg-white`}
                                  />
                                  {refiningBlockIds[block.id] && (
                                    <div className="absolute inset-0 flex items-center justify-center rounded bg-white/80 backdrop-blur-[1px] font-sans">
                                      <span className="inline-flex items-center gap-1.5 rounded-md border border-[#1D3557]/25 bg-white px-2.5 py-1 text-xs font-medium text-[#1D3557] shadow-xs">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Refining diagram...
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed border-[#D8D5CE] bg-[#FAF9F6] px-4 py-5 font-sans text-xs text-[#64625D]">
                                  {hasPages && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenCropFigure(block.id);
                                      }}
                                      className="inline-flex items-center gap-1.5 rounded-md border border-[#1D3557] bg-white px-2.5 py-1.5 font-medium text-[#1D3557] hover:bg-[#1D3557]/5"
                                    >
                                      <Crop className="h-3.5 w-3.5" />
                                      <span>Crop from Page</span>
                                    </button>
                                  )}
                                  <label
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#E4E2DC] bg-white px-2.5 py-1.5 font-medium text-[#18181B] hover:border-[#1D3557]"
                                  >
                                    <ImagePlus className="h-3.5 w-3.5" />
                                    <span>Upload Image</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file || !file.type.startsWith('image/')) return;
                                        const dataUrl = await readUploadedFigureFile(file);
                                        onUpdateBlock(block.id, {
                                          figureDataUrl: dataUrl,
                                          rawFigureDataUrl: dataUrl,
                                          refinedSvg: undefined,
                                          isRefinedFigure: false,
                                          figureBox: undefined,
                                        });
                                        e.target.value = '';
                                      }}
                                      className="hidden"
                                    />
                                  </label>
                                </div>
                              )}

                              {(block.text.trim() || isSelected) && (
                                <div className="w-full max-w-[480px]">
                                  {renderEditableText(block, {
                                    center: align === 'center',
                                    placeholder: 'Figure caption / label (optional)...',
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      {renderRightMarks(block.marks)}
                    </div>
                  ) : (
                    /* Paragraph / Indented line — NO auto-bullets */
                    <div
                      className={`flex items-start justify-between gap-4 ${
                        isIndentedType ? getIndentPadding(indentLevel) : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        {renderEditableText(block, {
                          placeholder: 'Question or paragraph text...',
                        })}
                      </div>
                      {renderRightMarks(block.marks)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick-Add Block Bar */}
          <div className="mt-8 pt-4 border-t border-dashed border-[#E4E2DC] flex flex-wrap items-center gap-1.5 font-sans">
            <span className="text-xs text-[#64625D] mr-1">Insert:</span>
            {(
              [
                ['heading1', 'Heading Question'],
                ['paragraph', 'Paragraph'],
                ['mcq', 'MCQ'],
                ['figure', 'Figure / Image'],
                ['shloka', 'Shloka'],
                ['divider', 'Divider'],
              ] as Array<[BlockType, string]>
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => onAddBlock(t)}
                className="inline-flex items-center gap-1 rounded-md border border-[#E4E2DC] bg-[#FAF9F6] px-2.5 py-1 text-xs font-medium text-[#18181B] hover:border-[#1D3557] hover:text-[#1D3557] transition-colors whitespace-nowrap"
              >
                <Plus className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
