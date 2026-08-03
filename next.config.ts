import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";

// Finds ./src/i18n/request.ts on its own. Left at the default path on purpose:
// next-intl's Turbopack support rejects an absolute custom path, and this
// project pins a Turbopack root below.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile exists in the home dir).
  turbopack: {
    root: path.join(__dirname),
  },
  // Emit .next/standalone so the Docker runtime stage needs no node_modules.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),

  // web-push is Node-only; leave it unbundled so the standalone trace keeps it.
  serverExternalPackages: ["web-push"],

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Scoped, NOT global. The Next PWA guide suggests a blanket DENY, but
        // /[lang]/t/[slug] is a link merchants embed in their own pages — a
        // global rule would break that silently, and we'd hear about it from a
        // merchant rather than from a log.
        source: "/dashboard/:path*",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
