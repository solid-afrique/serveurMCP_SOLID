import { errorResponse, requireSession } from "@/lib/auth";
import { baseUrl } from "@/lib/oauth";
import { createUser, listUsers } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireSession(req, { adminOnly: true });
  if (session instanceof Response) return session;
  try {
    return Response.json({ ok: true, users: await listUsers() });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

/** Crée un compte et renvoie le lien d'invitation à transmettre à l'utilisateur. */
export async function POST(req: Request) {
  const session = await requireSession(req, { adminOnly: true });
  if (session instanceof Response) return session;
  try {
    const { email, name } = await req.json();
    const { user, inviteToken } = await createUser({ email, name });
    return Response.json({ ok: true, user: { id: user.id, email: user.email }, inviteUrl: `${baseUrl(req)}/invitation/${inviteToken}` });
  } catch (error) {
    return errorResponse(error);
  }
}
