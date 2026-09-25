import React from "react";

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "7xl" | "full";
}

/**
 * Swanford Academy — Canonical Page Container
 * Enforces uniform left/right margins, responsive padding,
 * and maximum widths across all administrative, educator, and guardian screens.
 */
export function PageContainer({
  children,
  className = "",
  maxWidth = "7xl",
  ...props
}: PageContainerProps) {
  const maxWidthClass = {
    sm: "max-w-xl",
    md: "max-w-3xl",
    lg: "max-w-5xl",
    xl: "max-w-6xl",
    "2xl": "max-w-6xl",
    "7xl": "max-w-7xl",
    full: "max-w-full",
  }[maxWidth];

  return (
    <div
      className={`w-full ${maxWidthClass} mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
