import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No server: the page is client-rendered and its data is baked into
  // public/data by scripts/build-data.ts.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
