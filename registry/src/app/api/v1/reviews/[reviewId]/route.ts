export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getD1Db } from "@/lib/db/d1";
import { schema } from "@/lib/db";
import { updateReviewSchema } from "@/lib/validation/schemas";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  try {
    const { reviewId } = await params;
    const decodedReviewId = decodeURIComponent(reviewId);

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
      where: eq(schema.reviews.reviewId, decodedReviewId),
    });
    if (!existing) {
      return Response.json({ error: "Review not found" }, { status: 404 });
    }

    // TODO: verify OAuth user matches reviewer's operator_github

    const now = new Date().toISOString();
    const data = parsed.data;

    // Record history
    await db.insert(schema.reviewHistory).values({
      reviewId: decodedReviewId,
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
      .where(eq(schema.reviews.reviewId, decodedReviewId));

    return Response.json({
      review_id: decodedReviewId,
      status: "updated",
      updated_at: now,
    });
  } catch (error) {
    console.error("Review update error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
