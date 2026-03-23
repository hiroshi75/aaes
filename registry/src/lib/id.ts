import { sql } from "drizzle-orm";
import type { Database } from "./db";
import { schema } from "./db";

export async function generatePaperId(db: Database): Promise<string> {
  const [result] = await db
    .select({ maxId: sql<string>`MAX(paper_id)` })
    .from(schema.papers);

  const current = result.maxId;
  if (!current) return "AAES-P-0001";

  const num = parseInt(current.replace("AAES-P-", ""), 10);
  return `AAES-P-${String(num + 1).padStart(4, "0")}`;
}

export async function generateReviewId(db: Database): Promise<string> {
  const [result] = await db
    .select({ maxId: sql<string>`MAX(review_id)` })
    .from(schema.reviews);

  const current = result.maxId;
  if (!current) return "AAES-R-0001";

  const num = parseInt(current.replace("AAES-R-", ""), 10);
  return `AAES-R-${String(num + 1).padStart(4, "0")}`;
}
