import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables standalone output for lightweight containerized production deployments
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
