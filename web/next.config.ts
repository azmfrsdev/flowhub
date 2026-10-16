import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run runs the standalone server in a container (ADR-0010).
  output: "standalone",
  // The Cloud Tasks client loads its protos by computed path, which the bundler can't follow: load it from node_modules.
  serverExternalPackages: ["@google-cloud/tasks", "google-gax"],
  // Files read at runtime by computed path, which tracing can't see: the prompts (ADR-0010 D5),
  // and the Cloud Tasks and gax API definitions (a missing protos.json broke Start intake on 2026-10-15).
  outputFileTracingIncludes: {
    "/*": ["src/server/prompts/**/*.md", "node_modules/@google-cloud/tasks/build/protos/**/*", "node_modules/google-gax/build/protos/**/*"],
  },
  // A PDF for Ask or tell is up to 20 MB (PRD FR-ING-1) and arrives through a server action.
  experimental: { serverActions: { bodySizeLimit: "21mb" } },
  cacheComponents: true,
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
