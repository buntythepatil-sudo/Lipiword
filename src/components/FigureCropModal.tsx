import React, { useEffect, useRef, useState } from 'react';
import { Crop, Sparkles, X } from 'lucide-react';
import type { FigureBox, PaperPage } from '../types';
import { cropFigureFromPage } from '../utils/figureCrop';

interface FigureCropModalProps {
  isOpen: boolean;
  pages: PaperPage[];
  initialPageIndex: number;
  initialBox?: FigureBox;
  initialEnhance?: boolean;
  onApply: (result: {
    pageIndex: number;
    box: FigureBox;
    dataUrl: string;
    enhance: boolean;
  }) => void;
  onClose: () => void;
}

const DEFAULT_BOX: FigureBox = { ymin: 220, xmin: 180, ymax: 560, xmax: 820 };

export const FigureCropModal: React.FC<FigureCropModalProps> = ({
  isOpen,
  pages,
  initialPageIndex,
  initialBox,
  initialEnhance = true,
  onApply,
  onClose,
}) => {
  const [pageIdx, setPageIdx] = useState(0);
  const [box, setBox] = useState<FigureBox>(DEFAULT_BOX);
  const [enhance, setEnhance] = useState(true);
  const [orientedUrl, setOrientedUrl] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);

  const imgWrapRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    mode: 'new' | 'move';
    startX: number;
    startY: number;
    origBox: FigureBox;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const safeIdx =
      initialPageIndex >= 0 && initialPageIndex < pages.length ? initialPageIndex : 0;
    setPageIdx(safeIdx);
    setBox(
      initialBox && initialBox.ymax > initialBox.ymin && initialBox.xmax > initialBox.xmin
        ? initialBox
        : DEFAULT_BOX
    );
    setEnhance(initialEnhance);
  }, [isOpen, initialPageIndex, initialBox, initialEnhance, pages.length]);

  const activePage = pages[pageIdx];

  useEffect(() => {
    if (!isOpen || !activePage) return;
    const rot = ((activePage.rotation % 360) + 360) % 360;
    if (rot === 0) {
      setOrientedUrl(activePage.dataUrl);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const swap = rot === 90 || rot === 270;
      const canvas = document.createElement('canvas');
      canvas.width = swap ? img.height : img.width;
      canvas.height = swap ? img.width : img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setOrientedUrl(activePage.dataUrl);
        return;
      }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      setOrientedUrl(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.src = activePage.dataUrl;
    return () => {
      cancelled = true;
    };
  }, [isOpen, activePage]);

  if (!isOpen || !activePage) return null;

  const getRelativeNorm = (clientX: number, clientY: number) => {
    const rect = imgWrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const x = Math.max(0, Math.min(1000, Math.round(((clientX - rect.left) / rect.width) * 1000)));
    const y = Math.max(0, Math.min(1000, Math.round(((clientY - rect.top) / rect.height) * 1000)));
    return { x, y };
  };

  const handlePointerDownImage = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pt = getRelativeNorm(e.clientX, e.clientY);
    dragStateRef.current = {
      mode: 'new',
      startX: pt.x,
      startY: pt.y,
      origBox: box,
    };
  };

  const handlePointerDownBox = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    imgWrapRef.current?.setPointerCapture(e.pointerId);
    const pt = getRelativeNorm(e.clientX, e.clientY);
    dragStateRef.current = {
      mode: 'move',
      startX: pt.x,
      startY: pt.y,
      origBox: box,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const pt = getRelativeNorm(e.clientX, e.clientY);

    if (drag.mode === 'new') {
      const xmin = Math.min(drag.startX, pt.x);
      const xmax = Math.max(drag.startX, pt.x);
      const ymin = Math.min(drag.startY, pt.y);
      const ymax = Math.max(drag.startY, pt.y);
      if (xmax - xmin >= 12 && ymax - ymin >= 12) {
        setBox({ ymin, xmin, ymax, xmax });
      }
    } else {
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      const w = drag.origBox.xmax - drag.origBox.xmin;
      const h = drag.origBox.ymax - drag.origBox.ymin;
      const xmin = Math.max(0, Math.min(1000 - w, drag.origBox.xmin + dx));
      const ymin = Math.max(0, Math.min(1000 - h, drag.origBox.ymin + dy));
      setBox({ ymin, xmin, ymax: ymin + h, xmax: xmin + w });
    }
  };

  const handlePointerUp = () => {
    dragStateRef.current = null;
  };

  const handleConfirm = async () => {
    setIsApplying(true);
    try {
      const dataUrl = await cropFigureFromPage(
        activePage.dataUrl,
        activePage.rotation,
        box,
        enhance,
        0
      );
      onApply({
        pageIndex: pageIdx,
        box,
        dataUrl,
        enhance,
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Crop Figure or Diagram"
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl border border-[#E4E2DC] bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E4E2DC] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Crop className="h-4 w-4 text-[#1D3557]" />
            <h2 className="text-sm font-semibold text-[#18181B]">
              Crop Diagram / Figure from Page
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#64625D] hover:bg-[#FAF9F6] hover:text-[#18181B]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Page switcher & hint */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E2DC] bg-[#FAF9F6] px-5 py-2.5 text-xs">
          <span className="text-[#64625D]">
            Drag anywhere on the page to select a diagram, graph, or figure. Drag inside the box to reposition.
          </span>
          {pages.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-[#64625D]">Page:</span>
              <select
                value={pageIdx}
                onChange={(e) => setPageIdx(Number(e.target.value))}
                className="rounded-md border border-[#E4E2DC] bg-white px-2 py-1 text-xs font-medium text-[#18181B] outline-none focus:border-[#1D3557]"
              >
                {pages.map((p, idx) => (
                  <option key={p.id} value={idx}>
                    Page {idx + 1}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Interactive Image Canvas */}
        <div className="flex-1 overflow-auto bg-[#EFECE6] p-4 flex items-center justify-center">
          <div
            ref={imgWrapRef}
            onPointerDown={handlePointerDownImage}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative inline-block select-none touch-none cursor-crosshair shadow-sm bg-white"
          >
            {orientedUrl && (
              <img
                src={orientedUrl}
                alt={`Page ${pageIdx + 1}`}
                draggable={false}
                referrerPolicy="no-referrer"
                className="block max-h-[58vh] w-auto object-contain pointer-events-none"
              />
            )}

            {/* Selection Box */}
            <div
              onPointerDown={handlePointerDownBox}
              style={{
                top: `${box.ymin / 10}%`,
                left: `${box.xmin / 10}%`,
                height: `${(box.ymax - box.ymin) / 10}%`,
                width: `${(box.xmax - box.xmin) / 10}%`,
              }}
              className="absolute border-2 border-[#1D3557] bg-[#1D3557]/12 cursor-move shadow-[0_0_0_9999px_rgba(24,24,27,0.32)]"
            />
          </div>
        </div>

        {/* Fine-tune & Clean Ink Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E2DC] bg-white px-5 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[#18181B]">
            <input
              type="checkbox"
              checked={enhance}
              onChange={(e) => setEnhance(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[#E4E2DC] text-[#1D3557] focus:ring-[#1D3557]"
            />
            <Sparkles className="h-3.5 w-3.5 text-[#1D3557]" />
            <span>Clean white paper background (recommended for drawings)</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E4E2DC] bg-white px-3.5 py-2 text-xs font-medium text-[#64625D] hover:text-[#18181B]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isApplying}
              onClick={handleConfirm}
              className="rounded-lg bg-[#1D3557] px-4 py-2 text-xs font-medium text-white hover:bg-[#142640] disabled:opacity-50 transition-colors"
            >
              {isApplying ? 'Cropping...' : 'Apply Figure Crop'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
