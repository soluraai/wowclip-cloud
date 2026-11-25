import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Capiyo's caption templates name their files /api/caption-file/<path>; the files are plain static files in public/.
  async redirects() {
    return [{ source: "/api/caption-file/:path*", destination: "/:path*", permanent: true }];
  },
  // Every other request to /api/... is passed on to the Python backend (backend/server.py on port 5000), so the
  // browser only ever talks to one address and there is no CORS setup. It is a "fallback" rewrite: the two routes
  // in app/api (Capiyo's export planning and caption fonts) are answered by Next.js first.
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [{ source: "/api/:path*", destination: "http://127.0.0.1:5000/:path*" }],
    };
  },
};

export default nextConfig;
