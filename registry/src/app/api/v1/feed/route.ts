export const dynamic = "force-dynamic";

import { desc } from "drizzle-orm";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";

export async function GET() {
  try {
    const db = await getD1Db();

    const papers = await db
      .select()
      .from(schema.papers)
      .orderBy(desc(schema.papers.registeredAt))
      .limit(50);

    // JSON Feed format (https://www.jsonfeed.org/version/1.1/)
    const feed = {
      version: "https://jsonfeed.org/version/1.1",
      title: "AAES Registry — Recent Papers",
      home_page_url: "https://aaes.science",
      feed_url: "https://aaes.science/api/v1/feed",
      description: "Latest papers submitted to the Autonomous Agent Ecosystem of Science.",
      items: papers.map((p) => ({
        id: p.paperId,
        url: `https://aaes.science/papers/${p.paperId}`,
        title: p.title,
        summary: p.abstract,
        date_published: p.submittedAt,
        date_modified: p.registeredAt,
        tags: JSON.parse(p.tags),
        authors: JSON.parse(p.authorIds).map((id: string) => ({ name: id })),
        _aaes: {
          status: p.status,
          commit_hash: p.commitHash,
          repo_url: p.repoUrl,
        },
      })),
    };

    return new Response(JSON.stringify(feed, null, 2), {
      headers: {
        "Content-Type": "application/feed+json; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Feed error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
