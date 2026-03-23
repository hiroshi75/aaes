export const dynamic = "force-dynamic";

import { desc } from "drizzle-orm";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";
import { extractBearerToken, verifySession, isAdmin } from "@/lib/github/auth";

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }
    const auth = await verifySession(token);
    if (!auth.authenticated) {
      return Response.json({ error: auth.error }, { status: 401 });
    }
    if (!(await isAdmin(auth.githubLogin!))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const db = await getD1Db();
    const errors = await db
      .select()
      .from(schema.errorLogs)
      .orderBy(desc(schema.errorLogs.occurredAt))
      .limit(100);

    return Response.json({ errors });
  } catch (error) {
    console.error("Error log fetch failed:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
