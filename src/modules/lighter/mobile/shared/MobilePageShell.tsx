import type { ReactNode } from "react";

type Props = {
  topNav: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * 标准 H5 三段式外壳。底部留 safe-area。
 */
export function MobilePageShell({ topNav, header, footer, children }: Props) {
  return (
    <div
      className="flex flex-col"
      style={{ height: "100dvh", background: "var(--ltr-bg-root, #06060C)", color: "var(--ltr-text-primary, #F3F3F3)" }}
    >
      <div className="flex-shrink-0" style={{ paddingTop: "var(--sai-top, 0px)" }}>
        {topNav}
        {header}
      </div>
      <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
      {footer && (
        <div className="flex-shrink-0" style={{ paddingBottom: "var(--sai-bottom, 0px)" }}>
          {footer}
        </div>
      )}
    </div>
  );
}
