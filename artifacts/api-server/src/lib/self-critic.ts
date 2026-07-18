/**
 * Self-Critic — AI Brain Phase 1
 *
 * Setelah pipeline menghasilkan clip, Self-Critic mengevaluasi hasilnya sendiri:
 *   1. Cut Boundary Check  — apakah clip dipotong di tengah kalimat?
 *   2. Silence Detection   — apakah ada silence lebih dari 0.5s di awal/akhir clip?
 *
 * Koreksi disimpan ke brain_patterns dan dipakai untuk meningkatkan akurasi
 * DeepSeek prompt di video berikutnya (adaptive prompting).
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { db, brainPatternsTable, brainConfigTable, trainingRunsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const execFileAsync = promisify(execFile);

// ── Types ────────────────────────────────────────────────────────────────────

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface CorrectionLog {
  type: "cut_boundary_start" | "cut_boundary_end" | "silence_start" | "silence_end";
  original: number;
  corrected: number;
  delta: number;
  reason: string;
}

export interface BoundaryResult {
  correctedStart: number;
  correctedEnd: number;
  corrections: CorrectionLog[];
}

export interface SilenceResult {
  trimStart: number;  // detik yang dipotong dari awal (tambahkan ke start)
  trimEnd: number;    // detik yang dipotong dari akhir (kurangkan dari end)
  corrections: CorrectionLog[];
}

// ── Tuning constants ─────────────────────────────────────────────────────────

const MIN_SHIFT   = 0.15;  // jangan koreksi kalau pergeseran < 0.15s (tak berarti)
const MAX_SHIFT   = 3.0;   // jangan koreksi lebih dari 3s (akan mengubah konten terlalu banyak)
const SILENCE_DB  = -40;   // dB — di bawah ini dianggap silence
const SILENCE_DUR = 0.5;   // detik — silence lebih pendek dari ini diabaikan

// ── 1. Cut Boundary Check ────────────────────────────────────────────────────

/**
 * Cek apakah clip.start atau clip.end jatuh di tengah kalimat.
 * Jika ya, geser ke batas kalimat terdekat dari transkrip.
 *
 * Strategi:
 *  - Start mid-sentence → geser mundur ke awal kalimat tsb.
 *    (lebih baik include lebih banyak dari depan daripada mulai di tengah)
 *  - End mid-sentence → geser maju ke akhir kalimat tsb.
 *    (lebih baik include full kalimat terakhir daripada potong di tengah)
 */
export function checkCutBoundaries(
  start: number,
  end: number,
  segments: Segment[],
): BoundaryResult {
  const corrections: CorrectionLog[] = [];
  let correctedStart = start;
  let correctedEnd = end;

  if (segments.length === 0) return { correctedStart, correctedEnd, corrections };

  // Cek apakah start jatuh di tengah segment
  const startSeg = segments.find(s => s.start < start && s.end > start);
  if (startSeg) {
    const backward = start - startSeg.start; // jarak ke awal segment
    const forward  = startSeg.end - start;   // jarak ke akhir segment

    // Pilih pergerakan: mundur ke awal kalimat (preferred), atau maju ke akhir
    let target: number;
    if (backward <= MAX_SHIFT) {
      target = startSeg.start; // mundur ke awal kalimat
    } else if (forward <= MAX_SHIFT) {
      target = startSeg.end;   // maju ke akhir kalimat (skip kalimat ini)
    } else {
      target = start; // pergeseran terlalu besar, biarkan
    }

    const delta = target - start;
    if (Math.abs(delta) >= MIN_SHIFT) {
      corrections.push({
        type: "cut_boundary_start",
        original: start,
        corrected: target,
        delta,
        reason: `Start di tengah kalimat "${startSeg.text.slice(0, 50)}..." → geser ${delta > 0 ? "maju" : "mundur"} ${Math.abs(delta).toFixed(2)}s`,
      });
      correctedStart = target;
    }
  }

  // Cek apakah end jatuh di tengah segment
  const endSeg = segments.find(s => s.start < end && s.end > end);
  if (endSeg) {
    const toEndOfSeg = endSeg.end - end;      // jarak ke akhir kalimat
    const toStartOfSeg = end - endSeg.start;  // jarak ke awal kalimat

    // Pilih: maju ke akhir kalimat (preferred), atau mundur ke sebelum kalimat ini
    let target: number;
    if (toEndOfSeg <= MAX_SHIFT) {
      target = endSeg.end;    // maju ke akhir kalimat (include full kalimat)
    } else if (toStartOfSeg <= MAX_SHIFT) {
      target = endSeg.start;  // mundur ke sebelum kalimat (skip kalimat ini)
    } else {
      target = end;
    }

    const delta = target - end;
    if (Math.abs(delta) >= MIN_SHIFT) {
      corrections.push({
        type: "cut_boundary_end",
        original: end,
        corrected: target,
        delta,
        reason: `End di tengah kalimat "${endSeg.text.slice(0, 50)}..." → geser ${delta > 0 ? "maju" : "mundur"} ${Math.abs(delta).toFixed(2)}s`,
      });
      correctedEnd = target;
    }
  }

  // Pastikan clip tidak jadi terlalu pendek setelah koreksi
  if (correctedEnd - correctedStart < 5) {
    return { correctedStart: start, correctedEnd: end, corrections: [] };
  }

  return { correctedStart, correctedEnd, corrections };
}

