import type { Metadata } from "next";
import { DB_LABELS } from "@/lib/config";
import { getConnection, isExpired } from "@/lib/connections";
import { OAuthError, validateAuthorize, type AuthorizeParams } from "@/lib/oauth";
import ConsentForm from "./ConsentForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Autoriser l’accès", robots: { index: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const KEYS: (keyof AuthorizeParams)[] = [
  "response_type",
  "client_id",
  "redirect_uri",
  "state",
  "code_challenge",
  "code_challenge_method",
  "resource",
  "scope",
];

function describeRedirect(uri: string): string {
  const url = new URL(uri);
  return url.protocol === "http:" || url.protocol === "https:" ? url.host : `${url.protocol}//`;
}

export default async function AuthorizePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const params = Object.fromEntries(
    KEYS.map((k) => [k, typeof sp[k] === "string" ? (sp[k] as string) : null]),
  ) as unknown as AuthorizeParams;

  let content: React.ReactNode;
  try {
    const { client, redirectUri, connId } = await validateAuthorize(params);
    const conn = connId ? await getConnection(connId) : null;
    if (connId && (!conn || isExpired(conn))) {
      throw new OAuthError("invalid_target", "Cette connexion n’existe plus ou a expiré. Générez une nouvelle URL MCP.");
    }
    content = (
      <ConsentForm
        params={{ ...params, redirect_uri: redirectUri }}
        clientName={client.client_name}
        redirectHost={describeRedirect(redirectUri)}
        connection={conn ? { name: conn.name, type: DB_LABELS[conn.type], readOnly: conn.readOnly } : null}
      />
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    content = (
      <>
        <h1>Autorisation impossible</h1>
        <p className="status error">{message}</p>
      </>
    );
  }

  return (
    <main className="page narrow">
      <section className="card">{content}</section>
    </main>
  );
}
