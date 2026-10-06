import type { Metadata } from "next";
import { MIN_PASSWORD_LENGTH, readInvite } from "@/lib/users";
import InvitationForm from "./InvitationForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choisir un mot de passe", robots: { index: false } };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await readInvite(token).catch(() => null);

  return (
    <main className="page narrow">
      <section className="card">
        {user ? (
          <InvitationForm
            token={token}
            email={user.email}
            name={user.name}
            reset={user.status === "active"}
            minLength={MIN_PASSWORD_LENGTH}
          />
        ) : (
          <>
            <h1>Lien invalide</h1>
            <p className="status error">
              Ce lien est invalide, expiré ou a déjà été utilisé. Demandez un nouveau lien à l’administrateur.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
