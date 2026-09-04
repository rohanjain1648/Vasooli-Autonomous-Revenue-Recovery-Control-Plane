import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Next only auto-loads .env files from this package's own directory, but
// this monorepo's real .env lives at the repo root (see .env.example's
// own comment: "drop real credentials in here... no code changes
// anywhere"). next.config.ts runs once, early, in the same Node process
// that later serves every route handler, so setting process.env here is
// enough — no separate loader script needed.
//
// Parsed into a scratch object rather than straight into process.env,
// and only these specific keys copied over: the root .env also carries
// NEXT_PUBLIC_ENGINE_URL and PORT, which belong to the *separate*
// standalone-engine deployment mode (apps/engine on its own port) — this
// app's whole architecture is the opposite of that (see lib/api.ts's own
// comment: empty ENGINE_URL means same-origin, the embedded engine is
// the point). Loading those two here would silently repoint every
// client-side fetch at a port nothing is serving.
const rootEnv: Record<string, string> = {};
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env"), processEnv: rootEnv });
for (const key of ["GROQ_API_KEY", "GROQ_MODEL", "OPENAI_API_KEY", "OPENAI_MODEL", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]) {
  if (rootEnv[key] && !process.env[key]) process.env[key] = rootEnv[key];
}

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
