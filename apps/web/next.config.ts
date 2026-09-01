import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // The workspace packages ship TypeScript source rather than a build
  // step, so Next compiles them along with the app. This is what lets the
  // route handlers embed the real engine instead of reimplementing it.
  transpilePackages: [
    "@vasooli/core",
    "@vasooli/stats",
    "@vasooli/ledger",
    "@vasooli/policy",
    "@vasooli/llm",
    "@vasooli/razorpay",
    "@vasooli/executor",
    "@vasooli/orchestrator",
    "@vasooli/simulator",
    "@vasooli/detector",
    "@vasooli/engine",
  ],

  // Those packages are Node ESM: they import siblings as "./state.js"
  // even though the file on disk is state.ts. Node resolves that natively;
  // the bundler needs to be told to try .ts first.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
