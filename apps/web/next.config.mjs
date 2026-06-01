const backendUrl = process.env.BACKEND_URL ?? "http://localhost:3001";

const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: ".",
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
