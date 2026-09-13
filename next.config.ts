import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["mongodb", "cheerio"],
};

export default nextConfig;
