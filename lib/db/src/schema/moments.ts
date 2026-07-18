import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const momentTypeEnum = pgEnum("moment_type", [
  "hook",
  "punchline",
  "emotion",
  "debate",
  "education",
  "surprise",
  "laugh",
  "highlight",
]);

export const viralMomentsTable = pgTable("viral_moments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  startTime: real("start_time").notNull(),
  endTime: real("end_time").notNull(),
  duration: real("duration").notNull(),
  viralScore: real("viral_score").notNull(),
  engagementScore: real("engagement_score"),
  retentionScore: real("retention_score"),
  confidenceScore: real("confidence_score"),
  momentType: momentTypeEnum("moment_type"),
  transcript: text("transcript"),
  selectionReason: text("selection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertViralMomentSchema = createInsertSchema(
  viralMomentsTable,
).omit({ id: true, createdAt: true });
export type InsertViralMoment = z.infer<typeof insertViralMomentSchema>;
export type ViralMoment = typeof viralMomentsTable.$inferSelect;
