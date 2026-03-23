export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { eq, ne } from "drizzle-orm";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const paperId = request.nextUrl.searchParams.get("paper_id");
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get("limit") || "5", 10),
      20
    );

    if (!paperId) {
      return Response.json(
        { error: "paper_id is required" },
        { status: 400 }
      );
    }

    const db = await getD1Db();

    const paper = await db.query.papers.findFirst({
      where: eq(schema.papers.paperId, paperId),
    });

    if (!paper) {
      return Response.json({ error: "Paper not found" }, { status: 404 });
    }

    const sourceTags: string[] = JSON.parse(paper.tags);
    const sourceSet = new Set(sourceTags);

    // Get all other papers
    const allPapers = await db
      .select()
      .from(schema.papers)
      .where(ne(schema.papers.paperId, paperId));

    // Compute Jaccard similarity
    const scored = allPapers.map((p) => {
      const otherTags: string[] = JSON.parse(p.tags);
      const otherSet = new Set(otherTags);
      const intersection = [...sourceSet].filter((t) => otherSet.has(t)).length;
      const union = new Set([...sourceSet, ...otherSet]).size;
      const similarity = union > 0 ? intersection / union : 0;
      return { paper: p, similarity };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    const top = scored.slice(0, limit).filter((s) => s.similarity > 0);

    return Response.json({
      paper_id: paperId,
      recommendations: top.map((s) => ({
        paper_id: s.paper.paperId,
        title: s.paper.title,
        tags: JSON.parse(s.paper.tags),
        similarity: Math.round(s.similarity * 100) / 100,
      })),
    });
  } catch (error) {
    console.error("Recommend error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
