import React from "react";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export function Label({
  className = "",
  required = false,
  children,
  ...props
}: LabelProps) {
  return (
    <label
      className={`block text-xs sm:text-sm font-semibold text-slate-800 tracking-tight ${className}`}
      {...props}
    >
      {children}
      {required && (
        <span className="text-rose-600 ml-1 font-bold" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}
