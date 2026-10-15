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
    subtitleText: string;
  }
> = {
  maroon: {
    topBar: "bg-gradient-to-r from-[#D4AF37] via-[#F3E5AB] to-[#D4AF37]",
    border: "border-[#7D1B28]/80",
    hoverBorder: "hover:border-[#D4AF37]/70",
    bgGradient: "bg-gradient-to-br from-[#4D0610] via-[#5B0612] to-[#3B030A]",
    iconBg: "bg-white/10 border border-white/20",
    iconText: "text-[#F5EBDC]",
    titleText: "text-[#F5EBDC]",
    valueText: "text-white",
    subtitleText: "text-[#E8D7C3]/80",
  },
  emerald: {
    topBar: "bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500",
    border: "border-[#7D1B28]/80",
    hoverBorder: "hover:border-emerald-400/70",
    bgGradient: "bg-gradient-to-br from-[#4D0610] via-[#5B0612] to-[#3B030A]",
    iconBg: "bg-emerald-500/20 border border-emerald-400/30",
    iconText: "text-emerald-300",
    titleText: "text-[#F5EBDC]",
    valueText: "text-white",
    subtitleText: "text-[#E8D7C3]/80",
  },
  blue: {
    topBar: "bg-gradient-to-r from-sky-400 via-blue-300 to-indigo-500",
    border: "border-[#7D1B28]/80",
    hoverBorder: "hover:border-sky-400/70",
    bgGradient: "bg-gradient-to-br from-[#4D0610] via-[#5B0612] to-[#3B030A]",
    iconBg: "bg-sky-500/20 border border-sky-400/30",
    iconText: "text-sky-300",
    titleText: "text-[#F5EBDC]",
    valueText: "text-white",
    subtitleText: "text-[#E8D7C3]/80",
  },
  amber: {
    topBar: "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500",
    border: "border-[#7D1B28]/80",
    hoverBorder: "hover:border-amber-400/70",
    bgGradient: "bg-gradient-to-br from-[#4D0610] via-[#5B0612] to-[#3B030A]",
    iconBg: "bg-amber-500/20 border border-amber-400/30",
    iconText: "text-amber-300",
    titleText: "text-[#F5EBDC]",
    valueText: "text-white",
    subtitleText: "text-[#E8D7C3]/80",
  },
  purple: {
    topBar: "bg-gradient-to-r from-purple-400 via-violet-300 to-fuchsia-500",
    border: "border-[#7D1B28]/80",
    hoverBorder: "hover:border-purple-400/70",
    bgGradient: "bg-gradient-to-br from-[#4D0610] via-[#5B0612] to-[#3B030A]",
    iconBg: "bg-purple-500/20 border border-purple-400/30",
    iconText: "text-purple-300",
    titleText: "text-[#F5EBDC]",
    valueText: "text-white",
    subtitleText: "text-[#E8D7C3]/80",
  },
  rose: {
    topBar: "bg-gradient-to-r from-rose-400 via-pink-300 to-red-500",
    border: "border-[#7D1B28]/80",
    hoverBorder: "hover:border-rose-400/70",
    bgGradient: "bg-gradient-to-br from-[#4D0610] via-[#5B0612] to-[#3B030A]",
    iconBg: "bg-rose-500/20 border border-rose-400/30",
    iconText: "text-rose-300",
    titleText: "text-[#F5EBDC]",
    valueText: "text-white",
    subtitleText: "text-[#E8D7C3]/80",
  },
  slate: {
    topBar: "bg-gradient-to-r from-stone-400 via-stone-200 to-stone-400",
    border: "border-[#7D1B28]/80",
    hoverBorder: "hover:border-stone-400/70",
    bgGradient: "bg-gradient-to-br from-[#4D0610] via-[#5B0612] to-[#3B030A]",
    iconBg: "bg-white/10 border border-white/20",
    iconText: "text-stone-200",
    titleText: "text-[#F5EBDC]",
    valueText: "text-white",
    subtitleText: "text-[#E8D7C3]/80",
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
      className={`relative rounded-2xl border ${theme.border} ${theme.hoverBorder} ${theme.bgGradient} shadow-[0_4px_20px_rgba(40,2,8,0.35)] hover:shadow-[0_12px_32px_rgba(40,2,8,0.55)] transition-all duration-300 ease-out hover:-translate-y-1.5 overflow-hidden group cursor-default flex flex-col justify-between ${className}`}
    >
      {/* Top Glowing Accent Bar */}
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
            className={`text-xl min-[360px]:text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums ${theme.valueText} break-words leading-tight min-w-0`}
          >
            {value}
          </div>
          {badge && <div className="shrink-0 whitespace-nowrap">{badge}</div>}
        </div>

        {/* Subtitle / Description Row */}
        {subtitle && (
          <p
            className={`text-xs ${theme.subtitleText} line-clamp-2 leading-relaxed min-w-0 pt-0.5`}
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
      <Link href={href} className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-2xl">
        {content}
      </Link>
    );
  }

  return content;
}
