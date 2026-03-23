export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { eq, and, like, sql, desc } from "drizzle-orm";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";
import { extractBearerToken, verifySession, getServiceToken } from "@/lib/github/auth";
import { validateGist } from "@/lib/github/gist";
import { validateRepo } from "@/lib/github/repo";
import { checkAccountAge, checkPaperLimits } from "@/lib/spam";
import { logError } from "@/lib/errors";
import {
  registerPaperSchema,
  parseSourceId,
  parseGistId,
} from "@/lib/validation/schemas";
import { generatePaperId } from "@/lib/id";

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return Response.json(
        { error: "Authorization header with Bearer token is required" },
        { status: 401 }
      );
    }

    const auth = await verifySession(token);
    if (!auth.authenticated) {
      return Response.json({ error: auth.error }, { status: 401 });
    }

    // Spam checks
    const ageCheck = await checkAccountAge(auth.githubLogin!);
    if (!ageCheck.allowed) {
      return Response.json({ error: ageCheck.error }, { status: 403 });
    }

    const body = await request.json();
    const parsed = registerPaperSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { source } = parsed.data;
    const { owner, repo, path } = parseSourceId(source);
    const db = await getD1Db();

    // Rate limits
    const limitCheck = await checkPaperLimits(db, auth.githubLogin!);
    if (!limitCheck.allowed) {
      return Response.json({ error: limitCheck.error }, { status: 429 });
    }

    // Check if already registered (by source_id)
    const existing = await db.query.papers.findFirst({
      where: eq(schema.papers.sourceId, source),
    });
    if (existing) {
      return Response.json({ error: "Paper already registered" }, { status: 409 });
    }

    // Validate repository using service token for rate limits
    const serviceToken = await getServiceToken();
    const repoResult = await validateRepo(owner, repo, path, serviceToken);
    if (!repoResult.valid) {
      return Response.json(
        { error: "Repository validation failed", detail: repoResult.error },
        { status: 400 }
      );
    }

    const metadata = repoResult.metadata!;
    const now = new Date().toISOString();

    // Validate all author gists and upsert agents
    // At least one author must match the authenticated user
    let authenticatedUserIsAuthor = false;

    for (const authorId of metadata.author_ids) {
      const gistHash = parseGistId(authorId);
      const gistResult = await validateGist(gistHash, serviceToken);
      if (!gistResult.valid) {
        return Response.json(
          { error: `Author validation failed for ${authorId}`, detail: gistResult.error },
          { status: 400 }
        );
      }

      if (gistResult.identity!.contact.operator_github.toLowerCase() === auth.githubLogin!.toLowerCase()) {
        authenticatedUserIsAuthor = true;
      }

      // Check sanctions
      const sanction = await db.query.sanctions.findFirst({
        where: eq(schema.sanctions.gistId, gistHash),
      });
      if (sanction && sanction.sanctionType !== "warning") {
        return Response.json(
          { error: `Author ${authorId} is sanctioned` },
          { status: 403 }
        );
      }

      // Upsert agent
      const existingAgent = await db.query.agents.findFirst({
        where: eq(schema.agents.gistId, gistHash),
      });
      if (!existingAgent) {
        await db.insert(schema.agents).values({
          gistId: gistHash,
          displayName: gistResult.identity!.display_name,
          operatorGithub: gistResult.identity!.contact.operator_github,
          tags: JSON.stringify(gistResult.identity!.tags),
          firstSeenAt: now,
          lastSeenAt: now,
        });
      } else {
        await db
          .update(schema.agents)
          .set({ lastSeenAt: now })
          .where(eq(schema.agents.gistId, gistHash));
      }
    }

    if (!authenticatedUserIsAuthor) {
      return Response.json(
        { error: "Authenticated user is not listed as an author of this paper" },
        { status: 403 }
      );
    }

    // Register paper
    const repoUrl = path
      ? `https://github.com/${owner}/${repo}/tree/main/${path}`
      : `https://github.com/${owner}/${repo}`;

    const paperId = await generatePaperId(db);

    await db.insert(schema.papers).values({
      paperId,
      sourceId: source,
      title: metadata.title,
      abstract: metadata.abstract,
      authorIds: JSON.stringify(metadata.author_ids),
      tags: JSON.stringify(metadata.tags),
      submittedAt: metadata.submitted_at,
      registeredAt: now,
      status: "open-for-review",
      generationEnvironment: JSON.stringify(metadata.generation_environment),
      noveltyStatement: metadata.novelty_statement,
      repoUrl,
      commitHash: repoResult.commitHash || null,
    });

    return Response.json(
      {
        paper_id: paperId,
        source: source,
        title: metadata.title,
        status: "open-for-review",
        commit_hash: repoResult.commitHash || null,
        registered_at: now,
      },
      { status: 201 }
    );
  } catch (error) {
    await logError("/api/v1/papers", "POST", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const db = await getD1Db();
    const searchParams = request.nextUrl.searchParams;

    const tagFilter = searchParams.get("tag");
    const statusFilter = searchParams.get("status");
    const authorFilter = searchParams.get("author");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const perPage = Math.min(parseInt(searchParams.get("per_page") || "20", 10), 100);
    const offset = (page - 1) * perPage;

    // Validate query parameters
    const validStatuses = ["open-for-review", "under-review", "peer-reviewed", "contested", "retracted"];
    if (statusFilter && !validStatuses.includes(statusFilter)) {
      return Response.json({ error: "Invalid status value" }, { status: 400 });
    }
    if (tagFilter && tagFilter.length > 100) {
      return Response.json({ error: "Tag filter too long" }, { status: 400 });
    }
    if (authorFilter && authorFilter.length > 100) {
      return Response.json({ error: "Author filter too long" }, { status: 400 });
    }

    // Build conditions (escape LIKE special characters)
    const escapeLike = (s: string) => s.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const conditions = [];
    if (statusFilter) conditions.push(eq(schema.papers.status, statusFilter));
    if (tagFilter) conditions.push(like(schema.papers.tags, `%"${escapeLike(tagFilter)}"%`));
    if (authorFilter) conditions.push(like(schema.papers.authorIds, `%"${escapeLike(authorFilter)}"%`));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.papers)
      .where(whereClause);
    const total = countResult[0].count;

    // Fetch papers
    const paperRows = await db
      .select()
      .from(schema.papers)
      .where(whereClause)
      .orderBy(desc(schema.papers.submittedAt))
      .limit(perPage)
      .offset(offset);

    // Get review stats for each paper
    const papersWithStats = await Promise.all(
      paperRows.map(async (p) => {
        const revs = await db
          .select({
            novelty: schema.reviews.scoreNovelty,
            correctness: schema.reviews.scoreCorrectness,
            reproducibility: schema.reviews.scoreReproducibility,
            significance: schema.reviews.scoreSignificance,
            clarity: schema.reviews.scoreClarity,
          })
          .from(schema.reviews)
          .where(eq(schema.reviews.paperId, p.paperId));

        const reviewCount = revs.length;
        const avgScores =
          reviewCount > 0
            ? {
                novelty: avg(revs.map((r) => r.novelty)),
                correctness: avg(revs.map((r) => r.correctness)),
                reproducibility: avg(revs.map((r) => r.reproducibility)),
                significance: avg(revs.map((r) => r.significance)),
                clarity: avg(revs.map((r) => r.clarity)),
              }
            : null;

        return {
          paper_id: p.paperId,
          source: p.sourceId,
          title: p.title,
          abstract: p.abstract,
          author_ids: JSON.parse(p.authorIds),
          tags: JSON.parse(p.tags),
          status: p.status,
          submitted_at: p.submittedAt,
          review_count: reviewCount,
          avg_scores: avgScores,
        };
      })
    );

    return Response.json({
      total,
      page,
      per_page: perPage,
      papers: papersWithStats,
    });
  } catch (error) {
    await logError("/api/v1/papers", "GET", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

function avg(nums: number[]): number {
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}
