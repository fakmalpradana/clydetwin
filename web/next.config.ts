import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  turbopack: { resolveAlias: { "@spz-loader/core": "./lib/spz-stub.ts" } },
};

export default nextConfig;
