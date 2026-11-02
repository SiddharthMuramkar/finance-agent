import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Course Map is read from course/topics at runtime, so ship those files with every route.
  outputFileTracingIncludes: { "/*": ["./course/topics/**/*"] },
};

export default nextConfig;
