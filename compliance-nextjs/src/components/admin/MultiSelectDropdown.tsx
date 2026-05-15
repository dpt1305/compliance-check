'use client';

import { useState, useRef, useEffect } from 'react';

interface Props {
  options: string[];
  /**
   * null  = "Select All" ON  — no filter, show all rows
   * []    = "Select All" OFF — none selected (filter shows nothing)
   * [...] = filter to these specific items
   */
  selected: string[] | null;
  onChange: (selected: string[] | null) => void;
  placeholder?: string;   // shown when all selected (null)
  className?: string;
}

/**
 * A searchable multi-select dropdown with a true-toggle "Select All" checkbox.
 * - `selected = null` → Select All ON (no filter).
 * - `selected = []`   → Select All OFF, nothing individually picked.
 * - `selected = [...]`→ filter to those items.
 *
 * Clicking "Select All" when ON  → turns OFF (onChange([])).
 * Clicking "Select All" when OFF → turns ON  (onChange(null)).
 */
export default function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder = 'All',
  className = 'w-48',
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const filteredOptions = options.filter(o =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  // null means "all selected"
  const allSelected = selected === null;

  function handleToggleAll() {
    if (allSelected) {
      onChange([]);   // ON → OFF: deselect all
    } else {
      onChange(null); // OFF/partial → ON: select all
    }
  }

  function handleToggle(opt: string) {
    if (allSelected) {
      // All checked → uncheck one → explicitly select all others
      const next = options.filter(o => o !== opt);
      // If only 1 option existed and it was unchecked, result is []
      onChange(next.length === 0 ? [] : next);
    } else {
      const current = selected ?? [];
      if (current.includes(opt)) {
        // Uncheck → remove
        const next = current.filter(s => s !== opt);
        onChange(next);
      } else {
        // Check → add
        const next = [...current, opt];
        // Normalize: if all options are now checked → null (Select All ON)
        onChange(next.length === options.length ? null : next);
      }
    }
  }

  function isChecked(opt: string): boolean {
    return allSelected || (selected?.includes(opt) ?? false);
  }

  // Button label
  const label =
    allSelected
      ? placeholder
      : selected!.length === 0
      ? 'None selected'
      : selected!.length === 1
      ? selected![0]
      : `${selected!.length} selected`;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        className="form-select w-full text-left flex items-center justify-between gap-1 text-sm"
        onClick={() => { setOpen(v => !v); if (!open) setSearch(''); }}
      >
        <span className={allSelected ? 'text-gray-400' : 'text-gray-800 truncate'}>{label}</span>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 w-full min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <ul className="max-h-56 overflow-y-auto py-1">
            {/* Select All — true toggle */}
            <li>
              <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 select-none">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleToggleAll}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-semibold text-gray-700">Select All</span>
              </label>
            </li>

            {filteredOptions.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400 italic">No results</li>
            )}

            {filteredOptions.map(opt => (
              <li key={opt}>
                <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isChecked(opt)}
                    onChange={() => handleToggle(opt)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700 truncate" title={opt}>{opt}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
