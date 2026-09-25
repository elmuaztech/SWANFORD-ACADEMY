import React from "react";
import { toUserFacingError } from "@/lib/ui/error_messages";

export interface AlertProps {
  variant?: "info" | "success" | "warning" | "error" | "danger";
  title?: string;
  error?: unknown;
  children?: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export function Alert({
  variant = "info",
  title,
  error,
  children,
  onClose,
  className = "",
}: AlertProps) {
  // If error provided, override title & message with human-readable version
  let displayTitle = title;
  let displayContent = children;

  if (error) {
    const translated = toUserFacingError(error);
    displayTitle = title || translated.title;
    displayContent = displayContent || translated.message;
  }

  const styles = {
    info: {
      container: "bg-sky-50 border-sky-200/90 text-sky-900",
      icon: (
        <svg className="w-5 h-5 text-sky-600 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      ),
    },
    success: {
      container: "bg-emerald-50 border-emerald-200/90 text-emerald-900",
      icon: (
        <svg className="w-5 h-5 text-emerald-600 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      ),
    },
    warning: {
      container: "bg-amber-50 border-amber-200/90 text-amber-900",
      icon: (
        <svg className="w-5 h-5 text-amber-600 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      ),
    },
    error: {
      container: "bg-rose-50 border-rose-200/90 text-rose-900",
      icon: (
        <svg className="w-5 h-5 text-rose-600 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      ),
    },
  }[variant === "danger" ? "error" : variant];

  return (
    <div
      role="alert"
      className={`rounded-lg border p-3.5 sm:p-4 flex items-start gap-3 transition-all duration-150 ${styles.container} ${className}`}
    >
      <div className="shrink-0 mt-0.5">{styles.icon}</div>
      <div className="flex-1 min-w-0">
        {displayTitle && (
          <h4 className="text-xs sm:text-sm font-semibold tracking-tight mb-0.5">
            {displayTitle}
          </h4>
        )}
        <div className="text-xs sm:text-sm leading-relaxed text-slate-700">
          {displayContent}
        </div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 -mr-1 -mt-1 p-2 rounded-md hover:bg-black/5 text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Dismiss message"
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
