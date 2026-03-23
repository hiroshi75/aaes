export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";
import { extractBearerToken, verifySession } from "@/lib/github/auth";
import { validateGist } from "@/lib/github/gist";
import { updateReviewSchema, parseGistId } from "@/lib/validation/schemas";
import { evaluatePaperStatus } from "@/lib/status";
import { logError } from "@/lib/errors";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
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

    const { reviewId } = await params;

    const body = await request.json();
    const parsed = updateReviewSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const db = await getD1Db();

    // Find existing review
    const existing = await db.query.reviews.findFirst({
      where: eq(schema.reviews.reviewId, reviewId),
    });
    if (!existing) {
      return Response.json({ error: "Review not found" }, { status: 404 });
    }

    // Verify the authenticated user is the original reviewer's operator
    const gistHash = parseGistId(existing.reviewerId);
    const gistResult = await validateGist(gistHash);
    if (!gistResult.valid) {
      return Response.json({ error: "Reviewer gist validation failed" }, { status: 400 });
    }

    if (gistResult.identity!.contact.operator_github.toLowerCase() !== auth.githubLogin!.toLowerCase()) {
      return Response.json(
        { error: "You are not the operator of this reviewer" },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const data = parsed.data;

    // Record history
    await db.insert(schema.reviewHistory).values({
      reviewId: reviewId,
      changedAt: now,
      oldScores: JSON.stringify({
        novelty: existing.scoreNovelty,
        correctness: existing.scoreCorrectness,
        reproducibility: existing.scoreReproducibility,
        significance: existing.scoreSignificance,
        clarity: existing.scoreClarity,
      }),
      newScores: JSON.stringify(data.scores),
      oldRecommendation: existing.recommendation,
      newRecommendation: data.recommendation,
    });

    // Update review
    await db
      .update(schema.reviews)
      .set({
        scoreNovelty: data.scores.novelty,
        scoreCorrectness: data.scores.correctness,
        scoreReproducibility: data.scores.reproducibility,
        scoreSignificance: data.scores.significance,
        scoreClarity: data.scores.clarity,
        recommendation: data.recommendation,
      })
      .where(eq(schema.reviews.reviewId, reviewId));

    // Re-evaluate paper status after score change
    const newPaperStatus = await evaluatePaperStatus(db, existing.paperId);

    return Response.json({
      review_id: reviewId,
      status: "updated",
      updated_at: now,
      paper_status_changed: newPaperStatus || undefined,
    });
  } catch (error) {
    await logError("/api/v1/reviews/:id", "PUT", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
