import { ReadingSkeleton, SkeletonBlock, SkeletonLines } from "../route-skeleton";

export default function Loading() {
  return (
    <ReadingSkeleton current="settings">
      <SkeletonBlock className="h-7 w-1/4" />
      <SkeletonLines count={2} />
      <SkeletonBlock className="h-10 w-full" />
      <SkeletonBlock className="h-10 w-full" />
    </ReadingSkeleton>
  );
}
