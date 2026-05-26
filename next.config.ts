import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["playwright", "playwright-core", "puppeteer-core", "@sparticuz/chromium"],
  experimental: {
    outputFileTracingIncludes: {
      "/api/grint/submit": ["./node_modules/@sparticuz/chromium/bin/**"],
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
