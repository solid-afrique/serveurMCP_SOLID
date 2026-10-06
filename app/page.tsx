"use client";

import { useEffect, useMemo, useState } from "react";
import { DB_LABELS, DB_TYPES, DEFAULT_PORTS, type DbType } from "@/lib/config";

type Mode = "fields" | "uri";

interface FormState {
  type: DbType;
  name: string;
  mode: Mode;
  connectionString: string;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
  readOnly: boolean;
  maxRows: string;
  expiresInDays: string;
}

const URI_PLACEHOLDERS: Record<DbType, string> = {
  postgresql: "postgresql://utilisateur:motdepasse@hote:5432/base?sslmode=require",
  mysql: "mysql://utilisateur:motdepasse@hote:3306/base",
  mssql: "Server=hote,1433;Database=base;User Id=utilisateur;Password=motdepasse;Encrypt=true",
  mongodb: "mongodb+srv://utilisateur:motdepasse@cluster.mongodb.net/base",
  redis: "rediss://default:motdepasse@hote:6379",
};

const INITIAL: FormState = {
  type: "postgresql",
  name: "",
  mode: "fields",
  connectionString: "",
  host: "",
  port: "",
  user: "",
  password: "",
  database: "",
  ssl: true,
  readOnly: true,
  maxRows: "200",
  expiresInDays: "",
};

type Status = { kind: "idle" | "loading" | "ok" | "error"; message?: string };

const CLIENTS = ["Claude", "ChatGPT", "Copilot (VS Code)", "Claude Code", "Cursor", "Autres (stdio)"] as const;
type Client = (typeof CLIENTS)[number];

function slug(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "base-de-donnees";
}

