"use client";

import { useCallback, useEffect, useState } from "react";
import AccountPanel from "./_components/AccountPanel";
import { api } from "./_components/api";
import ConnectionsPanel from "./_components/ConnectionsPanel";
import type { Actor } from "./_components/types";
import UsersPanel from "./_components/UsersPanel";

interface Session {
  actor: Actor | null;
  configured: { encryptionKey: boolean; adminPassword: boolean; store: "mongodb" | "redis" | "memory" | "missing" };
}

type Tab = "connections" | "users" | "account";

export default function Home() {
  const [session, setSession] = useState<Session>();
  const [tab, setTab] = useState<Tab>("connections");

  const refreshSession = useCallback(async () => {
    const res = await fetch("/api/auth/session");
    setSession(await res.json());
    setTab("connections");
  }, []);

  useEffect(() => {
    refreshSession().catch(() => undefined);
  }, [refreshSession]);

  const actor = session?.actor;
  const tabs: { id: Tab; label: string }[] = actor
    ? actor.role === "admin"
      ? [
          { id: "connections", label: "Connexions" },
          { id: "users", label: "Utilisateurs" },
        ]
      : [
          { id: "connections", label: "Mes connexions" },
          { id: "account", label: "Mon compte" },
        ]
    : [];

  return (
    <main className="page">
      <header className="hero">
        <div>
          <h1>Serveur MCP — Bases de données</h1>
          <p>
            Connectez une base relationnelle ou NoSQL à Claude, ChatGPT, Copilot et à tout client compatible MCP. Chaque
            assistant est autorisé avec le compte de son utilisateur (OAuth), et les accès sont révocables à tout moment.
          </p>
        </div>
        {actor && (
          <div className="whoami">
            {actor.role === "admin" ? (
              <span className="badge">Administrateur</span>
            ) : (
              <span>
                <strong>{actor.name}</strong>
                <span className="badge muted">Utilisateur</span>
              </span>
            )}
            <button
              className="btn ghost-lg"
              onClick={async () => {
                await api("/api/auth/session", "DELETE");
                refreshSession();
              }}
            >
              Déconnexion
            </button>
          </div>
        )}
      </header>

      {session && <ConfigBanners configured={session.configured} />}
      {session && !actor && <Login onLogin={refreshSession} />}

      {actor && (
        <>
          <nav className="tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          {tab === "connections" && <ConnectionsPanel key={actor.id} actor={actor} onUnauthorized={refreshSession} />}
          {tab === "users" && actor.role === "admin" && <UsersPanel />}
          {tab === "account" && actor.role === "user" && <AccountPanel actor={actor} />}
        </>
      )}

      <footer className="footer">
        Transport MCP : Streamable HTTP · Authentification OAuth 2.1 · PostgreSQL · MySQL/MariaDB · SQL Server · MongoDB · Redis
      </footer>
    </main>
  );
}

function ConfigBanners({ configured }: { configured: Session["configured"] }) {
  return (
    <>
      {!configured.encryptionKey && (
        <div className="banner error">
          <code>ENCRYPTION_KEY</code> n’est pas configurée (32 caractères aléatoires recommandés).
        </div>
      )}
      {!configured.adminPassword && (
        <div className="banner error">
          <code>ADMIN_PASSWORD</code> n’est pas configuré : le compte administrateur est inutilisable.
        </div>
      )}
      {configured.store === "missing" && (
        <div className="banner error">
          <code>MONGODB_URI</code> n’est pas configurée : comptes et connexions ne peuvent pas être enregistrés.
        </div>
      )}
      {configured.store === "memory" && (
        <div className="banner warn">
          Stockage en mémoire (développement) : tout sera perdu au redémarrage. Définissez <code>MONGODB_URI</code>.
        </div>
      )}
    </>
  );
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card narrow"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await api("/api/auth/session", "POST", { email, password });
        setBusy(false);
        if (res.ok) onLogin();
        else setError(res.error);
      }}
    >
      <h2>Connexion</h2>
      <label className="field">
        <span>Identifiant (e-mail)</span>
        <input type="text" autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field">
        <span>Mot de passe</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <p className="status error">{error}</p>}
      <div className="actions">
        <button className="btn primary" disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </div>
      <p className="hint">Mot de passe oublié ? Demandez un lien de réinitialisation à l’administrateur.</p>
    </form>
  );
}
