import type { NextConfig } from "next";
import { securityHeaderRules } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // A small self-contained server for a container: it carries only the files it needs to run.
  output: "standalone",
  // The round badge Next shows in development sat on top of the first tab of the bar at the bottom of a phone screen.
  devIndicators: false,
  async headers() {
    return securityHeaderRules();
  },
};

export default nextConfig;
