import type { NextConfig } from "next";
import { securityHeaderRules } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // A small self-contained server for a container: it carries only the files it needs to run.
  output: "standalone",
  async headers() {
    return securityHeaderRules();
  },
};

export default nextConfig;
