import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Serveur MCP Bases de données",
  description: "Connectez PostgreSQL, MySQL, SQL Server, MongoDB ou Redis à Claude, ChatGPT et Copilot via MCP.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      {/* Certaines extensions (ColorZilla, Grammarly…) ajoutent des attributs à <body> avant React. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
