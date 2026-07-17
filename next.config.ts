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
};

export default withNextIntl(nextConfig);
