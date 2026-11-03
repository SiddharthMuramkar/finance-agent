import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Course Map is read from course/topics and course/outline.yaml at runtime, so ship those files with every route.
  outputFileTracingIncludes: { "/*": ["./course/topics/**/*", "./course/outline.yaml"] },
};

export default nextConfig;
