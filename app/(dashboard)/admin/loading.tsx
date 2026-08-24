import { SkeletonPanel } from "@/components/dashboard/skeleton";

export default function Loading() {
  return (
    <div className="flex h-full animate-pulse flex-col gap-3">
      <SkeletonPanel className="h-40" />
      <SkeletonPanel className="flex-1" />
    </div>
  );
}
