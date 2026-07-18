import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
} from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";
import { clipsTable } from "./clips";

/**
 * brain_patterns — satu baris per koreksi yang dibuat oleh Self-Critic.
 * AI menyimpan setiap kesalahan yang diperbaiki agar bisa belajar dari pola.
 */
export const brainPatternsTable = pgTable("brain_patterns", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projectsTable.id, {
    onDelete: "cascade",
  }),
  clipId: integer("clip_id").references(() => clipsTable.id, {
    onDelete: "set null",
  }),
  // "cut_boundary_start" | "cut_boundary_end" | "silence_start" | "silence_end"
  featureType: text("feature_type").notNull(),
  originalValue: real("original_value"),  // waktu asli (detik)
  correctedValue: real("corrected_value"), // waktu setelah koreksi (detik)
  delta: real("delta"),                    // selisih (positif = maju, negatif = mundur)
  category: text("category"),             // kategori video (podcast, gaming, dll)
  language: text("language"),
  notes: text("notes"),                   // penjelasan koreksi dalam bahasa manusia
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * brain_config — konfigurasi/preferensi agregat yang sudah dipelajari AI.
 * Key-value store, value berupa JSON string.
 * Contoh key: "preferred_duration_podcast", "global_stats"
 */
export const brainConfigTable = pgTable("brain_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(), // JSON string
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * training_runs — log setiap sesi Self-Critic.
 * Satu baris per project yang diproses.
 */
export const trainingRunsTable = pgTable("training_runs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projectsTable.id, {
    onDelete: "cascade",
  }),
  clipsAnalyzed: integer("clips_analyzed").notNull().default(0),
  correctionsApplied: integer("corrections_applied").notNull().default(0),
  summary: text("summary"), // JSON array of human-readable correction messages
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BrainPattern = typeof brainPatternsTable.$inferSelect;
export type BrainConfig = typeof brainConfigTable.$inferSelect;
export type TrainingRun = typeof trainingRunsTable.$inferSelect;
