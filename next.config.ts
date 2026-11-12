import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // 배포할 때 안내 자료(guide.md)가 서버 꾸러미에 꼭 들어가게 한다.
  outputFileTracingIncludes: {
    "/api/chat": ["./data/guide.md"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
