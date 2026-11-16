import React from 'react';
import type {
  SpacingDensity,
  TypefaceStyle,
  TypographySettings,
} from '../types';

interface TypographyBarProps {
  settings: TypographySettings;
  onChange: (next: TypographySettings) => void;
}

const TYPEFACE_OPTIONS: Array<{ value: TypefaceStyle; label: string }> = [
  { value: 'editorial-serif', label: 'Editorial Serif' },
  { value: 'modern-sans', label: 'Modern Clean Sans' },
  { value: 'academic-classic', label: 'Academic Classic' },
];

const DENSITY_OPTIONS: Array<{ value: SpacingDensity; label: string }> = [
  { value: 'compact', label: 'Single' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'airy', label: 'Airy' },
];

export const TypographyBar: React.FC<TypographyBarProps> = ({ settings, onChange }) => {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-[#E4E2DC] bg-[#FAF9F6] px-4 py-2.5 lg:px-6">
      {/* Typeface */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[#64625D] whitespace-nowrap">Typeface</span>
        <div className="flex items-center rounded-lg border border-[#E4E2DC] bg-white p-0.5">
          {TYPEFACE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...settings, typeface: opt.value })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                settings.typeface === opt.value
                  ? 'bg-[#1D3557] text-white'
                  : 'text-[#64625D] hover:text-[#18181B]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Density */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[#64625D] whitespace-nowrap">Spacing</span>
        <div className="flex items-center rounded-lg border border-[#E4E2DC] bg-white p-0.5">
          {DENSITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...settings, density: opt.value })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                settings.density === opt.value
                  ? 'bg-[#1D3557] text-white'
                  : 'text-[#64625D] hover:text-[#18181B]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Script Font Size Summary & Marks Toggle */}
      <div className="flex items-center gap-3 ml-auto">
        <span className="hidden sm:inline text-xs text-[#64625D] tabular-nums whitespace-nowrap">
          Gujarati 10pt · English 12pt
        </span>

        <button
          type="button"
          onClick={() => onChange({ ...settings, showMarksBadges: !settings.showMarksBadges })}
          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            settings.showMarksBadges
              ? 'border-[#1D3557] bg-[#1D3557]/8 text-[#1D3557]'
              : 'border-[#E4E2DC] bg-white text-[#64625D] hover:text-[#18181B]'
          }`}
        >
          Marks Badges: {settings.showMarksBadges ? 'Visible' : 'Hidden'}
        </button>
      </div>
    </div>
  );
};
