CREATE TABLE `error_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`endpoint` text NOT NULL,
	`method` text NOT NULL,
	`error_message` text NOT NULL,
	`occurred_at` text NOT NULL
);
