// Démarre le serveur MCP autonome : charge la configuration (.env.local) puis le serveur Next.
// Utilisé par IIS (ASP.NET Core Module ou HttpPlatformHandler) ou par le service Windows ;
// pour un essai manuel : node launcher.cjs
const fs = require("fs");
const net = require("net");
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
    // Les variables déjà définies (IIS, service, système) sont prioritaires.
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
} else {
  console.error(`[launcher] Fichier de configuration introuvable : ${envFile}`);
}

// Sous IIS, le module d'hébergement choisit le port et le transmet par une variable d'environnement.
const iisPort = process.env.ASPNETCORE_PORT || process.env.HTTP_PLATFORM_PORT;
const port = Number(process.env.MCP_PORT || iisPort || 3100);

process.env.NODE_ENV = "production";
// N'écoute que sur la machine locale : l'accès public passe par IIS (ou un tunnel).
process.env.HOSTNAME = process.env.MCP_HOST || "127.0.0.1";
process.env.PORT = String(port);
console.log(`[launcher] Serveur MCP sur http://${process.env.HOSTNAME}:${port}${iisPort ? " (port attribué par IIS)" : ""}`);

if (iisPort && process.env.HOSTNAME === "127.0.0.1") {
  // Le module IIS peut joindre le processus par 127.0.0.1 ou par ::1 : on accepte aussi l'IPv6 local.
  net
    .createServer((client) => {
      const upstream = net.connect(port, "127.0.0.1");
      client.pipe(upstream).pipe(client);
      const close = () => {
        client.destroy();
        upstream.destroy();
      };
      client.on("error", close);
      upstream.on("error", close);
    })
    .on("error", () => undefined) // IPv6 désactivé : sans conséquence
    .listen(port, "::1");
}

require(path.join(__dirname, "app", "server.js"));
