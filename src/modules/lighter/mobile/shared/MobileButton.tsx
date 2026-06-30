import React, { ButtonHTMLAttributes, forwardRef } from "react";
import cx from "classnames";

type Variant = "primary" | "secondary" | "ghost" | "buy" | "sell";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
}

const variantStyle: Record<Variant, React.CSSProperties> = {
  primary:   { background: "var(--ltr-up, #00d68f)", color: "#000" },
  secondary: { background: "rgba(255,255,255,0.1)", color: "var(--ltr-text-primary, #F3F3F3)" },
  ghost:     { background: "transparent", color: "var(--ltr-text-primary, #F3F3F3)" },
  buy:       { background: "var(--ltr-up, #00d68f)", color: "#000" },
  sell:      { background: "var(--ltr-down, #ff5252)", color: "#fff" },
};

export const MobileButton = forwardRef<HTMLButtonElement, Props>(function MobileButton(
  { variant = "primary", block, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      style={variantStyle[variant]}
      className={cx(
        "min-h-[44px] px-[16px] rounded-lg font-medium active:opacity-80 disabled:opacity-50 disabled:pointer-events-none",
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
