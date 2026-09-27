import type { ReactNode } from "react";

export function HoverTip({ children, tip, above = false }: { children: ReactNode; tip: string; above?: boolean }) {
  return (
    <span className={above ? "hover-tip is-above" : "hover-tip"} tabIndex={0}>
      <span className="hover-tip-label">{children}</span>
      <span className="hover-tip-mark" aria-hidden="true">?</span>
      <span className="hover-tip-bubble" role="tooltip">
        {tip}
      </span>
    </span>
  );
}
