import React from "react";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  description?: string;
  isError?: boolean;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, isError = false, className = "", id, disabled, ...props }, ref) => {
    const inputId = id || (typeof label === "string" ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className={`flex items-start gap-3 min-h-[44px] py-1.5 ${className}`}>
        <div className="flex items-center h-5 mt-0.5">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            disabled={disabled}
            aria-invalid={isError}
            className={`w-4 h-4 rounded border-slate-300 text-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${
              isError ? "border-rose-400" : "border-slate-300"
            }`}
            {...props}
          />
        </div>
        {(label || description) && (
          <div className="text-sm">
            {label && (
              <label
                htmlFor={inputId}
                className={`font-medium select-none cursor-pointer ${
                  disabled ? "text-slate-400 cursor-not-allowed" : isError ? "text-rose-900" : "text-slate-800"
                }`}
              >
                {label}
              </label>
            )}
            {description && (
              <p className={`text-xs ${disabled ? "text-slate-400" : "text-slate-500"} mt-0.5`}>
                {description}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";
