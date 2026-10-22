CREATE TABLE `p2p_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`version` integer NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`request_id` text,
	`timestamp` text NOT NULL,
	`payload_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `p2p_audit_workspace_version` ON `p2p_audit` (`workspace_id`,`version`);--> statement-breakpoint
CREATE INDEX `p2p_audit_workspace_request` ON `p2p_audit` (`workspace_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `p2p_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`state_json` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	`last_mutation_id` text DEFAULT '' NOT NULL
);
