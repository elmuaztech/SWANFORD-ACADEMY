import React from "react";
import Link from "next/link";

export type StatCardColor =
  | "maroon"
  | "emerald"
  | "blue"
  | "amber"
  | "purple"
  | "rose"
  | "slate";

export interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  color?: StatCardColor;
  href?: string;
  className?: string;
}

const COLOR_MAP: Record<
  StatCardColor,
  {
    topBar: string;
    border: string;
    hoverBorder: string;
    bgGradient: string;
    iconBg: string;
    iconText: string;
    titleText: string;
    valueText: string;
  }
> = {
  maroon: {
    topBar: "bg-gradient-to-r from-[#800020] via-[#5B0612] to-[#3B030A]",
    border: "border-[#EADBDA]",
    hoverBorder: "hover:border-[#800020]/60",
    bgGradient: "bg-gradient-to-br from-[#FFFDF9] via-[#FAF7F2] to-[#FAF2F4]",
    iconBg: "bg-[#FAF2F4] border border-[#EADBDA]",
    iconText: "text-[#800020]",
    titleText: "text-[#800020]/90",
    valueText: "text-[#5B0612]",
  },
  emerald: {
    topBar: "bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600",
    border: "border-emerald-200/80",
    hoverBorder: "hover:border-emerald-400",
    bgGradient: "bg-gradient-to-br from-[#FFFDF9] via-[#FAF7F2] to-emerald-50/70",
    iconBg: "bg-emerald-50 border border-emerald-100",
    iconText: "text-emerald-700",
    titleText: "text-emerald-800",
    valueText: "text-emerald-950",
  },
  blue: {
    topBar: "bg-gradient-to-r from-blue-500 via-sky-500 to-indigo-600",
    border: "border-blue-200/80",
    hoverBorder: "hover:border-blue-400",
    bgGradient: "bg-gradient-to-br from-[#FFFDF9] via-[#FAF7F2] to-blue-50/70",
    iconBg: "bg-blue-50 border border-blue-100",
    iconText: "text-blue-700",
    titleText: "text-blue-800",
    valueText: "text-blue-950",
  },
  amber: {
    topBar: "bg-gradient-to-r from-amber-400 via-orange-500 to-amber-600",
    border: "border-amber-200/80",
    hoverBorder: "hover:border-amber-400",
    bgGradient: "bg-gradient-to-br from-[#FFFDF9] via-[#FAF7F2] to-amber-50/70",
    iconBg: "bg-amber-50 border border-amber-100",
    iconText: "text-amber-800",
    titleText: "text-amber-800",
    valueText: "text-amber-950",
  },
  purple: {
    topBar: "bg-gradient-to-r from-purple-500 via-indigo-500 to-violet-600",
    border: "border-purple-200/80",
    hoverBorder: "hover:border-purple-400",
    bgGradient: "bg-gradient-to-br from-[#FFFDF9] via-[#FAF7F2] to-purple-50/70",
    iconBg: "bg-purple-50 border border-purple-100",
    iconText: "text-purple-700",
    titleText: "text-purple-800",
    valueText: "text-purple-950",
  },
  rose: {
    topBar: "bg-gradient-to-r from-rose-500 via-pink-500 to-red-600",
    border: "border-rose-200/80",
    hoverBorder: "hover:border-rose-400",
    bgGradient: "bg-gradient-to-br from-[#FFFDF9] via-[#FAF7F2] to-rose-50/70",
    iconBg: "bg-rose-50 border border-rose-100",
    iconText: "text-rose-700",
    titleText: "text-rose-800",
    valueText: "text-rose-950",
  },
  slate: {
    topBar: "bg-gradient-to-r from-stone-500 via-slate-600 to-stone-700",
    border: "border-[#E2D6C5]",
    hoverBorder: "hover:border-stone-400",
    bgGradient: "bg-gradient-to-br from-[#FFFDF9] via-[#FAF7F2] to-[#F2EBE1]",
    iconBg: "bg-stone-100 border border-stone-200",
    iconText: "text-stone-700",
    titleText: "text-stone-600",
    valueText: "text-stone-900",
  },
};

export function StatCard({
  title,
  value,
  subtitle,
  badge,
  icon,
  color = "maroon",
  href,
  className = "",
}: StatCardProps) {
  const theme = COLOR_MAP[color] || COLOR_MAP.maroon;

  const content = (
    <div
      className={`relative rounded-2xl border ${theme.border} ${theme.hoverBorder} ${theme.bgGradient} shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.12)] transition-all duration-300 ease-out hover:-translate-y-1.5 overflow-hidden group cursor-default flex flex-col justify-between ${className}`}
    >
      {/* Top Colorful Gradient Accent Bar */}
      <div className={`h-1.5 w-full ${theme.topBar} shrink-0`} />

      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3 min-w-0">
        {/* Header Row: Title & Optional Icon */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span
            className={`text-xs font-bold uppercase tracking-wider ${theme.titleText} truncate whitespace-nowrap min-w-0`}
            title={title}
          >
            {title}
          </span>
          {icon && (
            <div
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${theme.iconBg} ${theme.iconText} flex items-center justify-center shrink-0 shadow-xs transition-transform duration-300 group-hover:scale-110 group-hover:rotate-1`}
            >
              {icon}
            </div>
          )}
        </div>

        {/* Value Row: Large bold formatted digits & optional badge */}
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <div
            className={`text-2xl min-[390px]:text-3xl sm:text-3xl lg:text-2xl xl:text-3xl font-extrabold tracking-tight tabular-nums ${theme.valueText} truncate whitespace-nowrap min-w-0`}
          >
            {value}
          </div>
          {badge && <div className="shrink-0 whitespace-nowrap">{badge}</div>}
        </div>

        {/* Subtitle / Description Row */}
        {subtitle && (
          <p
            className="text-xs text-stone-600 line-clamp-2 leading-relaxed min-w-0 pt-0.5"
            title={subtitle}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] rounded-2xl">
        {content}
      </Link>
    );
  }

  return content;
}
