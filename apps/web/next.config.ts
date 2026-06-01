import type { NextConfig } from "next";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: resolve(__dirname, "."),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
