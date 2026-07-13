import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile exists in the home dir).
  turbopack: {
    root: path.join(__dirname),
  },
  // Emit .next/standalone so the Docker runtime stage needs no node_modules.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
