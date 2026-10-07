import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pilotes de bases de données chargés tels quels par Node plutôt que bundlés.
  serverExternalPackages: ["pg", "mysql2", "mssql", "tedious", "mongodb", "ioredis"],
  poweredByHeader: false,

  // Paquet autonome pour un déploiement manuel (deploy/windows/package.ps1) ; Vercel n'en a pas besoin.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // Aucune image optimisée : évite la bibliothèque native « sharp » (liée au processeur de compilation).
  images: { unoptimized: true },

  // Découverte OAuth attendue par les clients MCP (RFC 8414 et RFC 9728).
  async rewrites() {
    return [
      { source: "/.well-known/oauth-authorization-server", destination: "/api/oauth/metadata" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/oauth/metadata" },
      { source: "/.well-known/openid-configuration", destination: "/api/oauth/metadata" },
      { source: "/.well-known/oauth-protected-resource", destination: "/api/oauth/protected-resource" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/oauth/protected-resource/:path*" },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
