"use client";

import { useState } from "react";
import { api } from "@/app/_components/api";

interface Props {
  token: string;
  email: string;
  name: string;
  reset: boolean;
  minLength: number;
}

export default function InvitationForm({ token, email, name, reset, minLength }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("Les deux mots de passe ne correspondent pas.");
    setBusy(true);
    const res = await api("/api/account/invite", "POST", { token, password });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    window.location.assign("/");
  }

  return (
    <form onSubmit={onSubmit}>
      <h1>{reset ? "Nouveau mot de passe" : `Bienvenue ${name}`}</h1>
      <p className="hint">
        Compte : <strong>{email}</strong>.{" "}
        {reset ? "Choisissez un nouveau mot de passe." : "Choisissez votre mot de passe pour activer votre compte."}
      </p>
      <input type="text" autoComplete="username" value={email} readOnly hidden />
      <label className="field">
        <span>Mot de passe ({minLength} caractères minimum)</span>
        <input type="password" autoFocus autoComplete="new-password" minLength={minLength} value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <label className="field">
        <span>Confirmation</span>
        <input type="password" autoComplete="new-password" minLength={minLength} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </label>
      {error && <p className="status error">{error}</p>}
      <div className="actions">
        <button className="btn primary" disabled={busy}>
          {busy ? "Enregistrement…" : reset ? "Changer le mot de passe" : "Activer mon compte"}
        </button>
      </div>
    </form>
  );
}
