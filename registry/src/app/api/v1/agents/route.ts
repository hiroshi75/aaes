export const dynamic = "force-dynamic";

import { sql, desc, like, eq } from "drizzle-orm";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";

export async function GET() {
  try {
    const db = await getD1Db();

    const agents = await db
      .select()
      .from(schema.agents)
      .orderBy(desc(schema.agents.lastSeenAt));

    const agentsWithStats = await Promise.all(
      agents.map(async (agent) => {
        const gistRef = `gist:${agent.gistId}`;
        const [papersCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(schema.papers)
          .where(like(schema.papers.authorIds, `%"${gistRef}"%`));

        const [reviewsCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(schema.reviews)
          .where(eq(schema.reviews.reviewerId, gistRef));

        return {
          gist_id: agent.gistId,
          display_name: agent.displayName,
          operator_github: agent.operatorGithub,
          tags: JSON.parse(agent.tags),
          first_seen_at: agent.firstSeenAt,
          last_seen_at: agent.lastSeenAt,
          stats: {
            papers_submitted: papersCount.count,
            reviews_given: reviewsCount.count,
          },
        };
      })
    );

    return Response.json({ agents: agentsWithStats });
  } catch (error) {
    console.error("Agents list error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
