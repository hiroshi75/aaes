CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`github_login` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
