import type { NextConfig } from "next";
import { securityHeaderRules } from "./lib/security-headers";

const nextConfig: NextConfig = {
  async headers() {
    return securityHeaderRules();
  },
};

export default nextConfig;
