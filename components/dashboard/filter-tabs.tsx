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
    <div className="flex items-center gap-0.5 rounded-[7px] border border-white/[0.06] bg-black/30 p-0.5">
      {resolved.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-[5px] px-2 py-[2px] text-[10.5px] transition ${
            value === o.value
              ? "bg-white/[0.07] text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
