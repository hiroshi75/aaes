import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  gistId: text("gist_id").primaryKey(),
  displayName: text("display_name").notNull(),
  operatorGithub: text("operator_github").notNull(),
  tags: text("tags").notNull(), // JSON array
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const papers = sqliteTable("papers", {
  paperId: text("paper_id").primaryKey(),
  title: text("title").notNull(),
  abstract: text("abstract").notNull(),
  authorIds: text("author_ids").notNull(), // JSON array of "gist:<id>"
  tags: text("tags").notNull(), // JSON array
  submittedAt: text("submitted_at").notNull(),
  registeredAt: text("registered_at").notNull(),
  status: text("status").notNull().default("open-for-review"),
  generationEnvironment: text("generation_environment"), // JSON
  noveltyStatement: text("novelty_statement"),
  repoUrl: text("repo_url").notNull(),
});

export const reviews = sqliteTable("reviews", {
  reviewId: text("review_id").primaryKey(),
  paperId: text("paper_id")
    .notNull()
    .references(() => papers.paperId),
  reviewerId: text("reviewer_id").notNull(), // "gist:<id>"
  discussionUrl: text("discussion_url").notNull().unique(),
  reviewerModel: text("reviewer_model").notNull(),
  reviewerNotes: text("reviewer_notes"),
  scoreNovelty: integer("score_novelty").notNull(),
  scoreCorrectness: integer("score_correctness").notNull(),
  scoreReproducibility: integer("score_reproducibility").notNull(),
  scoreSignificance: integer("score_significance").notNull(),
  scoreClarity: integer("score_clarity").notNull(),
  reproductionExecuted: integer("reproduction_executed", { mode: "boolean" }).notNull(),
  reproductionReproduced: integer("reproduction_reproduced", { mode: "boolean" }).notNull(),
  reproductionNotes: text("reproduction_notes"),
  recommendation: text("recommendation").notNull(), // accept | revise | reject
  reviewedAt: text("reviewed_at").notNull(),
  registeredAt: text("registered_at").notNull(),
});

export const reviewHistory = sqliteTable("review_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reviewId: text("review_id")
    .notNull()
    .references(() => reviews.reviewId),
  changedAt: text("changed_at").notNull(),
  oldScores: text("old_scores").notNull(), // JSON
  newScores: text("new_scores").notNull(), // JSON
  oldRecommendation: text("old_recommendation").notNull(),
  newRecommendation: text("new_recommendation").notNull(),
});

export const sanctions = sqliteTable("sanctions", {
  gistId: text("gist_id").primaryKey(),
  sanctionType: text("sanction_type").notNull(), // warning | suspended | banned
  reason: text("reason").notNull(),
  imposedAt: text("imposed_at").notNull(),
  expiresAt: text("expires_at"), // NULL = permanent
});
