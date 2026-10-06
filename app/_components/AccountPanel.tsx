"use client";

import { useState } from "react";
import { api } from "./api";
import type { Actor } from "./types";

export default function AccountPanel({ actor }: { actor: Actor }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string }>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirmNext) return setStatus({ kind: "error", message: "Les deux mots de passe ne correspondent pas." });
    const res = await api("/api/account/password", "POST", { current, next });
    if (!res.ok) return setStatus({ kind: "error", message: res.error });
    setStatus({ kind: "ok", message: "Mot de passe modifié. Vos autres sessions ont été fermées." });
    setCurrent("");
    setNext("");
    setConfirmNext("");
  }

  return (
    <form className="card narrow" onSubmit={onSubmit}>
      <h2>Mon compte</h2>
      <p className="hint">
        {actor.name} — {actor.email}
      </p>
      <input type="text" autoComplete="username" value={actor.email} readOnly hidden />
      <label className="field">
        <span>Mot de passe actuel</span>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label className="field">
        <span>Nouveau mot de passe (10 caractères minimum)</span>
        <input type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
      </label>
      <label className="field">
        <span>Confirmation</span>
        <input type="password" autoComplete="new-password" minLength={10} value={confirmNext} onChange={(e) => setConfirmNext(e.target.value)} required />
      </label>
      {status && <p className={`status ${status.kind}`}>{status.message}</p>}
      <div className="actions">
        <button className="btn primary">Changer le mot de passe</button>
      </div>
    </form>
  );
}
