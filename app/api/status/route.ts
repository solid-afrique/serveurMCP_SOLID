import { adminRequired } from "@/lib/admin";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    adminRequired: adminRequired(),
    encryptionConfigured: (process.env.ENCRYPTION_KEY?.length ?? 0) >= 16,
  });
}
