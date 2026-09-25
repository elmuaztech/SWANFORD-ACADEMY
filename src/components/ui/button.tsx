import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "link";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      className = "",
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    // Base styles: clear focus ring, smooth transition, active state, minimum touch target height
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 select-none " +
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] focus-visible:ring-offset-2 " +
      "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none " +
      "active:scale-[0.98] min-h-[44px]";

    // Variant styles
    const variantStyles = {
      primary: "bg-[#800020] !text-white hover:bg-[#6b001a] active:bg-[#520014] shadow-sm",
      secondary: "bg-[#FAF7F2] text-stone-800 hover:bg-[#F2ECE1] active:bg-[#E8DCCB] border border-[#EFE9DF]",
      outline: "border border-stone-300 bg-white text-stone-700 hover:bg-[#FAF7F2] active:bg-[#F2ECE1] shadow-xs",
      ghost: "text-stone-700 hover:bg-[#FAF7F2] hover:text-stone-900",
      danger: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-sm",
      link: "text-[#800020] underline-offset-4 hover:underline p-0 min-h-auto min-w-auto bg-transparent active:scale-100",
    }[variant];

    // Size styles (guaranteeing >=44px touch height on mobile while adapting padding)
    const sizeStyles = {
      sm: "text-xs px-3 py-1.5 gap-1.5 min-h-[44px] sm:min-h-[36px]",
      md: "text-sm px-4 py-2 gap-2 min-h-[44px]",
      lg: "text-base px-5 py-2.5 gap-2.5 min-h-[48px]",
      icon: "p-2 min-w-[44px] min-h-[44px] justify-center",
    }[size];

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        aria-disabled={disabled || isLoading}
        className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4 text-current"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>{typeof children === "string" ? children : "Loading..."}</span>
          </span>
        ) : (
          <>
            {leftIcon && <span className="inline-flex shrink-0" aria-hidden="true">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="inline-flex shrink-0" aria-hidden="true">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
