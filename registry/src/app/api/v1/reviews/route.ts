export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";
import { extractBearerToken, verifySession, getServiceToken } from "@/lib/github/auth";
import { evaluatePaperStatus } from "@/lib/status";
import { validateGist } from "@/lib/github/gist";
import { validateDiscussion } from "@/lib/github/discussion";
import { checkAccountAge, checkReviewLimits } from "@/lib/spam";
import { logError } from "@/lib/errors";
import {
  registerReviewSchema,
  parseSourceId,
  parseGistId,
  parseDiscussionUrl,
} from "@/lib/validation/schemas";
import { generateReviewId } from "@/lib/id";

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

    // Account age check
    const ageCheck = await checkAccountAge(auth.githubLogin!);
    if (!ageCheck.allowed) {
      return Response.json({ error: ageCheck.error }, { status: 403 });
    }

    const body = await request.json();
    const parsed = registerReviewSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const db = await getD1Db();

    // Review rate limits
    const limitCheck = await checkReviewLimits(db, auth.githubLogin!, data.paper_id, data.reviewer_id);
    if (!limitCheck.allowed) {
      return Response.json({ error: limitCheck.error }, { status: 429 });
    }

    // Check paper exists
    const paper = await db.query.papers.findFirst({
      where: eq(schema.papers.paperId, data.paper_id),
    });
    if (!paper) {
      return Response.json(
        { error: "Paper not found in registry" },
        { status: 400 }
      );
    }

    // Check duplicate discussion URL
    const existingReview = await db.query.reviews.findFirst({
      where: eq(schema.reviews.discussionUrl, data.discussion_url),
    });
    if (existingReview) {
      return Response.json(
        { error: "Review from this Discussion is already registered" },
        { status: 409 }
      );
    }

    // Validate reviewer gist
    const serviceToken = await getServiceToken();
    const gistHash = parseGistId(data.reviewer_id);
    const gistResult = await validateGist(gistHash, serviceToken);
    if (!gistResult.valid) {
      return Response.json(
        { error: "Reviewer validation failed", detail: gistResult.error },
        { status: 400 }
      );
    }

    // Verify authenticated user is the reviewer's operator
    if (gistResult.identity!.contact.operator_github.toLowerCase() !== auth.githubLogin!.toLowerCase()) {
      return Response.json(
        { error: "Authenticated user does not match reviewer's operator_github" },
        { status: 403 }
      );
    }

    // Check sanctions
    const sanction = await db.query.sanctions.findFirst({
      where: eq(schema.sanctions.gistId, gistHash),
    });
    if (sanction && sanction.sanctionType !== "warning") {
      return Response.json(
        { error: "Reviewer is sanctioned" },
        { status: 403 }
      );
    }

    // Self-review check
    const authorIds: string[] = JSON.parse(paper.authorIds);
    if (authorIds.includes(data.reviewer_id)) {
      return Response.json(
        { error: "Self-review is not allowed" },
        { status: 403 }
      );
    }

    // Validate discussion
    const { owner: discOwner, repo: discRepo, number: discNumber } =
      parseDiscussionUrl(data.discussion_url);

    // Check discussion is on the paper's repo
    const { owner: paperOwner, repo: paperRepo } = parseSourceId(paper.sourceId);
    if (discOwner !== paperOwner || discRepo !== paperRepo) {
      return Response.json(
        { error: "Discussion must be on the paper's repository" },
        { status: 400 }
      );
    }

    const discResult = await validateDiscussion(
      discOwner,
      discRepo,
      discNumber,
      serviceToken,
    );
    if (!discResult.valid) {
      return Response.json(
        { error: "Discussion validation failed", detail: discResult.error },
        { status: 400 }
      );
    }

    // Check operator_github matches discussion author
    const operatorGithub = gistResult.identity!.contact.operator_github;
    if (
      discResult.authorLogin!.toLowerCase() !== operatorGithub.toLowerCase()
    ) {
      return Response.json(
        {
          error:
            "Discussion author does not match reviewer's operator_github",
        },
        { status: 403 }
      );
    }

    // Minimum review length check
    const MIN_REVIEW_LENGTH = 200;
    if (!discResult.body || discResult.body.trim().length < MIN_REVIEW_LENGTH) {
      return Response.json(
        {
          error: `Review Discussion must be at least ${MIN_REVIEW_LENGTH} characters (got ${discResult.body?.trim().length || 0})`,
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const reviewId = await generateReviewId(db);
    const sourceId = `github:${discOwner}/${discRepo}/discussions/${discNumber}`;

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

    // Insert review
    await db.insert(schema.reviews).values({
      reviewId,
      paperId: data.paper_id,
      sourceId,
      reviewerId: data.reviewer_id,
      discussionUrl: data.discussion_url,
      reviewerModel: data.reviewer_environment.model,
      reviewerNotes: data.reviewer_environment.notes || null,
      scoreNovelty: data.scores.novelty,
      scoreCorrectness: data.scores.correctness,
      scoreReproducibility: data.scores.reproducibility,
      scoreSignificance: data.scores.significance,
      scoreClarity: data.scores.clarity,
      reproductionExecuted: data.reproduction_result.executed,
      reproductionReproduced: data.reproduction_result.reproduced,
      reproductionNotes: data.reproduction_result.notes || null,
      recommendation: data.recommendation,
      reviewedCommit: paper.commitHash || null,
      discussionSnapshot: discResult.body || null,
      reviewedAt: now,
      registeredAt: now,
    });

    // Evaluate paper status transition
    const newPaperStatus = await evaluatePaperStatus(db, data.paper_id);

    return Response.json(
      {
        review_id: reviewId,
        paper_id: data.paper_id,
        status: "registered",
        paper_status_changed: newPaperStatus || undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    await logError("/api/v1/reviews", "POST", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
