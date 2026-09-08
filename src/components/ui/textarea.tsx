import React from "react";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  isError?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ isError = false, className = "", disabled, rows = 3, ...props }, ref) => {
    const errorClasses = isError
      ? "border-rose-400 focus-visible:ring-rose-500 text-rose-900 placeholder:text-rose-300"
      : "border-slate-300 focus-visible:ring-emerald-600 text-slate-900 placeholder:text-slate-400";

    return (
      <textarea
        ref={ref}
        disabled={disabled}
        rows={rows}
        aria-invalid={isError}
        className={`w-full bg-white rounded-lg border px-3 py-2 text-sm transition-colors duration-150 ` +
          `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ` +
          `disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed ${errorClasses} ${className}`}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";
