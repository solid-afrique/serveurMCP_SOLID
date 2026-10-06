"use client";

import { useMemo, useState } from "react";
import { DB_LABELS, DB_TYPES, DEFAULT_PORTS, type DbType } from "@/lib/config";
import { api } from "./api";

type Mode = "fields" | "uri";

export interface FormState {
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

export const EMPTY_FORM: FormState = {
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

/** Configuration publique renvoyée par l'API (sans secrets) → état du formulaire. */
export function formFromConfig(c: Record<string, unknown>): FormState {
  const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  return {
    ...EMPTY_FORM,
    type: c.type as DbType,
    name: str(c.name),
    mode: c.hasConnectionString ? "uri" : "fields",
    host: str(c.host),
    port: str(c.port),
    user: str(c.user),
    database: str(c.database),
    ssl: Boolean(c.ssl),
    readOnly: Boolean(c.readOnly),
    maxRows: str(c.maxRows),
  };
}

const URI_PLACEHOLDERS: Record<DbType, string> = {
  postgresql: "postgresql://utilisateur:motdepasse@hote:5432/base?sslmode=require",
  mysql: "mysql://utilisateur:motdepasse@hote:3306/base",
  mssql: "Server=hote,1433;Database=base;User Id=utilisateur;Password=motdepasse;Encrypt=true",
  mongodb: "mongodb+srv://utilisateur:motdepasse@cluster.mongodb.net/base",
  redis: "rediss://default:motdepasse@hote:6379",
};

type Status = { kind: "idle" | "loading" | "ok" | "error"; message?: string };

interface Props {
  initial: FormState;
  /** Identifiant de la connexion modifiée ; absent pour une création. */
  editId?: string;
  onSaved: (result: { id: string; url?: string }) => void;
  onCancel: () => void;
}

export default function ConnectionForm({ initial, editId, onSaved, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(initial);
  const [test, setTest] = useState<Status>({ kind: "idle" });
  const [save, setSave] = useState<Status>({ kind: "idle" });
  const editing = Boolean(editId);
  const keep = editing ? "(inchangé si vide)" : "";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setTest({ kind: "idle" });
  };

  const connection = useMemo(() => {
    const base = { type: form.type, name: form.name, ssl: form.ssl, readOnly: form.readOnly, maxRows: form.maxRows };
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

  async function onTest() {
    setTest({ kind: "loading", message: "Connexion en cours…" });
    const res = await api<{ version: string }>("/api/connections/test", "POST", { connection, id: editId });
    setTest(res.ok ? { kind: "ok", message: `Connexion réussie — ${res.version}` } : { kind: "error", message: res.error });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSave({ kind: "loading" });
    const res = editing
      ? await api(`/api/connections/${editId}`, "PUT", { connection })
      : await api<{ id: string; url: string }>("/api/connections", "POST", {
          connection,
          expiresInDays: form.expiresInDays,
        });
    if (!res.ok) return setSave({ kind: "error", message: res.error });
    setSave({ kind: "idle" });
    onSaved(editing ? { id: editId! } : (res as unknown as { id: string; url: string }));
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>{editing ? `Modifier « ${initial.name} »` : "Nouvelle connexion"}</h2>
      {editing && (
        <p className="hint">L’URL MCP et les accès déjà accordés aux assistants sont conservés.</p>
      )}

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
            <span>Chaîne de connexion {keep}</span>
            <input
              type="password"
              autoComplete="off"
              value={form.connectionString}
              onChange={(e) => set("connectionString", e.target.value)}
              placeholder={editing ? "••••••••" : URI_PLACEHOLDERS[form.type]}
              required={!editing}
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
            <span>Mot de passe {keep}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder={editing ? "••••••••" : ""}
            />
          </label>
        </div>
      )}

      <h3>Options</h3>
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
        {!editing && (
          <label className="field">
            <span>Expiration de la connexion</span>
            <select value={form.expiresInDays} onChange={(e) => set("expiresInDays", e.target.value)}>
              <option value="">Jamais</option>
              <option value="1">1 jour</option>
              <option value="7">7 jours</option>
              <option value="30">30 jours</option>
              <option value="90">90 jours</option>
              <option value="365">1 an</option>
            </select>
          </label>
        )}
      </div>

      <div className="actions">
        <button type="button" className="btn ghost-lg" onClick={onCancel}>
          Annuler
        </button>
        <span className="spacer" />
        <button type="button" className="btn secondary" onClick={onTest} disabled={test.kind === "loading"}>
          {test.kind === "loading" ? "Test…" : "Tester la connexion"}
        </button>
        <button type="submit" className="btn primary" disabled={save.kind === "loading"}>
          {save.kind === "loading" ? "Enregistrement…" : editing ? "Enregistrer" : "Créer la connexion"}
        </button>
      </div>

      {test.kind !== "idle" && <p className={`status ${test.kind}`}>{test.message}</p>}
      {save.kind === "error" && <p className="status error">{save.message}</p>}
    </form>
  );
}
