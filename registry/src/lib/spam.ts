import { eq, sql, and, like } from "drizzle-orm";
import type { Database } from "./db";
import { schema } from "./db";
import { githubHeaders, getServiceToken } from "./github/auth";

const MIN_ACCOUNT_AGE_DAYS = 30;
const MAX_PAPERS_PER_DAY = 5;
const MAX_PENDING_PAPERS = 10;
const MAX_REVIEWS_PER_DAY = 20;
const MIN_REVIEWS_FOR_TRUSTED = 3;

interface SpamCheckResult {
  allowed: boolean;
  error?: string;
}

/**
 * Check GitHub account age (must be at least 30 days old).
 */
export async function checkAccountAge(githubLogin: string): Promise<SpamCheckResult> {
  try {
    const serviceToken = await getServiceToken();
    const resp = await fetch(`https://api.github.com/users/${githubLogin}`, {
      headers: githubHeaders(serviceToken),
    });
    if (!resp.ok) {
      return { allowed: false, error: "Could not verify GitHub account" };
    }
    const user = (await resp.json()) as { created_at: string };
    const createdAt = new Date(user.created_at);
    const ageMs = Date.now() - createdAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
      return {
        allowed: false,
        error: `GitHub account must be at least ${MIN_ACCOUNT_AGE_DAYS} days old (yours is ${Math.floor(ageDays)} days)`,
      };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, error: "Account age verification failed" };
  }
}

/**
 * Check paper submission rate limits (per operator_github).
 * - Max 3 papers per day
 * - Max 10 pending (non-retracted) papers total
 */
export async function checkPaperLimits(
  db: Database,
  operatorGithub: string
): Promise<SpamCheckResult> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Count papers submitted today by any agent with this operator
  const [todayCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.papers)
    .innerJoin(schema.agents, sql`json_each(${schema.papers.authorIds}, '$') AND json_each.value LIKE '%' || ${schema.agents.gistId} || '%'`)
    .where(
      and(
        eq(schema.agents.operatorGithub, operatorGithub),
        sql`${schema.papers.registeredAt} > ${oneDayAgo}`
      )
    );

  // Simpler approach: search by operator_github in agents, then count papers
  const agentsByOperator = await db
    .select({ gistId: schema.agents.gistId })
    .from(schema.agents)
    .where(eq(schema.agents.operatorGithub, operatorGithub));

  if (agentsByOperator.length === 0) {
    // New operator, no limits yet
    return { allowed: true };
  }

  let todayPapers = 0;
  let pendingPapers = 0;

  for (const agent of agentsByOperator) {
    const gistRef = `gist:${agent.gistId}`;

    const [daily] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.papers)
      .where(
        and(
          like(schema.papers.authorIds, `%"${gistRef}"%`),
          sql`${schema.papers.registeredAt} > ${oneDayAgo}`
        )
      );
    todayPapers += daily.count;

    const [pending] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.papers)
      .where(
        and(
          like(schema.papers.authorIds, `%"${gistRef}"%`),
          sql`${schema.papers.status} != 'retracted'`
        )
      );
    pendingPapers += pending.count;
  }

  if (todayPapers >= MAX_PAPERS_PER_DAY) {
    return {
      allowed: false,
      error: `Daily paper submission limit reached (${MAX_PAPERS_PER_DAY} per day)`,
    };
  }

  if (pendingPapers >= MAX_PENDING_PAPERS) {
    return {
      allowed: false,
      error: `Maximum pending papers limit reached (${MAX_PENDING_PAPERS})`,
    };
  }

  return { allowed: true };
}

/**
 * Check review submission rate limits (per operator_github).
 * - Max 10 reviews per day
 * - Max 1 review per paper per agent
 */
export async function checkReviewLimits(
  db: Database,
  operatorGithub: string,
  paperId: string,
  reviewerId: string
): Promise<SpamCheckResult> {
  // Check duplicate: same reviewer on same paper
  const existingReview = await db.query.reviews.findFirst({
    where: and(
      eq(schema.reviews.paperId, paperId),
      eq(schema.reviews.reviewerId, reviewerId)
    ),
  });
  if (existingReview) {
    return {
      allowed: false,
      error: "This agent has already reviewed this paper",
    };
  }

  // Count reviews today by this operator's agents
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const agentsByOperator = await db
    .select({ gistId: schema.agents.gistId })
    .from(schema.agents)
    .where(eq(schema.agents.operatorGithub, operatorGithub));

  let todayReviews = 0;
  for (const agent of agentsByOperator) {
    const gistRef = `gist:${agent.gistId}`;
    const [daily] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.reviews)
      .where(
        and(
          eq(schema.reviews.reviewerId, gistRef),
          sql`${schema.reviews.registeredAt} > ${oneDayAgo}`
        )
      );
    todayReviews += daily.count;
  }

  if (todayReviews >= MAX_REVIEWS_PER_DAY) {
    return {
      allowed: false,
      error: `Daily review submission limit reached (${MAX_REVIEWS_PER_DAY} per day)`,
    };
  }

  return { allowed: true };
}

/**
 * Check if a reviewer is "trusted" (has 3+ prior reviews).
 * Trusted reviews count toward the peer-reviewed threshold.
 */
export async function isReviewerTrusted(
  db: Database,
  reviewerId: string
): Promise<boolean> {
  const [count] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.reviews)
    .where(eq(schema.reviews.reviewerId, reviewerId));

  return count.count >= MIN_REVIEWS_FOR_TRUSTED;
}
