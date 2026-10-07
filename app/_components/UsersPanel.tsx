"use client";

import { useCallback, useEffect, useState } from "react";
import { api, formatDate, type ApiResult } from "./api";
import CopyField from "./CopyField";
import type { UserRow } from "./types";

const STATUS: Record<UserRow["status"], { label: string; badge: string }> = {
  invited: { label: "Invitation en attente", badge: "badge warn" },
  active: { label: "Actif", badge: "badge ok" },
  disabled: { label: "Désactivé", badge: "badge error" },
};

export default function UsersPanel() {
  const [users, setUsers] = useState<UserRow[]>();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [link, setLink] = useState<{ email: string; url: string; reset: boolean }>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    const res = await api<{ users: UserRow[] }>("/api/admin/users");
    if (res.ok) setUsers(res.users);
    else setError(res.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(promise: Promise<ApiResult>, success: string) {
    const res = await promise;
    if (!res.ok) return setError(res.error);
    setError(undefined);
    setNotice(success);
    load();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await api<{ inviteUrl: string; user: { email: string } }>("/api/admin/users", "POST", { email, name });
    if (!res.ok) return setError(res.error);
    setError(undefined);
    setLink({ email: res.user.email, url: res.inviteUrl, reset: false });
    setEmail("");
    setName("");
    load();
  }

  async function newLink(u: UserRow) {
    const reset = u.status === "active";
    if (reset && !confirm(`Générer un lien de réinitialisation du mot de passe pour ${u.email} ?`)) return;
    const res = await api<{ inviteUrl: string }>(`/api/admin/users/${u.id}/invite`, "POST");
    if (!res.ok) return setError(res.error);
    setLink({ email: u.email, url: res.inviteUrl, reset });
  }

  return (
    <>
      {notice && (
        <div className="banner ok" role="status">
          {notice}
          <button className="link" onClick={() => setNotice(undefined)} aria-label="Fermer">×</button>
        </div>
      )}
      {error && <div className="banner error">{error}</div>}

      <form className="card" onSubmit={create}>
        <h2>Inviter un utilisateur</h2>
        <div className="grid">
          <label className="field span2">
            <span>E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@exemple.com" required />
          </label>
          <label className="field">
            <span>Nom (optionnel)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
        </div>
        <div className="actions">
          <button className="btn primary">Créer et obtenir le lien d’invitation</button>
        </div>

        {link && (
          <div className="access-box">
            <strong>
              {link.reset ? "Lien de réinitialisation" : "Lien d’invitation"} pour {link.email}
            </strong>
            <CopyField value={link.url} />
            <p className="hint">
              Transmettez ce lien à l’utilisateur par un canal de confiance. Il est valable 7 jours et ne peut servir qu’une
              fois{link.reset ? " ; le mot de passe actuel reste valable jusqu’à son utilisation" : ""}.
            </p>
          </div>
        )}
      </form>

      <section className="card">
        <h2>Utilisateurs</h2>
        {!users && !error && <p className="hint">Chargement…</p>}
        {users?.length === 0 && <p className="hint">Aucun utilisateur pour l’instant.</p>}
        <ul className="conn-list">
          {users?.map((u) => (
            <li key={u.id} className="conn">
              <div className="conn-head">
                <strong>{u.name}</strong>
                <span className="hint">{u.email}</span>
                <span className={STATUS[u.status].badge}>{STATUS[u.status].label}</span>
                {u.role === "admin" && <span className="badge">Administrateur</span>}
              </div>
              <dl className="meta">
                <div><dt>Créé</dt><dd>{formatDate(u.createdAt)}</dd></div>
                <div><dt>Dernière connexion</dt><dd>{formatDate(u.lastLoginAt)}</dd></div>
                <div><dt>Connexions attribuées</dt><dd>{u.assignedConnections}</dd></div>
                <div><dt>Connexions privées</dt><dd>{u.ownedConnections}</dd></div>
              </dl>
              <div className="actions compact">
                {u.status !== "disabled" && (
                  <button className="btn secondary" onClick={() => newLink(u)}>
                    {u.status === "invited" ? "Nouveau lien d’invitation" : "Réinitialiser le mot de passe"}
                  </button>
                )}
                {u.role === "admin" ? (
                  <button
                    className="btn secondary"
                    onClick={() =>
                      confirm(`Retirer le rôle administrateur à ${u.email} ?\n\nIl ne verra plus que ses connexions privées et celles qui lui sont attribuées.`) &&
                      run(api(`/api/admin/users/${u.id}`, "PATCH", { role: "user" }), `${u.email} n’est plus administrateur.`)
                    }
                  >
                    Retirer le rôle admin
                  </button>
                ) : (
                  <button
                    className="btn secondary"
                    onClick={() =>
                      confirm(`Nommer ${u.email} administrateur ?\n\nIl pourra voir et gérer toutes les connexions et tous les utilisateurs.`) &&
                      run(api(`/api/admin/users/${u.id}`, "PATCH", { role: "admin" }), `${u.email} est maintenant administrateur.`)
                    }
                  >
                    Nommer administrateur
                  </button>
                )}
                {u.status === "active" && (
                  <button
                    className="btn secondary"
                    onClick={() =>
                      confirm(`Désactiver ${u.email} ?\n\nSes sessions et les accès de ses assistants sont coupés immédiatement.`) &&
                      run(api(`/api/admin/users/${u.id}`, "PATCH", { status: "disabled" }), `${u.email} est désactivé.`)
                    }
                  >
                    Désactiver
                  </button>
                )}
                {u.status === "disabled" && (
                  <button
                    className="btn secondary"
                    onClick={() => run(api(`/api/admin/users/${u.id}`, "PATCH", { status: "active" }), `${u.email} est réactivé.`)}
                  >
                    Réactiver
                  </button>
                )}
                <button
                  className="btn danger"
                  onClick={() =>
                    confirm(
                      `Supprimer définitivement ${u.email} ?\n\nSes ${u.ownedConnections} connexion(s) privée(s) et tous ses accès seront supprimés.`,
                    ) && run(api(`/api/admin/users/${u.id}`, "DELETE"), `${u.email} a été supprimé.`)
                  }
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
