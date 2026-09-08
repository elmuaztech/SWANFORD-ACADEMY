import React from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[];
  isError?: boolean;
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, isError = false, placeholder, className = "", children, disabled, ...props }, ref) => {
    const errorClasses = isError
      ? "border-rose-400 focus-visible:ring-rose-500 text-rose-900"
      : "border-slate-300 focus-visible:ring-emerald-600 text-slate-900";

    return (
      <div className="relative w-full">
        <select
          ref={ref}
          disabled={disabled}
          aria-invalid={isError}
          className={`w-full appearance-none bg-white rounded-lg border px-3 py-2 pr-9 text-sm transition-colors duration-150 ` +
            `min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ` +
            `disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed ${errorClasses} ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" aria-hidden="true">
          <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
          </svg>
        </div>
      </div>
    );
  }
);

Select.displayName = "Select";
