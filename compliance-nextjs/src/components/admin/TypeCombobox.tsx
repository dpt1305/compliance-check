"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface TypeComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}

export default function TypeCombobox({
  value,
  onChange,
  options,
  placeholder = "Choose or type...",
}: TypeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Filter options that match the current input (case-insensitive)
  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(value.toLowerCase()),
  );

  // Close on outside click
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        listRef.current &&
        !listRef.current.contains(target) &&
        inputRef.current &&
        target !== inputRef.current
      ) {
        setOpen(false);
        setHighlightedIdx(-1);
      }
    },
    [],
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  // Reset highlight when value or options change
  useEffect(() => {
    setHighlightedIdx(-1);
  }, [value, options.length]);

  // Open dropdown on focus
  const handleFocus = () => {
    setOpen(true);
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    onChange(newVal);
    setOpen(true);
  };

  // Select an option from the list
  const handleSelect = (option: string) => {
    onChange(option);
    setOpen(false);
    setHighlightedIdx(-1);
    inputRef.current?.blur();
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlightedIdx((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIdx >= 0 && highlightedIdx < filteredOptions.length) {
        handleSelect(filteredOptions[highlightedIdx]);
      } else {
        // Accept current input as a new type and close dropdown
        setOpen(false);
        setHighlightedIdx(-1);
        inputRef.current?.blur();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightedIdx(-1);
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (listRef.current && highlightedIdx >= 0) {
      const el = listRef.current.children[highlightedIdx] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIdx]);

  return (
    <div className="form-field">
      <label className="form-label">Type</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className="form-input pr-8"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="type-combobox-list"
        />
        {/* Chevron icon */}
        <div
          className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-gray-400"
        >
          <svg
            className={`w-4 h-4 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Dropdown list */}
        {open && (
          <ul
            ref={listRef}
            id="type-combobox-list"
            role="listbox"
            className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
          >
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400 cursor-default">
                {value ? "Press Enter to add new type" : "No options available"}
              </li>
            ) : (
              filteredOptions.map((option, idx) => {
                const isMatch = option.toLowerCase() === value.toLowerCase();
                const isHighlighted = idx === highlightedIdx;
                return (
                  <li
                    key={option}
                    role="option"
                    aria-selected={isHighlighted}
                    className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                      isHighlighted
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-gray-700 hover:bg-gray-50"
                    } ${isMatch ? "font-semibold" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(option);
                    }}
                    onMouseEnter={() => setHighlightedIdx(idx)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{option}</span>
                      {isMatch && (
                        <span className="text-xs text-indigo-400 ml-2 shrink-0">
                          Match
                        </span>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </div>
  );
}