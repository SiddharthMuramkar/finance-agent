import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Course Map is read from course/topics and course/outline.yaml at runtime, so ship those files with every route.
  outputFileTracingIncludes: { "/*": ["./course/topics/**/*", "./course/outline.yaml"] },
  // "/" is public, so no other site may frame any page (clickjacking), browsers must not guess content types,
  // and other sites see only our origin as the referrer. Only frame-ancestors is set: a full script CSP would need nonces.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
