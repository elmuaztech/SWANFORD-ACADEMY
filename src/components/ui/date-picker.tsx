'use client';

import React, { useState, useEffect, useRef, useId } from 'react';

export interface DatePickerProps {
  value?: string; // Canonical format: YYYY-MM-DD
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  min?: string; // YYYY-MM-DD
  max?: string; // YYYY-MM-DD
  size?: 'sm' | 'md' | 'lg';
  isError?: boolean;
  className?: string;
  id?: string;
  name?: string;
  ariaLabel?: string;
  minYear?: number;
  maxYear?: number;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Normalizes any supported input format into canonical YYYY-MM-DD.
 * Supports:
 * - YYYY-MM-DD (e.g., 2018-04-15)
 * - YYYY/MM/DD (e.g., 2018/04/15)
 * - DD/MM/YYYY (e.g., 15/04/2018)
 * - DD-MM-YYYY (e.g., 15-04-2018)
 * - D/M/YYYY (e.g., 5/4/2018)
 */
export function parseDateInput(input: string): { valid: boolean; isoDate?: string; year?: number; month?: number; day?: number } {
  if (!input || !input.trim()) {
    return { valid: true, isoDate: '' };
  }

  const trimmed = input.trim();

  // Pattern 1: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(trimmed);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (isValidDateParts(year, month, day)) {
      return {
        valid: true,
        isoDate: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
        year,
        month,
        day,
      };
    }
  }

  // Pattern 2: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (isValidDateParts(year, month, day)) {
      return {
        valid: true,
        isoDate: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
        year,
        month,
        day,
      };
    }
  }

  return { valid: false };
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Check month length
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}

