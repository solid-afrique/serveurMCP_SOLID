"use client";

import { useCallback, useEffect, useState } from "react";
import { DB_LABELS, type DbType } from "@/lib/config";
import { api, formatDate, slug, type ApiResult } from "./api";
import ClientGuide from "./ClientGuide";
import ConnectionForm, { EMPTY_FORM, formFromConfig, type FormState } from "./ConnectionForm";
import CopyField from "./CopyField";
import type { Actor, UserRow } from "./types";

interface Connection {
  id: string;
  name: string;
  type: DbType;
  readOnly: boolean;
  ownerId: string;
  userIds: string[];
  createdAt: number;
  expiresAt?: number;
  expired: boolean;
  lastUsedAt: number | null;
  grants: { id: string; clientName: string; userId: string; userLabel: string; createdAt: number }[];
  canManage: boolean;
  url: string;
}

type Panel =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; id: string; initial: FormState }
  | { kind: "created"; id: string; url: string };

export default function ConnectionsPanel({ actor, onUnauthorized }: { actor: Actor; onUnauthorized: () => void }) {
  const isAdmin = actor.role === "admin";
  const [connections, setConnections] = useState<Connection[]>();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [panel, setPanel] = useState<Panel>({ kind: "none" });
  const [accessFor, setAccessFor] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    const res = await api<{ connections: Connection[] }>("/api/connections");
    if (!res.ok) return res.error.includes("reconnectez") ? onUnauthorized() : setError(res.error);
    setConnections(res.connections);
    setError(undefined);
    if (isAdmin) {
      const u = await api<{ users: UserRow[] }>("/api/admin/users");
      if (u.ok) setUsers(u.users);
    }
  }, [isAdmin, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  const userLabel = (id: string) => {
    if (id === "admin") return "Administrateur";
    const u = users.find((x) => x.id === id);
    return u ? u.email : "utilisateur supprimé";
  };

  async function run(promise: Promise<ApiResult>, success: string) {
    const res = await promise;
    if (!res.ok) return setError(res.error);
    setNotice(success);
    load();
  }

  async function edit(c: Connection) {
    const res = await api<{ connection: Record<string, unknown> }>(`/api/connections/${c.id}`);
    if (!res.ok) return setError(res.error);
    setPanel({ kind: "edit", id: c.id, initial: formFromConfig(res.connection) });
  }

  const revokeAll = (c: Connection) =>
    confirm(
      `Révoquer tous les accès à « ${c.name} » ?\n\nLes assistants connectés perdront l’accès immédiatement et devront se ré-autoriser. L’URL MCP reste la même.`,
    ) && run(api(`/api/connections/${c.id}/revoke`, "POST", {}), `Accès révoqués pour « ${c.name} ».`);

  const revokeMine = (c: Connection) =>
    confirm(`Déconnecter vos assistants de « ${c.name} » ?\n\nIls devront se ré-autoriser.`) &&
    run(api(`/api/connections/${c.id}/revoke`, "POST", {}), `Vos assistants ont été déconnectés de « ${c.name} ».`);

  const remove = (c: Connection) =>
    confirm(`Supprimer définitivement « ${c.name} » ?\n\nL’URL MCP cessera de fonctionner pour tous les assistants.`) &&
    run(api(`/api/connections/${c.id}`, "DELETE"), `Connexion « ${c.name} » supprimée.`);

  return (
    <>
      {notice && (
        <div className="banner ok" role="status">
          {notice}
          <button className="link" onClick={() => setNotice(undefined)} aria-label="Fermer">×</button>
        </div>
      )}
      {error && <div className="banner error">{error}</div>}

      {panel.kind === "create" && (
        <ConnectionForm
          initial={EMPTY_FORM}
          onCancel={() => setPanel({ kind: "none" })}
          onSaved={({ id, url }) => {
            setPanel({ kind: "created", id, url: url! });
            load();
          }}
        />
      )}
      {panel.kind === "edit" && (
        <ConnectionForm
          key={panel.id}
          initial={panel.initial}
          editId={panel.id}
          onCancel={() => setPanel({ kind: "none" })}
          onSaved={() => {
            setPanel({ kind: "none" });
            setNotice("Connexion mise à jour.");
            load();
          }}
        />
      )}
      {panel.kind === "created" && (
        <section className="card">
          <h2>Connexion créée</h2>
          <CopyField value={panel.url} />
          <p className="hint">
            Cette URL n’est pas secrète : elle ne donne accès à rien sans une autorisation accordée avec un compte ayant accès
            à la connexion.
            {isAdmin && " Utilisez « Gérer l’accès » pour l’attribuer à des utilisateurs."}
          </p>
          <h3>Ajouter à votre assistant</h3>
          <ClientGuide url={panel.url} name={slug(connections?.find((c) => c.id === panel.id)?.name ?? "base")} />
          <div className="actions">
            <button className="btn secondary" onClick={() => setPanel({ kind: "none" })}>
              Fermer
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <div className="section-head">
          <h2>{isAdmin ? "Toutes les connexions" : "Mes connexions"}</h2>
          {panel.kind === "none" && (
            <button className="btn primary" onClick={() => setPanel({ kind: "create" })}>
              + Nouvelle connexion
            </button>
          )}
        </div>

        {!connections && !error && <p className="hint">Chargement…</p>}
        {connections?.length === 0 && (
          <p className="hint">
            {isAdmin
              ? "Aucune connexion pour l’instant. Créez-en une pour obtenir une URL MCP."
              : "Aucune connexion. Créez une connexion privée ou demandez à l’administrateur de vous en attribuer une."}
          </p>
        )}

        <ul className="conn-list">
          {connections?.map((c) => {
            const mine = c.grants.filter((g) => g.userId === actor.id);
            return (
              <li key={c.id} className="conn">
                <div className="conn-head">
                  <strong>{c.name}</strong>
                  <span className="badge">{DB_LABELS[c.type]}</span>
                  <span className={c.readOnly ? "badge ok" : "badge warn"}>{c.readOnly ? "Lecture seule" : "Écriture"}</span>
                  {c.ownerId !== "admin" && (
                    <span className="badge muted">{isAdmin ? `Privée · ${userLabel(c.ownerId)}` : "Privée"}</span>
                  )}
                  {!isAdmin && c.ownerId === "admin" && <span className="badge muted">Attribuée par l’administrateur</span>}
                  {c.expired && <span className="badge error">Expirée</span>}
                </div>
                <CopyField value={c.url} compact />
                <dl className="meta">
                  <div><dt>Créée</dt><dd>{formatDate(c.createdAt)}</dd></div>
                  {c.canManage && <div><dt>Dernière utilisation</dt><dd>{formatDate(c.lastUsedAt)}</dd></div>}
                  {c.expiresAt && <div><dt>Expire</dt><dd>{formatDate(c.expiresAt)}</dd></div>}
                  {isAdmin && c.ownerId === "admin" && (
                    <div>
                      <dt>Utilisateurs ayant accès</dt>
                      <dd>{c.userIds.length ? c.userIds.map(userLabel).join(", ") : "aucun"}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{c.canManage ? "Assistants autorisés" : "Mes assistants autorisés"}</dt>
                    <dd>
                      {c.grants.length
                        ? c.grants.map((g) => (c.canManage ? `${g.clientName} (${g.userLabel})` : g.clientName)).join(", ")
                        : "aucun"}
                    </dd>
                  </div>
                </dl>

                {accessFor === c.id && (
                  <AccessManager
                    connection={c}
                    users={users}
                    onCancel={() => setAccessFor(undefined)}
                    onSaved={() => {
                      setAccessFor(undefined);
                      setNotice(`Accès à « ${c.name} » mis à jour.`);
                      load();
                    }}
                  />
                )}

                <div className="actions compact">
                  {isAdmin && c.ownerId === "admin" && accessFor !== c.id && (
                    <button className="btn secondary" onClick={() => setAccessFor(c.id)}>Gérer l’accès</button>
                  )}
                  {c.canManage ? (
                    <>
                      <button className="btn secondary" onClick={() => edit(c)}>Modifier</button>
                      <button className="btn secondary" onClick={() => revokeAll(c)} disabled={!c.grants.length}>
                        Révoquer les accès
                      </button>
                      <button className="btn danger" onClick={() => remove(c)}>Supprimer</button>
                    </>
                  ) : (
                    <button className="btn secondary" onClick={() => revokeMine(c)} disabled={!mine.length}>
                      Déconnecter mes assistants
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function AccessManager({
  connection,
  users,
  onCancel,
  onSaved,
}: {
  connection: Connection;
  users: UserRow[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState(new Set(connection.userIds));
  const [error, setError] = useState<string>();
  const candidates = users;

  async function save() {
    const res = await api(`/api/connections/${connection.id}/users`, "PUT", { userIds: [...selected] });
    if (res.ok) onSaved();
    else setError(res.error);
  }

  return (
    <div className="access-box">
      <strong>Qui peut utiliser cette connexion ?</strong>
      {candidates.length === 0 ? (
        <p className="hint">Aucun utilisateur. Créez-en dans l’onglet « Utilisateurs ».</p>
      ) : (
        <ul className="checklist">
          {candidates.map((u) => (
            <li key={u.id}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={selected.has(u.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(u.id);
                    else next.delete(u.id);
                    setSelected(next);
                  }}
                />
                <span>
                  <strong>{u.name}</strong>
                  <small>
                    {u.email}
                    {u.status !== "active" && ` · ${u.status === "invited" ? "invitation en attente" : "désactivé"}`}
                  </small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Retirer un utilisateur coupe immédiatement l’accès de ses assistants.</p>
      {error && <p className="status error">{error}</p>}
      <div className="actions compact">
        <button className="btn ghost-lg" onClick={onCancel}>Annuler</button>
        <button className="btn primary" onClick={save}>Enregistrer</button>
      </div>
    </div>
  );
}
