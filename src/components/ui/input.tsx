import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  isError?: boolean;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ isError = false, leftAddon, rightAddon, className = "", disabled, ...props }, ref) => {
    const errorClasses = isError
      ? "border-rose-400 focus-visible:ring-rose-500 text-rose-900 placeholder:text-rose-300"
      : "border-slate-300 focus-visible:ring-emerald-600 text-slate-900 placeholder:text-slate-400";

    const baseInput =
      "w-full bg-white rounded-lg border px-3 py-2 text-sm transition-colors duration-150 " +
      "min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 " +
      "disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed";

    if (leftAddon || rightAddon) {
      return (
        <div className="relative flex items-center w-full">
          {leftAddon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-slate-500 text-sm">
              {leftAddon}
            </div>
          )}
          <input
            ref={ref}
            disabled={disabled}
            aria-invalid={isError}
            className={`${baseInput} ${errorClasses} ${leftAddon ? "pl-9" : ""} ${
              rightAddon ? "pr-9" : ""
            } ${className}`}
            {...props}
          />
          {rightAddon && (
            <div className="absolute right-3 flex items-center pointer-events-none text-slate-500 text-sm">
              {rightAddon}
            </div>
          )}
        </div>
      );
    }

    return (
      <input
        ref={ref}
        disabled={disabled}
        aria-invalid={isError}
        className={`${baseInput} ${errorClasses} ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
