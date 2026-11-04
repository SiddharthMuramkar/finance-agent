import { ReadingSkeleton, SkeletonBlock, SkeletonLines } from "../route-skeleton";

export default function Loading() {
  return (
    <ReadingSkeleton current="notes">
      <SkeletonBlock className="h-7 w-1/4" />
      <SkeletonLines count={3} />
      <SkeletonBlock className="h-24 w-full" />
      <SkeletonLines count={3} />
    </ReadingSkeleton>
  );
}
