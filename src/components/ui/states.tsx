import React from "react";
import { Button } from "./button";
import { toUserFacingError } from "@/lib/ui/error_messages";

/**
 * Loading State with skeleton cards or accessible spinner
 */
export function LoadingState({
  title = "Loading school records...",
  description = "Please wait while we retrieve the latest information.",
  message,
  variant = "spinner",
  className = "",
}: {
  title?: string;
  description?: string;
  message?: string;
  variant?: "spinner" | "skeleton";
  className?: string;
}) {
  const displayTitle = message || title;
  if (variant === "skeleton") {
    return (
      <div className={`space-y-3 animate-pulse p-4 sm:p-6 bg-white rounded-xl border border-slate-200 ${className}`}>
        <div className="h-5 bg-slate-200 rounded-md w-1/3" />
        <div className="h-4 bg-slate-100 rounded-md w-2/3" />
        <div className="pt-4 space-y-2">
          <div className="h-10 bg-slate-100 rounded-lg w-full" />
          <div className="h-10 bg-slate-100 rounded-lg w-full" />
          <div className="h-10 bg-slate-100 rounded-lg w-full" />
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`p-8 sm:p-12 bg-white rounded-xl border border-slate-200/80 flex flex-col items-center justify-center text-center ${className}`}
    >
      <div className="w-10 h-10 text-[#800020] animate-spin mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
      <h4 className="text-sm sm:text-base font-semibold text-[#5B0612] tracking-tight">{displayTitle}</h4>
      <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-sm">{description}</p>
    </div>
  );
}

/**
 * Empty State for lists, tables, or search results
 */
export function EmptyState({
  title = "No records found",
  description = "There are currently no items matching your criteria in the academy records.",
  icon,
  actionLabel,
  actionHref,
  onAction,
  secondaryActionLabel,
  secondaryActionHref,
  onSecondaryAction,
  actions,
  className = "",
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  secondaryActionHref?: string;
  onSecondaryAction?: () => void;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`p-8 sm:p-12 bg-white rounded-xl border border-[#EADBDA] text-center flex flex-col items-center justify-center ${className}`}>
      <div className="w-12 h-12 rounded-full bg-[#FAF2F4] flex items-center justify-center text-[#800020] mb-3.5">
        {icon || (
          <svg className="w-6 h-6 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        )}
      </div>

      <h4 className="text-base sm:text-lg font-semibold text-[#5B0612] tracking-tight">{title}</h4>
      <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">{description}</p>

      {actions ? (
        <div className="mt-5">{actions}</div>
      ) : (actionLabel || secondaryActionLabel) && (
        <div className="mt-5 flex flex-col sm:flex-row items-center gap-2.5">
          {actionLabel && (
            actionHref ? (
              <a href={actionHref}>
                <Button variant="primary" size="md">
                  {actionLabel}
                </Button>
              </a>
            ) : onAction ? (
              <Button variant="primary" size="md" onClick={onAction}>
                {actionLabel}
              </Button>
            ) : null
          )}
          {secondaryActionLabel && (
            secondaryActionHref ? (
              <a href={secondaryActionHref}>
                <Button variant="outline" size="md">
                  {secondaryActionLabel}
                </Button>
              </a>
            ) : onSecondaryAction ? (
              <Button variant="outline" size="md" onClick={onSecondaryAction}>
                {secondaryActionLabel}
              </Button>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Error State with automatic non-technical human translation
 */
export function ErrorState({
  error,
  title,
  message,
  onRetry,
  retryLabel = "Try Again",
  actionLabel,
  onAction,
  className = "",
}: {
  error?: unknown;
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  const translated = toUserFacingError(error);
  const displayTitle = title || translated.title;
  const displayMessage = message || translated.message;
  const handleAction = onRetry || onAction;
  const buttonLabel = actionLabel || retryLabel;

  return (
    <div
      role="alert"
      className={`p-6 sm:p-10 bg-rose-50/50 rounded-xl border border-rose-200 text-center flex flex-col items-center justify-center ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-3.5">
        <svg className="w-6 h-6 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>

      <h4 className="text-base sm:text-lg font-bold text-rose-950 tracking-tight">{displayTitle}</h4>
      <p className="text-xs sm:text-sm text-slate-600 mt-1.5 max-w-md leading-relaxed">{displayMessage}</p>

      {handleAction && (
        <div className="mt-5">
          <Button variant="outline" size="md" onClick={handleAction} className="border-rose-300 text-rose-800 hover:bg-rose-100">
            {buttonLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Success Message confirmation
 */
export function SuccessMessage({
  title = "Saved Successfully",
  description,
  actionLabel,
  onAction,
  className = "",
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={`p-6 sm:p-10 bg-emerald-50/60 rounded-xl border border-emerald-200 text-center flex flex-col items-center justify-center ${className}`}>
      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 mb-3.5">
        <svg className="w-6 h-6 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h4 className="text-base sm:text-lg font-bold text-emerald-950 tracking-tight">{title}</h4>
      {description && <p className="text-xs sm:text-sm text-slate-600 mt-1.5 max-w-md leading-relaxed">{description}</p>}

      {actionLabel && onAction && (
        <div className="mt-5">
          <Button variant="primary" size="md" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
