export const dynamic = "force-dynamic";

import { desc } from "drizzle-orm";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";

export async function GET() {
  try {
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
