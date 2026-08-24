import { SkeletonKpiRow, SkeletonPanel } from "@/components/dashboard/skeleton";

export default function Loading() {
  return (
    <div className="flex h-full animate-pulse flex-col gap-3">
      <SkeletonKpiRow count={6} />
      <div
        className="grid shrink-0 gap-3"
        style={{ gridTemplateColumns: "minmax(0, 1.55fr) 188px 188px", height: "286px" }}
      >
        <SkeletonPanel />
        <div className="flex flex-col gap-3">
          <SkeletonPanel className="flex-1" />
          <SkeletonPanel className="flex-1" />
          <SkeletonPanel className="flex-1" />
        </div>
        <SkeletonPanel />
      </div>
      <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: "minmax(0, 1.55fr) minmax(200px, 0.45fr)" }}>
        <SkeletonPanel />
        <SkeletonPanel />
      </div>
    </div>
  );
}
