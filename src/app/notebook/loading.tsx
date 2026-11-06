import { ReadingSkeleton, SkeletonBlock, SkeletonLines } from "../route-skeleton";

export default function Loading() {
  return (
    <ReadingSkeleton current="notebook">
      <SkeletonBlock className="h-7 w-1/4" />
      <SkeletonLines count={2} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-[var(--gap)]">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonBlock key={i} className="h-48 w-full" />
        ))}
      </div>
    </ReadingSkeleton>
  );
}
