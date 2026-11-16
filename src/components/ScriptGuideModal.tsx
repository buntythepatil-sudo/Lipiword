import React from 'react';
import { X } from 'lucide-react';

interface ScriptGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScriptGuideModal: React.FC<ScriptGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Multilingual Script & Formatting Guide"
    >
      <div className="w-full max-w-2xl rounded-xl border border-[#E4E2DC] bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E4E2DC] px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-[#18181B]">
            Script Preservation & Studio Guide
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#64625D] hover:bg-[#FAF9F6] hover:text-[#18181B] transition-colors"
            aria-label="Close guide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-5 text-sm text-[#18181B]">
          <div>
            <h3 className="font-semibold text-[#18181B]">Zero-Translation Script Fidelity</h3>
            <p className="mt-1 text-xs leading-relaxed text-[#64625D]">
              LipiWord transcribes handwritten pages verbatim in their original scripts without translating or transliterating. Mixed-script pages (such as Sanskrit questions with English instructions, or Gujarati notes with English terms) retain every script inline.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[#E4E2DC] bg-[#FAF9F6] p-3.5">
              <div className="text-xs font-semibold text-[#1D3557]">Sanskrit (संस्कृतम्)</div>
              <p className="mt-1 text-xs leading-relaxed text-[#64625D]">
                Preserves halants (्), visarga (ः), anusvara (ं), chandrabindu (ँ), avagraha (ऽ), and single/double dandas (। / ॥).
              </p>
            </div>
            <div className="rounded-lg border border-[#E4E2DC] bg-[#FAF9F6] p-3.5">
              <div className="text-xs font-semibold text-[#1D3557]">Hindi (हिन्दी)</div>
              <p className="mt-1 text-xs leading-relaxed text-[#64625D]">
                Accurately retains Devanagari matras, nuktas, conjuncts, and Hindi punctuation across exam papers and notes.
              </p>
            </div>
            <div className="rounded-lg border border-[#E4E2DC] bg-[#FAF9F6] p-3.5">
              <div className="text-xs font-semibold text-[#1D3557]">Gujarati (ગુજરાતી)</div>
              <p className="mt-1 text-xs leading-relaxed text-[#64625D]">
                Captures Gujarati vowel curves, conjunct characters, and anusvara (ં) without substituting Devanagari glyphs.
              </p>
            </div>
            <div className="rounded-lg border border-[#E4E2DC] bg-[#FAF9F6] p-3.5">
              <div className="text-xs font-semibold text-[#1D3557]">English & Marks Extraction</div>
              <p className="mt-1 text-xs leading-relaxed text-[#64625D]">
                Detects margin marks like [5 Marks] or [10 M], total marks headers, and 3-level nested bullet/numbered lists.
              </p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-[#18181B]">Word (.docx) Export Fidelity</h3>
            <p className="mt-1 text-xs leading-relaxed text-[#64625D]">
              Exported .docx files embed UTF-8 Unicode text with Complex Script (cs) font mappings, native Word Heading 1/2 styles, 3-level nested list definitions, right-aligned tab stops for Marks tags, and framed Shloka blocks.
            </p>
          </div>
        </div>

        <div className="flex justify-end border-t border-[#E4E2DC] bg-[#FAF9F6] px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#1D3557] px-4 py-2 text-xs font-medium text-white hover:bg-[#142640] transition-colors"
          >
            Back to Studio
          </button>
        </div>
      </div>
    </div>
  );
};
