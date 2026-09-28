import { SkeletonTable } from "@/components/dashboard/skeleton";

export default function Loading() {
  return (
    <div className="flex h-full animate-pulse flex-col gap-3">
      <SkeletonTable />
    </div>
  );
}
