import React from 'react';
import { X } from 'lucide-react';
import type { ExamHeaderConfig } from '../types';

interface ExamHeaderFormProps {
  value: ExamHeaderConfig;
  onChange: (next: ExamHeaderConfig) => void;
  compact?: boolean;
}

export const ExamHeaderForm: React.FC<ExamHeaderFormProps> = ({
  value,
  onChange,
  compact = false,
}) => {
  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-[#18181B]">
            School Exam Paper Heading
          </h3>
          <p className="text-[11px] text-[#64625D]">
            Enter school name, exam name, date, subject, and total marks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...value, enabled: !value.enabled })}
          className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            value.enabled
              ? 'border-[#1D3557] bg-[#1D3557]/8 text-[#1D3557]'
              : 'border-[#E4E2DC] bg-white text-[#64625D]'
          }`}
        >
          {value.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {value.enabled && (
        <div className="space-y-3.5">

          {/* School Name & Exam Name */}
          <div className={`grid grid-cols-1 ${compact ? '' : 'sm:grid-cols-2'} gap-2.5`}>
            <div>
              <label className="block text-[11px] font-medium text-[#64625D] mb-1">
                School Name
              </label>
              <input
                type="text"
                value={value.schoolName}
                onChange={(e) => onChange({ ...value, schoolName: e.target.value })}
                placeholder="e.g. Shree Santram Primary School"
                className="w-full rounded-md border border-[#E4E2DC] bg-white px-2.5 py-1.5 text-xs text-[#18181B] outline-none focus:border-[#1D3557] placeholder:text-[#64625D]/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#64625D] mb-1">
                Exam Name
              </label>
              <input
                type="text"
                value={value.examName}
                onChange={(e) => onChange({ ...value, examName: e.target.value })}
                placeholder="e.g. First Terminal Exam"
                className="w-full rounded-md border border-[#E4E2DC] bg-white px-2.5 py-1.5 text-xs text-[#18181B] outline-none focus:border-[#1D3557] placeholder:text-[#64625D]/50"
              />
            </div>
          </div>

          {/* Date, Subject, Total Marks, Standard */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-[#64625D] mb-1">
                Date
              </label>
              <input
                type="text"
                value={value.date}
                onChange={(e) => onChange({ ...value, date: e.target.value })}
                placeholder="e.g. 10/10/2026"
                className="w-full rounded-md border border-[#E4E2DC] bg-white px-2.5 py-1.5 text-xs text-[#18181B] outline-none focus:border-[#1D3557] placeholder:text-[#64625D]/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#64625D] mb-1">
                Subject
              </label>
              <input
                type="text"
                value={value.subject}
                onChange={(e) => onChange({ ...value, subject: e.target.value })}
                placeholder="e.g. Gujarati / Sanskrit"
                className="w-full rounded-md border border-[#E4E2DC] bg-white px-2.5 py-1.5 text-xs text-[#18181B] outline-none focus:border-[#1D3557] placeholder:text-[#64625D]/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#64625D] mb-1">
                Total Marks
              </label>
              <input
                type="text"
                value={value.totalMarks}
                onChange={(e) => onChange({ ...value, totalMarks: e.target.value })}
                placeholder="e.g. 50"
                className="w-full rounded-md border border-[#E4E2DC] bg-white px-2.5 py-1.5 text-xs text-[#18181B] outline-none focus:border-[#1D3557] placeholder:text-[#64625D]/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#64625D] mb-1">
                Class / Std (Optional)
              </label>
              <input
                type="text"
                value={value.standard}
                onChange={(e) => onChange({ ...value, standard: e.target.value })}
                placeholder="e.g. Std - 7"
                className="w-full rounded-md border border-[#E4E2DC] bg-white px-2.5 py-1.5 text-xs text-[#18181B] outline-none focus:border-[#1D3557] placeholder:text-[#64625D]/50"
              />
            </div>
          </div>

          {/* Optional Question Marks & Invigilator Grid toggle */}
          <label className="flex cursor-pointer items-center gap-2 pt-0.5">
            <input
              type="checkbox"
              checked={value.includeMarksGrid}
              onChange={(e) => onChange({ ...value, includeMarksGrid: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-[#E4E2DC] text-[#1D3557] focus:ring-[#1D3557]"
            />
            <span className="text-xs text-[#64625D]">
              Include student Name / Roll No & Question Marks grid box
            </span>
          </label>
        </div>
      )}
    </div>
  );
};

interface ExamHeaderModalProps {
  isOpen: boolean;
  value: ExamHeaderConfig;
  onChange: (next: ExamHeaderConfig) => void;
  onClose: () => void;
}

export const ExamHeaderModal: React.FC<ExamHeaderModalProps> = ({
  isOpen,
  value,
  onChange,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Exam Paper Heading Setup"
    >
      <div className="w-full max-w-lg rounded-xl border border-[#E4E2DC] bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E4E2DC] px-5 py-3.5">
          <h2 className="text-sm font-semibold text-[#18181B]">
            Exam Paper Heading
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#64625D] hover:bg-[#FAF9F6] hover:text-[#18181B]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-5">
          <ExamHeaderForm value={value} onChange={onChange} />
        </div>

        <div className="flex justify-end border-t border-[#E4E2DC] bg-[#FAF9F6] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#1D3557] px-4 py-2 text-xs font-medium text-white hover:bg-[#142640] transition-colors"
          >
            Apply to Sheet
          </button>
        </div>
      </div>
    </div>
  );
};
