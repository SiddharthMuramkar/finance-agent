import { ReadingSkeleton, SkeletonBlock, SkeletonLines } from "../route-skeleton";

export default function Loading() {
  return (
    <ReadingSkeleton current="progress">
      <SkeletonBlock className="h-7 w-1/3" />
      <SkeletonBlock className="h-32 w-full" />
      <SkeletonLines count={4} />
    </ReadingSkeleton>
  );
}
