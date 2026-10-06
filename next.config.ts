import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pilotes de bases de données chargés tels quels par Node plutôt que bundlés.
  serverExternalPackages: ["pg", "mysql2", "mssql", "tedious", "mongodb", "ioredis"],
  poweredByHeader: false,
};

export default nextConfig;