export default function Home() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [adminPassword, setAdminPassword] = useState("");
  const [serverStatus, setServerStatus] = useState<{ adminRequired: boolean; encryptionConfigured: boolean }>();
  const [test, setTest] = useState<Status>({ kind: "idle" });
  const [gen, setGen] = useState<Status>({ kind: "idle" });
  const [result, setResult] = useState<{ url: string; expiresAt: string | null }>();
  const [client, setClient] = useState<Client>("Claude");
  const [copied, setCopied] = useState<string>();

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setServerStatus).catch(() => undefined);
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setResult(undefined);
    setTest({ kind: "idle" });
  };

  const connection = useMemo(() => {
    const base = {
      type: form.type,
      name: form.name,
      ssl: form.ssl,
      readOnly: form.readOnly,
      maxRows: form.maxRows,
    };
    return form.mode === "uri"
      ? { ...base, connectionString: form.connectionString, database: form.type === "mongodb" ? form.database : "" }
      : {
          ...base,
          host: form.host,
          port: form.port || String(DEFAULT_PORTS[form.type]),
          user: form.user,
          password: form.password,
          database: form.database,
        };
  }, [form]);

  async function call(path: string, body: object) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function onTest() {
    setTest({ kind: "loading", message: "Connexion en cours…" });
    try {
      const data = await call("/api/connections/test", { connection });
      setTest(data.ok ? { kind: "ok", message: `Connexion réussie — ${data.version}` } : { kind: "error", message: data.error });
    } catch (e) {
      setTest({ kind: "error", message: String(e) });
    }
  }

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGen({ kind: "loading" });
    try {
      const data = await call("/api/connections/token", { connection, expiresInDays: form.expiresInDays });
      if (!data.ok) return setGen({ kind: "error", message: data.error });
      setResult({ url: data.url, expiresAt: data.expiresAt });
      setGen({ kind: "idle" });
    } catch (err) {
      setGen({ kind: "error", message: String(err) });
    }
  }

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(undefined), 1500);
  }

  const name = slug(form.name || `${form.type}-${form.database}`);

  return (
    <main className="page">
      <header className="hero">
        <h1>Serveur MCP — Bases de données</h1>
        <p>
          Connectez une base relationnelle ou NoSQL à Claude, ChatGPT, Copilot et à tout client compatible MCP.
          Les identifiants sont chiffrés dans l’URL générée et ne sont stockés nulle part sur le serveur.
        </p>
      </header>

      {serverStatus && !serverStatus.encryptionConfigured && (
        <div className="banner error">
          La variable d’environnement <code>ENCRYPTION_KEY</code> n’est pas configurée (32 caractères aléatoires
          recommandés). La génération d’URL échouera tant qu’elle n’est pas définie.
        </div>
      )}
      {serverStatus && !serverStatus.adminRequired && (
        <div className="banner warn">
          Aucun <code>ADMIN_PASSWORD</code> n’est défini : n’importe qui peut utiliser ce déploiement pour générer des
          URL. Définissez-le avant une mise en production.
        </div>
      )}

      <form className="card" onSubmit={onGenerate}>
        <h2>1. Paramètres de connexion</h2>

        <div className="types" role="radiogroup" aria-label="Type de base de données">
          {DB_TYPES.map((t) => (
            <button
              type="button"
              key={t}
              role="radio"
              aria-checked={form.type === t}
              className={form.type === t ? "type active" : "type"}
              onClick={() => set("type", t)}
            >
              <span className="type-name">{DB_LABELS[t]}</span>
              <span className="type-kind">{t === "mongodb" || t === "redis" ? "NoSQL" : "SQL"}</span>
            </button>
          ))}
        </div>

        <label className="field">
          <span>Nom de la connexion</span>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="ex. CRM production" maxLength={60} />
        </label>

        <div className="tabs small" role="tablist">
          {(["fields", "uri"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={form.mode === m}
              className={form.mode === m ? "tab active" : "tab"}
              onClick={() => set("mode", m)}
            >
              {m === "fields" ? "Champs séparés" : "Chaîne de connexion"}
            </button>
          ))}
        </div>

        {form.mode === "uri" ? (
          <>
            <label className="field">
              <span>Chaîne de connexion</span>
              <input
                type="password"
                autoComplete="off"
                value={form.connectionString}
                onChange={(e) => set("connectionString", e.target.value)}
                placeholder={URI_PLACEHOLDERS[form.type]}
                required
              />
              <small className="mono">{URI_PLACEHOLDERS[form.type]}</small>
            </label>
            {form.type === "mongodb" && (
              <label className="field">
                <span>Base par défaut (optionnel)</span>
                <input value={form.database} onChange={(e) => set("database", e.target.value)} />
              </label>
            )}
          </>
        ) : (
          <div className="grid">
            <label className="field span2">
              <span>Hôte</span>
              <input value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="db.exemple.com" required />
            </label>
            <label className="field">
              <span>Port</span>
              <input
                inputMode="numeric"
                value={form.port}
                onChange={(e) => set("port", e.target.value.replace(/\D/g, ""))}
                placeholder={String(DEFAULT_PORTS[form.type])}
              />
            </label>
            <label className="field">
              <span>{form.type === "redis" ? "Numéro de base (0–15)" : "Base de données"}</span>
              <input value={form.database} onChange={(e) => set("database", e.target.value)} placeholder={form.type === "redis" ? "0" : ""} />
            </label>
            <label className="field">
              <span>Utilisateur</span>
              <input autoComplete="off" value={form.user} onChange={(e) => set("user", e.target.value)} placeholder={form.type === "redis" ? "default" : ""} />
            </label>
            <label className="field">
              <span>Mot de passe</span>
              <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} />
            </label>
          </div>
        )}

        <h2>2. Options</h2>
        <div className="options">
          <label className="check">
            <input type="checkbox" checked={form.readOnly} onChange={(e) => set("readOnly", e.target.checked)} />
            <span>
              <strong>Lecture seule</strong>
              <small>Recommandé. Les outils d’écriture ne sont pas exposés à l’IA.</small>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={form.ssl} onChange={(e) => set("ssl", e.target.checked)} />
            <span>
              <strong>SSL / TLS</strong>
              <small>Requis par la plupart des bases hébergées (Neon, Supabase, Azure, Atlas…).</small>
            </span>
          </label>
          <label className="field">
            <span>Lignes max. par réponse</span>
            <input inputMode="numeric" value={form.maxRows} onChange={(e) => set("maxRows", e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="field">
            <span>Expiration de l’URL</span>
            <select value={form.expiresInDays} onChange={(e) => set("expiresInDays", e.target.value)}>
              <option value="">Jamais</option>
              <option value="1">1 jour</option>
              <option value="7">7 jours</option>
              <option value="30">30 jours</option>
              <option value="90">90 jours</option>
              <option value="365">1 an</option>
            </select>
          </label>
        </div>

        {serverStatus?.adminRequired && (
          <label className="field">
            <span>Mot de passe administrateur</span>
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required />
          </label>
        )}

        <div className="actions">
          <button type="button" className="btn secondary" onClick={onTest} disabled={test.kind === "loading"}>
            {test.kind === "loading" ? "Test…" : "Tester la connexion"}
          </button>
          <button type="submit" className="btn primary" disabled={gen.kind === "loading"}>
            {gen.kind === "loading" ? "Génération…" : "Générer l’URL MCP"}
          </button>
        </div>

        {test.kind !== "idle" && <p className={`status ${test.kind}`}>{test.message}</p>}
        {gen.kind === "error" && <p className="status error">{gen.message}</p>}
      </form>

      {result && (
        <section className="card">
          <h2>3. Votre URL MCP</h2>
          <div className="url-box">
            <code>{result.url}</code>
            <button className="btn primary" onClick={() => copy(result.url, "url")}>
              {copied === "url" ? "Copié ✓" : "Copier"}
            </button>
          </div>
          <p className="hint">
            Cette URL contient vos identifiants chiffrés : traitez-la comme un mot de passe.
            {result.expiresAt ? ` Elle expire le ${new Date(result.expiresAt).toLocaleDateString("fr-FR")}.` : ""}
          </p>

          <h3>Ajouter à votre assistant</h3>
          <div className="tabs" role="tablist">
            {CLIENTS.map((c) => (
              <button
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
          <ClientGuide client={client} url={result.url} name={name} copy={copy} copied={copied} />
        </section>
      )}

      <footer className="footer">
        Transport MCP : Streamable HTTP (sans état) · PostgreSQL · MySQL/MariaDB · SQL Server · MongoDB · Redis
      </footer>
    </main>
  );
}

function Snippet({ text, id, copy, copied }: { text: string; id: string; copy: (t: string, id: string) => void; copied?: string }) {
  return (
    <div className="snippet">
      <pre>{text}</pre>
      <button className="btn ghost" onClick={() => copy(text, id)}>
        {copied === id ? "Copié ✓" : "Copier"}
      </button>
    </div>
  );
}

function ClientGuide({
  client,
  url,
  name,
  copy,
  copied,
}: {
  client: Client;
  url: string;
  name: string;
  copy: (t: string, id: string) => void;
  copied?: string;
}) {
  const p = { copy, copied };
  switch (client) {
    case "Claude":
      return (
        <ol className="steps">
          <li>Sur claude.ai ou Claude Desktop, ouvrez <b>Paramètres → Connecteurs</b>.</li>
          <li>Cliquez sur <b>Ajouter un connecteur personnalisé</b>.</li>
          <li>Donnez-lui un nom et collez l’URL MCP ci-dessus, sans authentification OAuth.</li>
          <li>Dans une conversation, activez le connecteur depuis le menu <b>Outils</b>.</li>
        </ol>
      );
    case "ChatGPT":
      return (
        <ol className="steps">
          <li>Ouvrez <b>Paramètres → Applications et connecteurs → Paramètres avancés</b> et activez le <b>Mode développeur</b>.</li>
          <li>Revenez à <b>Applications et connecteurs</b> puis cliquez sur <b>Créer</b>.</li>
          <li>Collez l’URL MCP dans <b>URL du serveur MCP</b>, choisissez <b>Authentification : Aucune</b>, puis validez.</li>
          <li>Dans une conversation, sélectionnez le mode développeur et activez le connecteur.</li>
        </ol>
      );
    case "Copilot (VS Code)":
      return (
        <>
          <p className="hint">Créez ou complétez le fichier <code>.vscode/mcp.json</code> de votre projet, puis utilisez Copilot Chat en mode Agent :</p>
          <Snippet id="vscode" {...p} text={JSON.stringify({ servers: { [name]: { type: "http", url } } }, null, 2)} />
          <p className="hint">Pour Copilot Studio : <b>Outils → Ajouter un outil → Model Context Protocol</b>, puis collez l’URL.</p>
        </>
      );
    case "Claude Code":
      return <Snippet id="cc" {...p} text={`claude mcp add --transport http ${name} "${url}"`} />;
    case "Cursor":
      return (
        <>
          <p className="hint">Ajoutez ceci à <code>~/.cursor/mcp.json</code> (ou <code>.cursor/mcp.json</code> dans le projet) :</p>
          <Snippet id="cursor" {...p} text={JSON.stringify({ mcpServers: { [name]: { url } } }, null, 2)} />
        </>
      );
    case "Autres (stdio)":
      return (
        <>
          <p className="hint">Pour les clients qui ne gèrent que le transport stdio, passez par le pont <code>mcp-remote</code> :</p>
          <Snippet
            id="stdio"
            {...p}
            text={JSON.stringify({ mcpServers: { [name]: { command: "npx", args: ["-y", "mcp-remote", url] } } }, null, 2)}
          />
        </>
      );
  }
}
