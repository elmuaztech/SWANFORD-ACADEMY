import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "success" | "warning" | "danger" | "info" | "neutral" | "brand" | "maroon" | "gold" | "dark" | "outline-white";
  size?: "sm" | "md";
  showDot?: boolean;
}

export function Badge({
  variant = "neutral",
  size = "md",
  showDot = false,
  className = "",
  children,
  ...props
}: BadgeProps) {
  const variantStyles: Record<string, string> = {
    brand: "bg-[#FAF2F4] text-[#800020] border-[#EADBDA]",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
    warning: "bg-amber-50 text-amber-800 border-amber-200/80",
    danger: "bg-rose-50 text-rose-800 border-rose-200/80",
    info: "bg-sky-50 text-sky-800 border-sky-200/80",
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
    maroon: "bg-[#5B0612] text-white border-[#800020]",
    gold: "bg-[#FCF8ED] text-[#856404] border-[#D4AF37]/60",
    dark: "bg-[#1C1A1A] text-white border-stone-700",
    "outline-white": "bg-white/15 text-white border-white/40",
  };

  const dotStyles: Record<string, string> = {
    brand: "bg-[#800020]",
    success: "bg-emerald-600",
    warning: "bg-amber-500",
    danger: "bg-rose-600",
    info: "bg-sky-500",
    neutral: "bg-slate-400",
    maroon: "bg-amber-300",
    gold: "bg-[#D4AF37]",
    dark: "bg-emerald-400",
    "outline-white": "bg-white",
  };

  const sizeStyles = {
    sm: "text-[11px] px-2 py-0.5 font-medium",
    md: "text-xs px-2.5 py-1 font-medium",
  }[size];

  const baseStyle = variantStyles[variant] || variantStyles.neutral;
  const dotStyle = dotStyles[variant] || dotStyles.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border whitespace-nowrap shrink-0 ${baseStyle} ${sizeStyles} ${className}`}
      {...props}
    >
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotStyle}`}
          aria-hidden="true"
        />
      )}
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
}
