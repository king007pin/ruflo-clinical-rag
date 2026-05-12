"use client";

import { useState } from "react";

export type SectionFeature = { label: string; sub?: string };

type Props = {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  features?: SectionFeature[];
  preview?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

export default function CollapsibleSection({
  title,
  eyebrow,
  subtitle,
  features,
  preview,
  header,
  children,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="w-full overflow-hidden rounded-3xl border shadow-lg"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--card-border)" }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer flex-col gap-4 px-6 py-5 text-left transition hover:opacity-90"
        style={{
          backgroundColor: open
            ? "color-mix(in srgb, var(--accent) 5%, var(--card))"
            : "var(--card)",
        }}
      >
        {/* Header row */}
        <div className="relative flex flex-col items-center gap-1 text-center">
          <span
            className="absolute right-0 top-0 shrink-0 rounded-full border px-3 py-1 text-xs font-semibold"
            style={{
              borderColor: "var(--accent)",
              color: "var(--accent)",
              backgroundColor: "color-mix(in srgb, var(--accent) 10%, transparent)",
            }}
          >
            {open ? "Collapse ▲" : "Expand ▼"}
          </span>
          {eyebrow && (
            <p className="text-xs uppercase tracking-[0.28em]" style={{ color: "var(--accent)" }}>
              {eyebrow}
            </p>
          )}
          <h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs leading-relaxed max-w-lg" style={{ color: "var(--muted)" }}>
              {subtitle}
            </p>
          )}
        </div>

        {/* Feature pills — always visible, 4-col symmetric grid */}
        {features && features.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
            {features.map((f, i) => (
              <div
                key={i}
                className="flex flex-col items-center justify-center rounded-xl border px-2 py-2 text-center gap-0.5"
                style={{
                  borderColor: "var(--card-border)",
                  backgroundColor: "color-mix(in srgb, var(--accent) 5%, var(--bg))",
                }}
              >
                {f.sub && (
                  <span className="text-sm font-bold leading-tight" style={{ color: "var(--accent)" }}>
                    {f.sub}
                  </span>
                )}
                <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  {f.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Preview — always visible extra content below pills */}
        {preview && <div className="w-full">{preview}</div>}
      </button>

      {open && (
        <div className="px-6 pb-6 pt-2 space-y-5">
          {header}
          {children}
        </div>
      )}
    </div>
  );
}
