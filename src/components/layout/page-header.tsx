import React from "react";
import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  description,
  breadcrumbs,
  primaryAction,
  secondaryAction,
  actions,
  badge,
  className = "",
}: PageHeaderProps) {
  const displaySubtitle = description || subtitle;
  const displayActions = actions || (
    (primaryAction || secondaryAction) ? (
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
        {secondaryAction}
        {primaryAction}
      </div>
    ) : null
  );

  return (
    <div className={`flex flex-col gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-slate-200/80 mb-6 ${className}`}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center space-x-1.5 text-xs text-slate-500 overflow-x-auto table-scrollbar">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-slate-300 select-none">/</span>}
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-[#800020] underline-offset-2 hover:underline transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={isLast ? "font-semibold text-slate-800" : ""}>
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      {/* Title & Actions Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-[#5B0612]">
              {title}
            </h1>
            {badge && <div>{badge}</div>}
          </div>
          {displaySubtitle && (
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl">
              {displaySubtitle}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        {displayActions && (
          <div className="shrink-0">
            {displayActions}
          </div>
        )}
      </div>
    </div>
  );
}
