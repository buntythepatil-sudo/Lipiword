import React, { useState } from 'react';
import { Camera, Plus, RotateCw, Trash2, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import type { PaperPage } from '../types';

interface PaperViewerProps {
  pages: PaperPage[];
  activePageIndex: number;
  onSelectPage: (index: number) => void;
  onRotatePage: (index: number) => void;
  onRemovePage: (index: number) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onOpenCamera: () => void;
}

export const PaperViewer: React.FC<PaperViewerProps> = ({
  pages,
  activePageIndex,
  onSelectPage,
  onRotatePage,
  onRemovePage,
  onAddFiles,
  onOpenCamera,
}) => {
  const [zoom, setZoom] = useState(100);
  const currentPage = pages[activePageIndex];

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-[#E4E2DC] bg-white overflow-hidden">
      {/* Viewer Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E2DC] bg-[#FAF9F6] px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-[#18181B] whitespace-nowrap">
            Original Paper
          </span>
          {pages.length > 0 && (
            <span className="text-xs text-[#64625D] tabular-nums whitespace-nowrap">
              · Page {activePageIndex + 1} of {pages.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {currentPage && (
            <>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(50, z - 25))}
                className="rounded-md border border-[#E4E2DC] bg-white p-1.5 text-[#64625D] hover:text-[#18181B] transition-colors"
                title="Zoom out"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[42px] text-center text-xs font-mono-tabular text-[#64625D]">
                {zoom}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(200, z + 25))}
                className="rounded-md border border-[#E4E2DC] bg-white p-1.5 text-[#64625D] hover:text-[#18181B] transition-colors"
                title="Zoom in"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onRotatePage(activePageIndex)}
                className="rounded-md border border-[#E4E2DC] bg-white p-1.5 text-[#64625D] hover:text-[#18181B] transition-colors"
                title="Rotate 90 degrees"
                aria-label="Rotate page"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onRemovePage(activePageIndex)}
                className="rounded-md border border-[#E4E2DC] bg-white p-1.5 text-[#64625D] hover:text-red-600 transition-colors"
                title="Remove current page"
                aria-label="Remove page"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E4E2DC] bg-white px-2.5 py-1.5 text-xs font-medium text-[#18181B] hover:bg-[#FAF9F6] transition-colors whitespace-nowrap">
            <Plus className="h-3.5 w-3.5" />
            <span>Add</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={onOpenCamera}
            className="inline-flex items-center gap-1 rounded-md border border-[#E4E2DC] bg-white px-2.5 py-1.5 text-xs font-medium text-[#18181B] hover:bg-[#FAF9F6] transition-colors whitespace-nowrap"
            title="Capture via camera"
          >
            <Camera className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Camera</span>
          </button>
        </div>
      </div>

      {/* Multi-page Strip */}
      {pages.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[#E4E2DC] bg-white px-3 py-2">
          {pages.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPage(idx)}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                idx === activePageIndex
                  ? 'border-[#1D3557] bg-[#1D3557]/8 text-[#1D3557]'
                  : 'border-[#E4E2DC] bg-[#FAF9F6] text-[#64625D] hover:text-[#18181B]'
              }`}
            >
              <span className="tabular-nums">Page {idx + 1}</span>
            </button>
          ))}
        </div>
      )}

      {/* Image Canvas */}
      <div className="flex-1 overflow-auto bg-[#F1EFEA] p-4 flex items-start justify-center min-h-[360px]">
        {currentPage ? (
          <div
            className="transition-transform duration-150 ease-out origin-top"
            style={{
              width: `${zoom}%`,
              maxWidth: zoom <= 100 ? '100%' : 'none',
            }}
          >
            <img
              src={currentPage.dataUrl}
              alt={currentPage.name || `Handwritten page ${activePageIndex + 1}`}
              referrerPolicy="no-referrer"
              className="mx-auto w-full rounded-lg border border-[#E4E2DC] bg-white shadow-xs object-contain"
              style={{
                transform: `rotate(${currentPage.rotation}deg)`,
              }}
            />
          </div>
        ) : (
          <div className="m-auto max-w-sm text-center py-12 px-4">
            <p className="text-sm font-medium text-[#18181B]">No source paper attached</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#64625D]">
              Upload an image or capture a photo of handwritten notes to compare side-by-side and transcribe with Gemini Vision.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2.5">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1D3557] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#142640] transition-colors whitespace-nowrap">
                <Upload className="h-3.5 w-3.5" />
                Upload Image
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={onOpenCamera}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E2DC] bg-white px-3.5 py-2 text-xs font-medium text-[#18181B] hover:bg-[#FAF9F6] transition-colors whitespace-nowrap"
              >
                <Camera className="h-3.5 w-3.5" />
                Camera
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
