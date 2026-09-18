import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

export default function config(phase) {
  const localDevelopment = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    poweredByHeader: false,
    devIndicators: false,
    async redirects() {
      return [
        { source: "/index.html", destination: "/heritage", permanent: false },
      ];
    },
    async rewrites() {
      // The trusted local developer identity must never be proxied in production.
      return {
        beforeFiles: localDevelopment
          ? [
              { source: "/workspace", destination: "http://127.0.0.1:4174/" },
              {
                source: "/api/:path*",
                destination: "http://127.0.0.1:4174/api/:path*",
              },
            ]
          : [],
      };
    },
  };
}
