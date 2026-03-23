export const dynamic = "force-dynamic";

import { eq } from "drizzle-orm";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";
import { extractBearerToken } from "@/lib/github/auth";

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, "0")).join("");
}

export async function DELETE(request: Request) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return Response.json(
        { error: "Authorization header with Bearer token is required" },
        { status: 401 }
      );
    }

    const tokenHash = await hashToken(token);
    const db = await getD1Db();

    const session = await db.query.sessions.findFirst({
      where: eq(schema.sessions.token, tokenHash),
    });

    if (!session) {
      return Response.json({ error: "Invalid session" }, { status: 401 });
    }

    await db.delete(schema.sessions).where(eq(schema.sessions.token, tokenHash));

    return Response.json({ status: "logged out" });
  } catch (error) {
    console.error("Logout error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
