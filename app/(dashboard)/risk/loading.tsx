import { SkeletonPanel } from "@/components/dashboard/skeleton";

export default function Loading() {
  return (
    <div className="flex h-full animate-pulse flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <SkeletonPanel className="h-24" />
        <SkeletonPanel className="h-24" />
        <SkeletonPanel className="h-24" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.6fr]">
        <SkeletonPanel className="h-32" />
        <SkeletonPanel className="h-32" />
        <SkeletonPanel className="h-32" />
      </div>
      <div className="grid flex-1 gap-3 lg:grid-cols-2">
        <SkeletonPanel />
        <SkeletonPanel />
      </div>
    </div>
  );
}
