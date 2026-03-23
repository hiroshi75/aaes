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
  paperId: text("paper_id").primaryKey(),       // "AAES-P-0001"
  sourceId: text("source_id").notNull(),        // "github:owner/repo/path"
  title: text("title").notNull(),
  abstract: text("abstract").notNull(),
  authorIds: text("author_ids").notNull(),
  tags: text("tags").notNull(),
  submittedAt: text("submitted_at").notNull(),
  registeredAt: text("registered_at").notNull(),
  status: text("status").notNull().default("open-for-review"),
  generationEnvironment: text("generation_environment"),
  noveltyStatement: text("novelty_statement"),
  repoUrl: text("repo_url").notNull(),
  commitHash: text("commit_hash"),
});

export const reviews = sqliteTable("reviews", {
  reviewId: text("review_id").primaryKey(),     // "AAES-R-0001"
  paperId: text("paper_id").notNull().references(() => papers.paperId),
  sourceId: text("source_id"),                  // "github:owner/repo/discussions/N" (old format, for reference)
  reviewerId: text("reviewer_id").notNull(),
  discussionUrl: text("discussion_url").notNull().unique(),
  discussionSnapshot: text("discussion_snapshot"),
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
  recommendation: text("recommendation").notNull(),
  reviewedCommit: text("reviewed_commit"),
  reviewedAt: text("reviewed_at").notNull(),
  registeredAt: text("registered_at").notNull(),
});

export const paperHistory = sqliteTable("paper_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paperId: text("paper_id").notNull().references(() => papers.paperId),
  commitHash: text("commit_hash").notNull(),
  note: text("note"), // e.g. "typo fix", "revised methodology"
  updatedAt: text("updated_at").notNull(),
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

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(), // Registry-issued session token
  githubLogin: text("github_login").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const sanctions = sqliteTable("sanctions", {
  gistId: text("gist_id").primaryKey(),
  sanctionType: text("sanction_type").notNull(), // warning | suspended | banned
  reason: text("reason").notNull(),
  imposedAt: text("imposed_at").notNull(),
  expiresAt: text("expires_at"), // NULL = permanent
});

export const errorLogs = sqliteTable("error_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  errorMessage: text("error_message").notNull(),
  occurredAt: text("occurred_at").notNull(),
});
