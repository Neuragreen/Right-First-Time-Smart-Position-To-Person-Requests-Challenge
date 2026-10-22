import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Only synthetic demo records belong in this database. Authenticated user IDs
// isolate private demo workspaces; email addresses are not stored here.
export const p2pWorkspaces = sqliteTable("p2p_workspaces", {
  id: text("id").primaryKey(),
  stateJson: text("state_json").notNull(),
  version: integer("version").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
  lastMutationId: text("last_mutation_id").notNull().default(""),
});

// Application code only inserts journal rows. A reset starts a fresh synthetic
// state while preserving prior journal entries and monotonically increasing versions.
export const p2pAudit = sqliteTable("p2p_audit", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  version: integer("version").notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  requestId: text("request_id"),
  timestamp: text("timestamp").notNull(),
  payloadJson: text("payload_json").notNull(),
}, table => [
  uniqueIndex("p2p_audit_workspace_version").on(table.workspaceId, table.version),
  index("p2p_audit_workspace_request").on(table.workspaceId, table.requestId),
]);
