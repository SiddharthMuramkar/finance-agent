import { ReadingSkeleton, SkeletonBlock, SkeletonLines } from "../route-skeleton";

export default function Loading() {
  return (
    <ReadingSkeleton current="course">
      <SkeletonBlock className="h-7 w-1/3" />
      <SkeletonLines count={2} />
      {Array.from({ length: 4 }, (_, i) => (
        <SkeletonBlock key={i} className="h-16 w-full" />
      ))}
    </ReadingSkeleton>
  );
}
