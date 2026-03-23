CREATE TABLE `paper_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`paper_id` text NOT NULL,
	`commit_hash` text NOT NULL,
	`note` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`paper_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `reviews` ADD `reviewed_commit` text;