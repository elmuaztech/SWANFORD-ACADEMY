import React from "react";

export function Card({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden transition-all duration-150 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`p-4 sm:p-6 pb-3 sm:pb-4 border-b border-slate-100 flex flex-col gap-1 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className = "",
  children,
  as: Component = "h3",
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" }) {
  const sanitizedClassName = className.replace(
    /\btext-(stone|slate|gray|neutral|zinc)-(800|900|950)\b|\btext-black\b/g,
    ""
  );
  const hasExplicitColor = /\btext-(white|emerald|amber|gold)\b|text-\[#(?:fff|ffffff|D4AF37|F5D061)\]/i.test(className);
  const defaultColor = hasExplicitColor ? "" : "text-[#5B0612]";
  return (
    <Component
      className={`card-title text-base sm:text-lg font-semibold ${defaultColor} tracking-tight leading-snug break-words ${sanitizedClassName}`}
      {...props}
    >
      {children}
    </Component>
  );
}

export function CardDescription({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`text-xs sm:text-sm text-slate-500 leading-relaxed ${className}`} {...props}>
      {children}
    </p>
  );
}

export function CardContent({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`p-4 sm:p-6 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`p-4 sm:p-6 pt-3 sm:pt-4 bg-slate-50/75 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
