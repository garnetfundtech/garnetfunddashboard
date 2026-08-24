import { SkeletonKpiRow, SkeletonPanel } from "@/components/dashboard/skeleton";

export default function Loading() {
  return (
    <div className="flex h-full animate-pulse flex-col gap-3">
      <SkeletonKpiRow />
      <div className="grid flex-1 gap-3" style={{ gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.9fr)" }}>
        <SkeletonPanel />
        <SkeletonPanel />
      </div>
    </div>
  );
}