// ── 2. Silence Detection ─────────────────────────────────────────────────────

/**
 * Deteksi silence di awal/akhir clip SEBELUM extraction (pada source video).
 * Menganalisis bagian source yang akan dijadikan clip, lalu mengembalikan
 * berapa detik perlu ditrim dari start dan end.
 */
export async function detectSilenceBounds(
  videoPath: string,
  clipStart: number,
  clipEnd: number,
): Promise<SilenceResult> {
  const duration = clipEnd - clipStart;
  const corrections: CorrectionLog[] = [];

  if (duration < 8) return { trimStart: 0, trimEnd: 0, corrections };

  let silenceLog = "";
  try {
    // Analisis bagian source yang akan dijadikan clip
    const result = await execFileAsync("ffmpeg", [
      "-ss", String(clipStart),
      "-i", videoPath,
      "-t", String(duration),
      "-af", `silencedetect=noise=${SILENCE_DB}dB:d=${SILENCE_DUR}`,
      "-f", "null", "-",
    ], { timeout: 30_000 });
    // ffmpeg output ke stderr
    silenceLog = (result as any).stderr ?? "";
  } catch (e: any) {
    silenceLog = e?.stderr ?? "";
  }

  if (!silenceLog) return { trimStart: 0, trimEnd: 0, corrections };

  // Parse silence events. Timestamps relatif terhadap clipStart (karena kita pakai -ss + -t)
  const silenceStarts = [...silenceLog.matchAll(/silence_start:\s*([\d.]+)/g)]
    .map(m => parseFloat(m[1]));
  const silenceEnds = [...silenceLog.matchAll(/silence_end:\s*([\d.]+)/g)]
    .map(m => parseFloat(m[1]));

  let trimStart = 0;
  let trimEnd = 0;
  const MAX_TRIM_RATIO = 0.15; // jangan trim lebih dari 15% dari durasi clip

  // Leading silence: silence pertama dimulai di detik 0 (atau sangat dekat)
  if (silenceStarts.length > 0 && silenceStarts[0] < 0.2 && silenceEnds.length > 0) {
    const leadEnd = silenceEnds[0];
    if (leadEnd > SILENCE_DUR && leadEnd < duration * MAX_TRIM_RATIO) {
      trimStart = leadEnd;
      corrections.push({
        type: "silence_start",
        original: clipStart,
        corrected: clipStart + leadEnd,
        delta: leadEnd,
        reason: `Trim ${leadEnd.toFixed(2)}s silence di awal clip`,
      });
    }
  }

  // Trailing silence: silence terakhir berakhir mendekati akhir clip
  if (silenceStarts.length > 0) {
    const lastStart = silenceStarts[silenceStarts.length - 1];
    const silenceLength = duration - lastStart;
    if (silenceLength > SILENCE_DUR && silenceLength < duration * MAX_TRIM_RATIO) {
      trimEnd = silenceLength;
      corrections.push({
        type: "silence_end",
        original: clipEnd,
        corrected: clipEnd - trimEnd,
        delta: -trimEnd,
        reason: `Trim ${trimEnd.toFixed(2)}s silence di akhir clip`,
      });
    }
  }

  // Guard: setelah trim, clip harus tetap >= 5 detik
  if (duration - trimStart - trimEnd < 5) {
    return { trimStart: 0, trimEnd: 0, corrections: [] };
  }

  return { trimStart, trimEnd, corrections };
}

// ── 3. Brain Storage ─────────────────────────────────────────────────────────

/** Simpan koreksi dari Self-Critic ke brain_patterns. */
export async function saveBrainPatterns(
  projectId: number,
  clipId: number | null,
  corrections: CorrectionLog[],
  category: string,
  language: string,
): Promise<void> {
  if (corrections.length === 0) return;
  try {
    await db.insert(brainPatternsTable).values(
      corrections.map(c => ({
        projectId,
        clipId,
        featureType: c.type,
        originalValue: c.original,
        correctedValue: c.corrected,
        delta: c.delta,
        category,
        language,
        notes: c.reason,
      })),
    );
  } catch (e) {
    console.error("[brain] Gagal simpan patterns:", e);
  }
}

