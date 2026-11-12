import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // 보안 헤더: 다른 사이트가 챗봇 화면을 몰래 끼워 넣거나 파일 종류를 속이지 못하게 한다.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
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
