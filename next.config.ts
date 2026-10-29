import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remote photography is rendered with plain <img> + graceful fallback (see SafeImage),
  // so no remotePatterns are required.
  poweredByHeader: false,
};

export default nextConfig;