export function DatePicker({
  value = '',
  onChange,
  placeholder = 'YYYY-MM-DD or DD/MM/YYYY',
  disabled = false,
  required = false,
  min,
  max,
  size = 'md',
  isError = false,
  className = '',
  id,
  name,
  ariaLabel = 'Date input',
  minYear = 1970,
  maxYear = new Date().getFullYear(),
}: DatePickerProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  // Internal text input state (what the user actually types)
  const [typedText, setTypedText] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [parseError, setParseError] = useState(false);

  // Calendar navigation state (currently viewed month & year in popover)
  const today = new Date();
  const initialYear = value ? parseInt(value.slice(0, 4), 10) || today.getFullYear() : today.getFullYear() - 5;
  const initialMonth = value ? parseInt(value.slice(5, 7), 10) - 1 || 0 : today.getMonth();

  const [viewYear, setViewYear] = useState<number>(initialYear);
  const [viewMonth, setViewMonth] = useState<number>(initialMonth);

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Synchronize when external value changes
  const [prevPropValue, setPrevPropValue] = useState(value);
  if (value !== prevPropValue) {
    setPrevPropValue(value);
    setTypedText(value || '');
    if (value && value.length === 10) {
      const parsed = parseDateInput(value);
      if (parsed.valid && parsed.year && parsed.month) {
        setViewYear(parsed.year);
        setViewMonth(parsed.month - 1);
        setParseError(false);
      }
    }
  }

  // Handle typing manually into the input field
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTypedText(raw);

    if (!raw.trim()) {
      setParseError(false);
      onChange?.('');
      return;
    }

    const parsed = parseDateInput(raw);
    if (parsed.valid && parsed.isoDate) {
      setParseError(false);
      if (parsed.year && parsed.month) {
        setViewYear(parsed.year);
        setViewMonth(parsed.month - 1);
      }
      // Check boundaries if min/max set
      if (max && parsed.isoDate > max) {
        setParseError(true);
        return;
      }
      if (min && parsed.isoDate < min) {
        setParseError(true);
        return;
      }
      onChange?.(parsed.isoDate);
    } else {
      // In-progress typing; don't trigger hard error yet unless blurred
    }
  };

  // On blur, validate or normalize
  const handleInputBlur = () => {
    if (!typedText.trim()) {
      setParseError(false);
      return;
    }

    const parsed = parseDateInput(typedText);
    if (parsed.valid && parsed.isoDate) {
      setParseError(false);
      setTypedText(parsed.isoDate);
      onChange?.(parsed.isoDate);
    } else {
      setParseError(true);
    }
  };

  // Close calendar popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        inputRef.current?.focus();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Calendar Day Selection
  const handleSelectDay = (day: number) => {
    const selectedYear = viewYear;
    const selectedMonth = viewMonth + 1;
    const isoString = `${selectedYear.toString().padStart(4, '0')}-${selectedMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

    if (max && isoString > max) return;
    if (min && isoString < min) return;

    setTypedText(isoString);
    setParseError(false);
    onChange?.(isoString);
    setIsOpen(false);
  };

  // Month and Year Navigators
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  // Years array for direct year dropdown selection (e.g. from maxYear down to minYear)
  const years = [];
  for (let y = maxYear; y >= minYear; y--) {
    years.push(y);
  }

  // Calculate calendar days in current view month
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayWeekday = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  // Days array
  const prevMonthPadding = [];
  for (let i = firstDayWeekday - 1; i >= 0; i--) {
    prevMonthPadding.push(daysInPrevMonth - i);
  }

  const currentMonthDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    currentMonthDays.push(d);
  }

  // Calculate total cells to fill (multiples of 7)
  const totalShown = prevMonthPadding.length + currentMonthDays.length;
  const nextMonthPaddingCount = (7 - (totalShown % 7)) % 7;
  const nextMonthPadding = [];
  for (let n = 1; n <= nextMonthPaddingCount; n++) {
    nextMonthPadding.push(n);
  }

  // Check if a day is today
  const isDayToday = (d: number) => {
    return (
      d === today.getDate() &&
      viewMonth === today.getMonth() &&
      viewYear === today.getFullYear()
    );
  };

  // Check if a day is currently selected
  const isDaySelected = (d: number) => {
    if (!value) return false;
    const [selY, selM, selD] = value.split('-').map((v) => parseInt(v, 10));
    return d === selD && viewMonth === selM - 1 && viewYear === selY;
  };

  // Check if a day is disabled
  const isDayDisabled = (d: number) => {
    const iso = `${viewYear.toString().padStart(4, '0')}-${(viewMonth + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    if (max && iso > max) return true;
    if (min && iso < min) return true;
    return false;
  };

  // Sizing styles
  const isSmall = size === 'sm';
  const heightClass = isSmall ? 'h-8 text-xs py-1 px-2' : 'min-h-[44px] text-sm py-2 px-3';
  const iconSizeClass = isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <div ref={containerRef} className={`relative inline-block w-full ${className}`}>
      {/* Input Group: Text Field + Calendar Toggle Button */}
      <div className="relative flex items-center w-full">
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          value={typedText}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          aria-invalid={isError || parseError}
          autoComplete="off"
          spellCheck="false"
          className={`w-full bg-white rounded-lg border transition-colors duration-150 font-mono ${heightClass} ${
            isError || parseError
              ? 'border-rose-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-rose-900 bg-rose-50/20'
              : 'border-[#EADBDA] focus:border-[#800020] focus:ring-1 focus:ring-[#800020] text-slate-900'
          } pr-9 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed`}
        />

        {/* Calendar Trigger Button */}
        <button
          type="button"
          onClick={() => {
            if (!disabled) {
              setIsOpen((prev) => !prev);
            }
          }}
          disabled={disabled}
          title="Open calendar to pick year, month and day"
          aria-label="Open calendar date picker"
          aria-expanded={isOpen}
          className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-md text-stone-500 hover:text-[#800020] hover:bg-stone-100 transition-colors focus:outline-none focus:ring-2 focus:ring-[#800020] ${
            isSmall ? 'w-6 h-6' : 'w-8 h-8'
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <svg
            className={iconSizeClass}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </button>
      </div>

      {/* Parse Error Hint */}
      {parseError && (
        <p className="text-[11px] text-rose-600 mt-1 font-sans">
          Please enter a valid past date (e.g. 15/04/2018 or 2018-04-15)
        </p>
      )}

      {/* Popover Calendar Dropdown */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute z-50 mt-1 left-0 sm:left-auto right-0 sm:right-auto bg-white rounded-xl shadow-2xl border border-stone-200 p-3.5 w-80 max-w-[95vw] text-slate-800 animate-in fade-in-50 zoom-in-95 duration-100"
          style={{ minWidth: '290px' }}
        >
          {/* Header Controls: Year & Month Direct Selectors */}
          <div className="flex items-center justify-between gap-1 mb-3 pb-2.5 border-b border-stone-100">
            {/* Prev Month */}
            <button
              type="button"
              onClick={handlePrevMonth}
              title="Previous Month"
              className="p-1 rounded hover:bg-stone-100 text-stone-600 hover:text-stone-900 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center font-bold"
            >
              &larr;
            </button>

            {/* Direct Month Selector Dropdown */}
            <select
              value={viewMonth}
              onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
              className="h-8 px-2 py-0.5 rounded-lg border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-[#800020] cursor-pointer"
            >
              {MONTH_NAMES.map((m, idx) => (
                <option key={m} value={idx}>
                  {m}
                </option>
              ))}
            </select>

            {/* Direct Year Selector Dropdown */}
            <select
              value={viewYear}
              onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
              className="h-8 px-2 py-0.5 rounded-lg border border-stone-200 bg-stone-50 text-xs font-bold text-[#800020] focus:outline-none focus:ring-1 focus:ring-[#800020] cursor-pointer"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            {/* Next Month */}
            <button
              type="button"
              onClick={handleNextMonth}
              title="Next Month"
              className="p-1 rounded hover:bg-stone-100 text-stone-600 hover:text-stone-900 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center font-bold"
            >
              &rarr;
            </button>
          </div>

          {/* Weekday Names Header */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {WEEKDAY_NAMES.map((wd) => (
              <span
                key={wd}
                className="text-[11px] font-bold text-stone-400 uppercase tracking-wider py-0.5"
              >
                {wd}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {/* Previous Month Days (Grayed out) */}
            {prevMonthPadding.map((pDay) => (
              <span
                key={`prev-${pDay}`}
                className="text-xs text-stone-300 py-1.5 rounded select-none cursor-default"
              >
                {pDay}
              </span>
            ))}

            {/* Current Month Days */}
            {currentMonthDays.map((cDay) => {
              const selected = isDaySelected(cDay);
              const isTodayDate = isDayToday(cDay);
              const disabledDay = isDayDisabled(cDay);

              return (
                <button
                  key={`cur-${cDay}`}
                  type="button"
                  disabled={disabledDay}
                  onClick={() => handleSelectDay(cDay)}
                  className={`text-xs py-1.5 rounded-lg font-medium transition-all flex items-center justify-center relative min-h-[32px] ${
                    selected
                      ? 'bg-[#800020] text-white font-bold shadow-xs hover:bg-[#600018]'
                      : isTodayDate
                      ? 'border border-[#800020] text-[#800020] font-bold hover:bg-[#FAF4F5]'
                      : disabledDay
                      ? 'text-stone-300 cursor-not-allowed'
                      : 'text-stone-800 hover:bg-stone-100 hover:text-stone-900'
                  }`}
                >
                  {cDay}
                </button>
              );
            })}

            {/* Next Month Days (Grayed out) */}
            {nextMonthPadding.map((nDay) => (
              <span
                key={`next-${nDay}`}
                className="text-xs text-stone-300 py-1.5 rounded select-none cursor-default"
              >
                {nDay}
              </span>
            ))}
          </div>

          {/* Popover Footer: Quick Actions & Instructions */}
          <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between text-xs">
            <span className="text-[10px] text-stone-400">
              Type directly or pick date
            </span>
            <div className="flex items-center gap-1.5">
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    setTypedText('');
                    onChange?.('');
                    setIsOpen(false);
                  }}
                  className="px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 rounded transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 text-[11px] font-bold text-stone-600 hover:bg-stone-100 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
