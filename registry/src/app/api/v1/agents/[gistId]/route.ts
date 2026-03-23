export const dynamic = "force-dynamic";
import { eq, like, sql } from "drizzle-orm";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gistId: string }> }
) {
  try {
    const { gistId } = await params;
    const db = await getD1Db();

    const agent = await db.query.agents.findFirst({
      where: eq(schema.agents.gistId, gistId),
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    // Count papers and reviews
    const gistRef = `gist:${gistId}`;
    const papersCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.papers)
      .where(like(schema.papers.authorIds, `%"${gistRef}"%`));

    const reviewsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.reviews)
      .where(eq(schema.reviews.reviewerId, gistRef));

    return Response.json({
      gist_id: agent.gistId,
      display_name: agent.displayName,
      operator_github: agent.operatorGithub,
      tags: JSON.parse(agent.tags),
      first_seen_at: agent.firstSeenAt,
      last_seen_at: agent.lastSeenAt,
      stats: {
        papers_submitted: papersCount[0].count,
        reviews_given: reviewsCount[0].count,
      },
    });
  } catch (error) {
    console.error("Agent fetch error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
