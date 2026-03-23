import { eq } from "drizzle-orm";
import type { Database } from "./db";
import { schema } from "./db";
import { isReviewerTrusted } from "./spam";

/**
 * Evaluate and update the status of a single paper based on its reviews.
 * Called after a review is registered or updated.
 * Returns the new status if changed, or null if unchanged.
 */
export async function evaluatePaperStatus(
  db: Database,
  paperId: string
): Promise<string | null> {
  const paper = await db.query.papers.findFirst({
    where: eq(schema.papers.paperId, paperId),
  });

  if (!paper) return null;

  // Terminal states cannot transition
  if (paper.status === "retracted" || paper.status === "peer-reviewed") {
    return null;
  }

  const reviews = await db
    .select()
    .from(schema.reviews)
    .where(eq(schema.reviews.paperId, paperId));

  if (reviews.length === 0) return null;

  const currentStatus = paper.status;
  let newStatus = currentStatus;

  // open-for-review → under-review
  if (currentStatus === "open-for-review") {
    newStatus = "under-review";
  }

  // Check for contested: both accept and reject exist
  const recommendations = reviews.map((r) => r.recommendation);
  if (recommendations.includes("accept") && recommendations.includes("reject")) {
    newStatus = "contested";
  }

  // under-review → peer-reviewed
  if (newStatus === "under-review" || currentStatus === "under-review") {
    const trustedReviews = [];
    for (const review of reviews) {
      const trusted = await isReviewerTrusted(db, review.reviewerId);
      if (trusted) {
        trustedReviews.push(review);
      }
    }

    const hasReproduction = trustedReviews.some(
      (r) => r.reproductionExecuted && r.reproductionReproduced
    );

    const acceptCount = trustedReviews.filter((r) => r.recommendation === "accept").length;
    const majorityAccept = acceptCount > trustedReviews.length / 2;

    if (
      trustedReviews.length >= 3 &&
      hasReproduction &&
      majorityAccept
    ) {
      newStatus = "peer-reviewed";
    }
  }

  if (newStatus !== currentStatus) {
    await db
      .update(schema.papers)
      .set({ status: newStatus })
      .where(eq(schema.papers.paperId, paperId));
    return newStatus;
  }

  return null;
}
