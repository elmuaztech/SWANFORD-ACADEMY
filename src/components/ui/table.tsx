"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";

export interface HorizontalScrollWrapperProps {
  children: React.ReactNode;
  className?: string;
  showScrollHint?: boolean;
  showTopScrollbar?: boolean;
}

/**
 * Universal dual-scroll container that provides a synchronized horizontal scrollbar
 * at the top of wide tables and lists, as well as the native scrollbar at the bottom.
 */
export function HorizontalScrollWrapper({
  children,
  className = "",
  showScrollHint = false,
  showTopScrollbar = true,
}: HorizontalScrollWrapperProps) {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState<number>(0);
  const [canScroll, setCanScroll] = useState<boolean>(false);
  const isSyncing = useRef<boolean>(false);

  const measure = useCallback(() => {
    if (mainScrollRef.current) {
      const sw = mainScrollRef.current.scrollWidth;
      const cw = mainScrollRef.current.clientWidth;
      setContentWidth(sw);
      setCanScroll(sw > cw + 1);
    }
  }, []);

  useEffect(() => {
    measure();
    const handleResize = () => measure();
    window.addEventListener("resize", handleResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && mainScrollRef.current) {
      ro = new ResizeObserver(() => measure());
      ro.observe(mainScrollRef.current);
      if (mainScrollRef.current.firstElementChild) {
        ro.observe(mainScrollRef.current.firstElementChild);
      }
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (ro) ro.disconnect();
    };
  }, [measure]);

  const handleTopScroll = () => {
    if (isSyncing.current) return;
    if (topScrollRef.current && mainScrollRef.current) {
      isSyncing.current = true;
      mainScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
      requestAnimationFrame(() => {
        isSyncing.current = false;
      });
    }
  };

  const handleMainScroll = () => {
    if (isSyncing.current) return;
    if (topScrollRef.current && mainScrollRef.current) {
      isSyncing.current = true;
      topScrollRef.current.scrollLeft = mainScrollRef.current.scrollLeft;
      requestAnimationFrame(() => {
        isSyncing.current = false;
      });
    }
  };

  return (
    <div className={`w-full overflow-hidden ${className}`}>
      {showTopScrollbar && canScroll && (
        <div className="w-full bg-slate-50 border-b border-slate-200/80 px-2 py-0.5 flex items-center gap-2 select-none transition-opacity duration-150">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap shrink-0 flex items-center gap-1">
            <span aria-hidden="true" className="text-xs leading-none">↔</span>
            <span className="hidden sm:inline">Scroll</span>
          </span>
          <div
            ref={topScrollRef}
            onScroll={handleTopScroll}
            className="flex-1 overflow-x-auto top-scrollbar"
            style={{ height: "12px" }}
            aria-label="Top horizontal scrollbar"
          >
            <div style={{ width: `${contentWidth}px`, height: "1px" }} />
          </div>
        </div>
      )}
      {showScrollHint && (
        <div className="sm:hidden px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Scroll horizontally to view all columns</span>
          <span aria-hidden="true">&rarr;</span>
        </div>
      )}
      <div
        ref={mainScrollRef}
        onScroll={handleMainScroll}
        className="w-full overflow-x-auto table-scrollbar"
      >
        {children}
      </div>
    </div>
  );
}

export function TableWrapper({
  children,
  className = "",
  showScrollHint = false,
  showTopScrollbar = true,
}: {
  children: React.ReactNode;
  className?: string;
  showScrollHint?: boolean;
  showTopScrollbar?: boolean;
}) {
  return (
    <HorizontalScrollWrapper
      className={`rounded-2xl border border-[#E2D6C5] bg-gradient-to-br from-[#FFFDF9] via-[#FAF7F2] to-[#F5EFE6] shadow-[0_4px_16px_rgba(0,0,0,0.05)] ${className}`}
      showScrollHint={showScrollHint}
      showTopScrollbar={showTopScrollbar}
    >
      {children}
    </HorizontalScrollWrapper>
  );
}

export function Table({
  className = "",
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={`w-full text-left border-collapse text-sm ${className}`} {...props}>
      {children}
    </table>
  );
}

export function TableHead({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`bg-[#F5EBDC]/60 border-b border-[#E2D6C5] text-xs font-semibold text-stone-700 tracking-tight uppercase select-none ${className}`} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`divide-y divide-slate-100 ${className}`} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({
  className = "",
  children,
  isClickable = false,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { isClickable?: boolean }) {
  return (
    <tr
      className={`transition-colors duration-100 hover:bg-slate-50/75 ${
        isClickable ? "cursor-pointer" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHeaderCell({
  className = "",
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={`px-4 py-3 sm:px-6 sm:py-3.5 whitespace-nowrap ${className}`} {...props}>
      {children}
    </th>
  );
}

export function TableCell({
  className = "",
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-3 sm:px-6 sm:py-3.5 text-slate-800 align-middle ${className}`} {...props}>
      {children}
    </td>
  );
}

/**
 * Mobile Card alternative for tables on mobile screens
 */
export function TableMobileCard({
  title,
  subtitle,
  badge,
  fields,
  actions,
  className = "",
  layout = "rows",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  fields: { label: string; value: React.ReactNode }[];
  actions?: React.ReactNode;
  className?: string;
  layout?: "rows" | "grid";
}) {
  return (
    <div className={`p-4 bg-white rounded-xl border border-slate-200/90 shadow-xs flex flex-col gap-3 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900 text-sm break-words">{title}</div>
          {subtitle && <div className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</div>}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>

      {layout === "grid" ? (
        <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-slate-100 py-2.5">
          {fields.map((f, i) => (
            <div key={i} className="flex flex-col min-w-0">
              <span className="text-slate-500 font-medium shrink-0">{f.label}</span>
              <span className="text-slate-800 font-semibold mt-0.5 truncate">{f.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-slate-100 border-t border-b border-slate-100 py-1 text-xs">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1.5 min-w-0">
              <span className="text-slate-500 font-medium shrink-0">{f.label}</span>
              <span
                className="text-slate-800 font-semibold text-right truncate min-w-0"
                title={typeof f.value === "string" ? f.value : undefined}
              >
                {f.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {actions && (
        <div className="w-full pt-1 flex flex-wrap items-center justify-end gap-2 [&>*]:flex-1 sm:[&>*]:flex-initial">
          {actions}
        </div>
      )}
    </div>
  );
}

export const TableHeader = TableHead;

