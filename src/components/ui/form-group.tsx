import React from "react";
import { Label } from "./label";
import { toUserFacingError } from "@/lib/ui/error_messages";

export interface FormGroupProps {
  id?: string;
  label?: string;
  required?: boolean;
  helperText?: string;
  hint?: string;
  error?: string | unknown;
  children: React.ReactNode;
  className?: string;
}

export function FormGroup({
  id,
  label,
  required = false,
  helperText,
  hint,
  error,
  children,
  className = "",
}: FormGroupProps) {
  const displayHelper = helperText || hint;

  // Translate error to human-readable text if present
  let displayError: string | null = null;
  if (error) {
    if (typeof error === "string") {
      // Run through error translator to strip any accidental technical jargon
      displayError = toUserFacingError(error).message;
    } else {
      displayError = toUserFacingError(error).message;
    }
  }

  const helperId = id && displayHelper ? `${id}-helper` : undefined;
  const errorId = id && displayError ? `${id}-error` : undefined;

  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      )}

      <div>{children}</div>

      {displayHelper && !displayError && (
        <p id={helperId} className="text-xs text-slate-500 leading-normal">
          {displayHelper}
        </p>
      )}

      {displayError && (
        <p
          id={errorId}
          role="alert"
          className="text-xs text-rose-600 font-medium leading-normal flex items-start gap-1 mt-0.5"
        >
          <svg
            className="w-3.5 h-3.5 mt-0.5 shrink-0 fill-current text-rose-500"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span>{displayError}</span>
        </p>
      )}
    </div>
  );
}
