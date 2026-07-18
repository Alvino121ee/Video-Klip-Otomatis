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

export const projectStatusEnum = pgEnum("project_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const projectCategoryEnum = pgEnum("project_category", [
  "podcast",
  "gaming",
  "tutorial",
  "education",
  "review",
  "interview",
  "news",
  "streaming",
  "vlog",
  "comedy",
  "sports",
]);

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  videoUrl: text("video_url"),
  videoSource: text("video_source"),
  thumbnailUrl: text("thumbnail_url"),
  duration: real("duration"),
  status: projectStatusEnum("status").notNull().default("pending"),
  category: projectCategoryEnum("category"),
  language: text("language"),
  clipCount: integer("clip_count").notNull().default(0),
  momentCount: integer("moment_count").notNull().default(0),
  processingProgress: real("processing_progress"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  clipCount: true,
  momentCount: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
