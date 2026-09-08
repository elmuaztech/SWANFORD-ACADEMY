import React from "react";

export function TableWrapper({
  children,
  className = "",
  showScrollHint = false,
}: {
  children: React.ReactNode;
  className?: string;
  showScrollHint?: boolean;
}) {
  return (
    <div className={`w-full overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xs ${className}`}>
      {showScrollHint && (
        <div className="sm:hidden px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Scroll horizontally to view all columns</span>
          <span aria-hidden="true">&rarr;</span>
        </div>
      )}
      <div className="w-full overflow-x-auto table-scrollbar">
        {children}
      </div>
    </div>
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
    <thead className={`bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-700 tracking-tight uppercase select-none ${className}`} {...props}>
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
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  fields: { label: string; value: React.ReactNode }[];
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col gap-3 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900 text-sm break-words">{title}</div>
          {subtitle && <div className="text-xs text-slate-500 mt-0.5 break-words">{subtitle}</div>}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-slate-100 py-2.5">
        {fields.map((f, i) => (
          <div key={i} className="flex flex-col min-w-0">
            <span className="text-slate-500 font-medium">{f.label}</span>
            <span className="text-slate-800 font-semibold mt-0.5 break-words">{f.value}</span>
          </div>
        ))}
      </div>

      {actions && <div className="flex items-center justify-end gap-2 pt-1">{actions}</div>}
    </div>
  );
}
