export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <span key={i} className="rounded-[3px] bg-[#8e0604]/30 px-[1px] text-white">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
