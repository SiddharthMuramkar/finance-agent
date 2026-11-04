import { ReadingSkeleton, SkeletonBlock } from "../route-skeleton";

export default function Loading() {
  return (
    <ReadingSkeleton current="sessions">
      <SkeletonBlock className="h-7 w-1/3" />
      {Array.from({ length: 5 }, (_, i) => (
        <SkeletonBlock key={i} className="h-14 w-full" />
      ))}
    </ReadingSkeleton>
  );
}
