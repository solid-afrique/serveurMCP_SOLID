// Démarre le serveur MCP autonome : charge la configuration (.env.local) puis le serveur Next.
// Utilisé par le service Windows ; pour un essai manuel : node launcher.cjs
const fs = require("fs");
const path = require("path");

const envFile = path.join(__dirname, ".env.local");
if (fs.existsSync(envFile)) {
  // Le Bloc-notes peut enregistrer un BOM en tête de fichier.
  const text = fs.readFileSync(envFile, "utf8").replace(/^﻿/, "");
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    // Les variables déjà définies (service, système) sont prioritaires.
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
} else {
  console.error(`[launcher] Fichier de configuration introuvable : ${envFile}`);
}

process.env.NODE_ENV = "production";
// N'écoute que sur la machine locale : l'accès public passe par le tunnel ou IIS.
process.env.HOSTNAME = process.env.MCP_HOST || "127.0.0.1";
process.env.PORT = process.env.MCP_PORT || "3100";

require(path.join(__dirname, "app", "server.js"));
