type SparkProps = {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: boolean;
};

export function Spark({ data, width = 64, height = 18, stroke, strokeWidth = 1.25, fill = false }: SparkProps) {
  if (!data?.length || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const last = data[data.length - 1] ?? 0;
  const positive = last >= 0;
  const color = stroke ?? (positive ? "var(--pos)" : "var(--neg)");
  const pad = 1.5;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * w,
    y: pad + (1 - (v - min) / range) * h,
  }));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const dFill = fill
    ? `${d} L${pts[pts.length - 1]!.x.toFixed(1)},${(height - pad).toFixed(1)} L${pts[0]!.x.toFixed(1)},${(height - pad).toFixed(1)} Z`
    : undefined;
  return (
    <svg width={width} height={height} className="block shrink-0" preserveAspectRatio="none">
      {fill && dFill && <path d={dFill} style={{ fill: color }} fillOpacity={0.12} />}
      <path d={d} style={{ stroke: color }} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
