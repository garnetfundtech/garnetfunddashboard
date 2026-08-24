"use client";

export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: (T | { value: T; label: string })[];
  value: T;
  onChange: (v: T) => void;
}) {
  const resolved = options.map((o) =>
    typeof o === "string" ? { value: o as T, label: o as string } : o,
  );

  return (
    <div className="flex items-center gap-0.5 rounded-none border border-line bg-paper-3 p-0.5">
      {resolved.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-none px-2 py-[3px] text-[12px] transition-colors ${
            value === o.value
              ? "bg-surface text-ink"
              : "text-ink-3 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
