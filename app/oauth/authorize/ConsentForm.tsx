"use client";

import { useState } from "react";
import type { AuthorizeParams } from "@/lib/oauth";

interface Props {
  params: AuthorizeParams;
  clientName: string;
  redirectHost: string;
  connection: { name: string; type: string; readOnly: boolean } | null;
}

type Choice = { id: string; name: string; type: string };

export default function ConsentForm({ params, clientName, redirectHost, connection }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [choices, setChoices] = useState<Choice[]>();
  const [connId, setConnId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function decide(decision: "approve" | "deny") {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params, decision, email, password, connId: connId || undefined }),
      });
      const data = await res.json();
      if (!data.ok) return setError(data.error);
      if (data.chooseConnection) {
        setChoices(data.connections);
        setConnId(data.connections[0]?.id ?? "");
        return;
      }
      window.location.assign(data.redirect);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        decide("approve");
      }}
    >
      <h1>Autoriser l’accès</h1>
      <p>
        <strong>{clientName}</strong> demande l’accès à{" "}
        {connection ? (
          <>
            la connexion <strong>{connection.name}</strong> ({connection.type},{" "}
            {connection.readOnly ? "lecture seule" : "lecture et écriture"}).
          </>
        ) : (
          "une de vos connexions."
        )}
      </p>
      <p className="hint">
        Connectez-vous avec votre compte pour autoriser l’accès. Vous serez ensuite redirigé vers{" "}
        <code>{redirectHost}</code>. N’autorisez que si vous venez vous-même d’ajouter ce connecteur.
      </p>

      {choices && (
        <label className="field">
          <span>Connexion à autoriser</span>
          {choices.length ? (
            <select value={connId} onChange={(e) => setConnId(e.target.value)}>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.type}
                </option>
              ))}
            </select>
          ) : (
            <span className="status error">Aucune connexion disponible pour ce compte.</span>
          )}
        </label>
      )}

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
        <button type="button" className="btn secondary" disabled={busy} onClick={() => decide("deny")}>
          Refuser
        </button>
        <button type="submit" className="btn primary" disabled={busy || (choices && !connId)}>
          {busy ? "…" : "Autoriser"}
        </button>
      </div>
    </form>
  );
}
