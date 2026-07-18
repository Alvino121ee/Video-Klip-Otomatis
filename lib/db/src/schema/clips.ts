import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const clipStatusEnum = pgEnum("clip_status", [
  "pending",
  "rendering",
  "ready",
  "failed",
]);

export const clipFormatEnum = pgEnum("clip_format", [
  "shorts",
  "reels",
  "tiktok",
  "square",
]);

export const subtitleStyleEnum = pgEnum("subtitle_style", [
  "word_by_word",
  "karaoke",
  "highlight",
  "pop",
  "bounce",
  "glow",
  "fade",
  "zoom",
]);

export const clipsTable = pgTable("clips", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  videoUrl: text("video_url"),
  startTime: real("start_time"),
  endTime: real("end_time"),
  duration: real("duration"),
  format: clipFormatEnum("format"),
  status: clipStatusEnum("status").notNull().default("pending"),
  viralScore: real("viral_score"),
  engagementScore: real("engagement_score"),
  retentionScore: real("retention_score"),
  confidenceScore: real("confidence_score"),
  selectionReason: text("selection_reason"),
  subtitleStyle: subtitleStyleEnum("subtitle_style"),
  hasSubtitles: boolean("has_subtitles").notNull().default(false),
  isAutoReframed: boolean("is_auto_reframed").notNull().default(false),
  hookText: text("hook_text"),
  suggestedTitle: text("suggested_title"),
  suggestedHashtags: text("suggested_hashtags").array(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertClipSchema = createInsertSchema(clipsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClip = z.infer<typeof insertClipSchema>;
export type Clip = typeof clipsTable.$inferSelect;
