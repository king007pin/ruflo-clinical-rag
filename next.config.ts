import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enforcing strict build checks
  serverExternalPackages: ["undici", "node:sqlite"],
};

export default nextConfig;