/** Perbarui konfigurasi otak setelah setiap run (durasi rata-rata per kategori, total stats). */
export async function updateBrainConfig(
  category: string,
  clipsAnalyzed: number,
  correctionsApplied: number,
  avgDuration: number,
): Promise<void> {
  try {
    // Preferensi durasi per kategori
    const durationKey = `preferred_duration_${category}`;
    const existing = await db
      .select()
      .from(brainConfigTable)
      .where(eq(brainConfigTable.key, durationKey));

    if (existing.length > 0) {
      const prev = JSON.parse(existing[0].value) as { avg: number; count: number };
      const newCount = prev.count + clipsAnalyzed;
      const newAvg = (prev.avg * prev.count + avgDuration * clipsAnalyzed) / newCount;
      await db
        .update(brainConfigTable)
        .set({ value: JSON.stringify({ avg: Math.round(newAvg * 10) / 10, count: newCount }), updatedAt: new Date() })
        .where(eq(brainConfigTable.key, durationKey));
    } else {
      await db.insert(brainConfigTable)
        .values({ key: durationKey, value: JSON.stringify({ avg: avgDuration, count: clipsAnalyzed }) })
        .onConflictDoNothing();
    }

    // Global stats
    const statsKey = "global_stats";
    const statsExisting = await db
      .select()
      .from(brainConfigTable)
      .where(eq(brainConfigTable.key, statsKey));

    if (statsExisting.length > 0) {
      const prev = JSON.parse(statsExisting[0].value) as {
        totalClips: number;
        totalCorrections: number;
        totalRuns: number;
      };
      await db
        .update(brainConfigTable)
        .set({
          value: JSON.stringify({
            totalClips: prev.totalClips + clipsAnalyzed,
            totalCorrections: prev.totalCorrections + correctionsApplied,
            totalRuns: prev.totalRuns + 1,
          }),
          updatedAt: new Date(),
        })
        .where(eq(brainConfigTable.key, statsKey));
    } else {
      await db.insert(brainConfigTable)
        .values({
          key: statsKey,
          value: JSON.stringify({
            totalClips: clipsAnalyzed,
            totalCorrections: correctionsApplied,
            totalRuns: 1,
          }),
        })
        .onConflictDoNothing();
    }
  } catch (e) {
    console.error("[brain] Gagal update brain_config:", e);
  }
}

/** Log satu sesi training ke training_runs. */
export async function logTrainingRun(
  projectId: number,
  clipsAnalyzed: number,
  correctionsApplied: number,
  messages: string[],
  durationMs: number,
): Promise<void> {
  try {
    await db.insert(trainingRunsTable).values({
      projectId,
      clipsAnalyzed,
      correctionsApplied,
      summary: JSON.stringify(messages),
      durationMs,
    });
  } catch (e) {
    console.error("[brain] Gagal log training run:", e);
  }
}

// ── 4. Adaptive Prompting ────────────────────────────────────────────────────

/**
 * Muat konteks otak untuk di-inject ke prompt DeepSeek.
 * Makin banyak video diproses → konteks makin kaya → hasil makin akurat.
 */
export async function getBrainContext(category: string): Promise<string> {
  try {
    const configs = await db.select().from(brainConfigTable);
    const cfg = Object.fromEntries(
      configs.map(c => [c.key, JSON.parse(c.value)]),
    ) as Record<string, any>;

    const lines: string[] = [];

    // Durasi optimal per kategori (perlu minimal 3 clip agar signifikan)
    const durKey = `preferred_duration_${category}`;
    if (cfg[durKey] && cfg[durKey].count >= 3) {
      lines.push(`- Durasi optimal untuk kategori "${category}": ${Math.round(cfg[durKey].avg)} detik (berdasarkan ${cfg[durKey].count} video sebelumnya)`);
    }

    // Stats global
    const g = cfg["global_stats"];
    if (g && g.totalClips >= 10) {
      lines.push(`- AI sudah menganalisis ${g.totalClips} klip dan melakukan ${g.totalCorrections} koreksi otomatis — kepercayaan tinggi`);
    }

    if (lines.length === 0) return "";

    return [
      "",
      "KONTEKS DARI AI BRAIN (pelajaran dari video-video sebelumnya):",
      ...lines,
      "Gunakan konteks ini untuk membuat keputusan yang lebih akurat.",
      "",
    ].join("\n");
  } catch {
    return "";
  }
}
