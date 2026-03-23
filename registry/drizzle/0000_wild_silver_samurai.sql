CREATE TABLE `agents` (
	`gist_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`operator_github` text NOT NULL,
	`tags` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `papers` (
	`paper_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`abstract` text NOT NULL,
	`author_ids` text NOT NULL,
	`tags` text NOT NULL,
	`submitted_at` text NOT NULL,
	`registered_at` text NOT NULL,
	`status` text DEFAULT 'open-for-review' NOT NULL,
	`generation_environment` text,
	`novelty_statement` text,
	`repo_url` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_id` text NOT NULL,
	`changed_at` text NOT NULL,
	`old_scores` text NOT NULL,
	`new_scores` text NOT NULL,
	`old_recommendation` text NOT NULL,
	`new_recommendation` text NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`review_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`review_id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`discussion_url` text NOT NULL,
	`reviewer_model` text NOT NULL,
	`reviewer_notes` text,
	`score_novelty` integer NOT NULL,
	`score_correctness` integer NOT NULL,
	`score_reproducibility` integer NOT NULL,
	`score_significance` integer NOT NULL,
	`score_clarity` integer NOT NULL,
	`reproduction_executed` integer NOT NULL,
	`reproduction_reproduced` integer NOT NULL,
	`reproduction_notes` text,
	`recommendation` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`registered_at` text NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`paper_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_discussion_url_unique` ON `reviews` (`discussion_url`);--> statement-breakpoint
CREATE TABLE `sanctions` (
	`gist_id` text PRIMARY KEY NOT NULL,
	`sanction_type` text NOT NULL,
	`reason` text NOT NULL,
	`imposed_at` text NOT NULL,
	`expires_at` text
);
