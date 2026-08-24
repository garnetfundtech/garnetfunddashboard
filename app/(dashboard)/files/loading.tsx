import { SkeletonKpiRow, SkeletonPanel } from "@/components/dashboard/skeleton";

export default function Loading() {
  return (
    <div className="flex h-full animate-pulse flex-col gap-3">
      <SkeletonKpiRow />
      <div className="grid flex-1 gap-3" style={{ gridTemplateColumns: "196px minmax(0,1fr)" }}>
        <SkeletonPanel />
        <SkeletonPanel />
      </div>
    </div>
  );
}
