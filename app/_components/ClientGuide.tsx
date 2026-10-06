"use client";

import { useState } from "react";

const CLIENTS = ["Claude", "ChatGPT", "Copilot (VS Code)", "Claude Code", "Cursor", "Autres (stdio)"] as const;
type Client = (typeof CLIENTS)[number];

function Snippet({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="snippet">
      <pre>{text}</pre>
      <button
        type="button"
        className="btn ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copié ✓" : "Copier"}
      </button>
    </div>
  );
}

function Steps({ client, url, name }: { client: Client; url: string; name: string }) {
  switch (client) {
    case "Claude":
      return (
        <ol className="steps">
          <li>Sur claude.ai ou Claude Desktop, ouvrez <b>Paramètres → Connecteurs</b>.</li>
          <li>Cliquez sur <b>Ajouter un connecteur personnalisé</b>, donnez-lui un nom et collez l’URL MCP.</li>
          <li>Cliquez sur <b>Se connecter</b> : la page d’autorisation de ce serveur s’ouvre. Connectez-vous avec votre compte et autorisez.</li>
          <li>Dans une conversation, activez le connecteur depuis le menu <b>Outils</b>.</li>
        </ol>
      );
    case "ChatGPT":
      return (
        <ol className="steps">
          <li>Ouvrez <b>Paramètres → Applications et connecteurs → Paramètres avancés</b> et activez le <b>Mode développeur</b>.</li>
          <li>Revenez à <b>Applications et connecteurs</b> puis cliquez sur <b>Créer</b>.</li>
          <li>Collez l’URL MCP, choisissez <b>Authentification : OAuth</b> et validez.</li>
          <li>La page d’autorisation de ce serveur s’ouvre : connectez-vous avec votre compte et autorisez.</li>
        </ol>
      );
    case "Copilot (VS Code)":
      return (
        <>
          <p className="hint">
            Ajoutez ceci à <code>.vscode/mcp.json</code>. Au premier démarrage du serveur, VS Code ouvre la page d’autorisation
            dans le navigateur.
          </p>
          <Snippet text={JSON.stringify({ servers: { [name]: { type: "http", url } } }, null, 2)} />
          <p className="hint">Pour Copilot Studio : <b>Outils → Ajouter un outil → Model Context Protocol</b>, URL ci-dessus, authentification OAuth 2.0 (enregistrement dynamique).</p>
        </>
      );
    case "Claude Code":
      return (
        <>
          <Snippet text={`claude mcp add --transport http ${name} "${url}"`} />
          <p className="hint">Puis lancez <code>/mcp</code> dans Claude Code et choisissez <b>Authenticate</b>.</p>
        </>
      );
    case "Cursor":
      return (
        <>
          <p className="hint">Ajoutez ceci à <code>~/.cursor/mcp.json</code>, puis cliquez sur <b>Login</b> à côté du serveur dans les réglages MCP :</p>
          <Snippet text={JSON.stringify({ mcpServers: { [name]: { url } } }, null, 2)} />
        </>
      );
    case "Autres (stdio)":
      return (
        <>
          <p className="hint">
            Pour les clients qui ne gèrent que le transport stdio, le pont <code>mcp-remote</code> s’occupe aussi de l’autorisation
            (il ouvre le navigateur au premier lancement) :
          </p>
          <Snippet text={JSON.stringify({ mcpServers: { [name]: { command: "npx", args: ["-y", "mcp-remote", url] } } }, null, 2)} />
        </>
      );
  }
}

export default function ClientGuide({ url, name }: { url: string; name: string }) {
  const [client, setClient] = useState<Client>("Claude");
  return (
    <>
      <div className="tabs" role="tablist">
        {CLIENTS.map((c) => (
          <button
            type="button"
            key={c}
            role="tab"
            aria-selected={client === c}
            className={client === c ? "tab active" : "tab"}
            onClick={() => setClient(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <Steps client={client} url={url} name={name} />
    </>
  );
}
