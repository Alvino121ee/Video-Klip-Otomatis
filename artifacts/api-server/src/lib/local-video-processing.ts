/**
 * Local video processing pipeline (untuk video yang diupload user):
 * 1. ffmpeg  → extract audio ke WAV
 * 2. faster-whisper (Python) → transkripsi
 * 3. DeepSeek → analisis momen viral
 * 4. ffmpeg  → potong klip + thumbnail
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";
import { db, projectsTable, clipsTable, viralMomentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const execFileAsync = promisify(execFile);

const WHISPER_PYTHON = process.env.WHISPER_PYTHON ?? "python3";
const TRANSCRIBE_SCRIPT = path.resolve(__dirname, "../scripts/transcribe.py");
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const CLIPS_DIR = path.join(PUBLIC_DIR, "clips");
const TEMP_DIR = "/tmp/clipper-local";

let _deepseek: OpenAI | null = null;
function getDeepseek(): OpenAI {
  if (!_deepseek) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set.");
    _deepseek = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
  }
  return _deepseek;
}

export async function localVideoProcessing(
  projectId: number,
  videoFilePath: string,
  options: {
    clipDurations?: number[];
    maxClips?: number;
    enableSubtitles?: boolean;
    enableAutoReframe?: boolean;
    subtitleStyle?: string;
    targetFormats?: string[];
  } = {},
): Promise<void> {
  const setProgress = async (progress: number, extra?: Record<string, unknown>) => {
    await db.update(projectsTable)
      .set({ processingProgress: progress, ...extra })
      .where(eq(projectsTable.id, projectId));
  };

  const fail = async (msg: string) => {
    await db.update(projectsTable)
      .set({ status: "failed", processingProgress: 0, errorMessage: msg })
      .where(eq(projectsTable.id, projectId));
    throw new Error(msg);
  };

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) throw new Error("Project not found");

  const tmpDir = path.join(TEMP_DIR, `project-${projectId}`);
  const clipsOut = path.join(CLIPS_DIR, `project-${projectId}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(clipsOut, { recursive: true });

  const maxClips = options.maxClips ?? 8;
  const durations = options.clipDurations ?? [30, 60];
  const formats = (options.targetFormats ?? ["shorts", "reels", "tiktok"]) as Array<"shorts" | "reels" | "tiktok" | "square">;

  try {
    // ── STEP 1: Dapatkan durasi video ────────────────────────────────
    await setProgress(5);
    let videoDuration = 0;
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "quiet", "-print_format", "json", "-show_format",
        videoFilePath,
      ], { timeout: 30_000 });
      const meta = JSON.parse(stdout);
      videoDuration = parseFloat(meta?.format?.duration ?? "0");
    } catch {
      videoDuration = 600; // default 10 menit kalau gagal
    }

    await db.update(projectsTable)
      .set({ duration: videoDuration })
      .where(eq(projectsTable.id, projectId));

    // ── STEP 2: Extract audio → WAV ─────────────────────────────────
    await setProgress(10);
    const audioPath = path.join(tmpDir, "audio.wav");
    try {
      await execFileAsync("ffmpeg", [
        "-i", videoFilePath,
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        "-y", audioPath,
      ], { timeout: 300_000 });
    } catch (e: any) {
      return fail(`Gagal extract audio: ${e?.message ?? String(e)}`);
    }

    // ── STEP 3: Transkripsi dengan Whisper ──────────────────────────
    await setProgress(20);
    const language = project.language ?? "id";
    let segments: Array<{ start: number; end: number; text: string }> = [];
    let fullTranscript = "";

    try {
      const { stdout } = await execFileAsync(
        WHISPER_PYTHON,
        [TRANSCRIBE_SCRIPT, audioPath, "base", language],
        { timeout: 600_000, maxBuffer: 10 * 1024 * 1024 },
      );
      const result = JSON.parse(stdout);
      segments = result.segments ?? [];
      fullTranscript = result.transcript ?? "";
      if (result.duration) videoDuration = result.duration;
    } catch (e: any) {
      // Kalau whisper gagal, pakai analisis berbasis durasi saja
      console.error("[whisper] Gagal transkripsi:", e?.message);
      fullTranscript = `[Transkripsi tidak tersedia — video berdurasi ${Math.round(videoDuration)} detik]`;
    }

    await setProgress(40);

    // ── STEP 4: Analisis DeepSeek ───────────────────────────────────
    const analysis = await analyzeWithDeepSeek(
      fullTranscript, segments, videoDuration, maxClips, durations
    );

    await setProgress(55);

    // ── STEP 5: Simpan momen viral ──────────────────────────────────
    if (analysis.moments.length > 0) {
      const momentInserts = analysis.moments.map((m: any) => ({
        projectId,
        startTime: m.startTime,
        endTime: m.endTime,
        duration: m.endTime - m.startTime,
        viralScore: m.viralScore,
        engagementScore: m.engagementScore,
        retentionScore: m.retentionScore,
        confidenceScore: m.confidenceScore,
        momentType: (m.momentType ?? "highlight") as "hook" | "punchline" | "emotion" | "debate" | "education" | "surprise" | "laugh" | "highlight",
        transcript: m.transcript,
        selectionReason: m.selectionReason,
      }));
      await db.insert(viralMomentsTable).values(momentInserts);
      await setProgress(60, { momentCount: momentInserts.length });
    }

    // ── STEP 6: Potong klip dari video ──────────────────────────────
    await setProgress(65);
    const topMoments = analysis.moments
      .sort((a: any, b: any) => b.viralScore - a.viralScore)
      .slice(0, maxClips);

    const clipInserts = [];
    for (let i = 0; i < topMoments.length; i++) {
      const moment = topMoments[i];
      const dur = durations[i % durations.length];
      const start = moment.startTime;
      const end = Math.min(start + dur, videoDuration);
      const format = formats[i % formats.length];

      const clipFile = `clip-${i}.mp4`;
      const thumbFile = `thumb-${i}.jpg`;
      const clipPath = path.join(clipsOut, clipFile);
      const thumbPath = path.join(clipsOut, thumbFile);
      const clipUrlBase = `/api/media/clips/project-${projectId}`;

      try {
        const subtitleOpts = (options.enableSubtitles && segments.length > 0) ? {
          segments,
          style: options.subtitleStyle ?? "highlight",
          assPath: path.join(tmpDir, `subs-${i}.ass`),
        } : undefined;
        await extractClip(videoFilePath, clipPath, start, end, format, subtitleOpts);
        await extractThumbnail(videoFilePath, thumbPath, start + (end - start) * 0.3);
      } catch (e) {
        console.error(`[clip-${i}] Gagal potong klip:`, e);
      }

      const hasClip = await fileExists(clipPath);
      const hasThumb = await fileExists(thumbPath);

      clipInserts.push({
        projectId,
        title: moment.clipTitle ?? moment.transcript?.slice(0, 80) ?? `Klip ${i + 1}`,
        thumbnailUrl: hasThumb ? `${clipUrlBase}/${thumbFile}` : null,
        videoUrl: hasClip ? `${clipUrlBase}/${clipFile}` : null,
        startTime: start,
        endTime: end,
        duration: end - start,
        format,
        status: "ready" as const,
        viralScore: moment.viralScore,
        engagementScore: moment.engagementScore,
        retentionScore: moment.retentionScore,
        confidenceScore: moment.confidenceScore,
        selectionReason: moment.selectionReason,
        subtitleStyle: (options.enableSubtitles ? (options.subtitleStyle ?? "highlight") : undefined) as any,
        hasSubtitles: options.enableSubtitles ?? false,
        isAutoReframed: options.enableAutoReframe ?? true,
        hookText: moment.hookText ?? moment.transcript?.slice(0, 100),
        suggestedTitle: moment.clipTitle ?? moment.transcript?.slice(0, 80),
        suggestedHashtags: moment.hashtags ?? ["#viral", "#shorts", "#fyp"],
      });

      // Update progress per klip
      await setProgress(65 + Math.round((i + 1) / topMoments.length * 30));
    }

    if (clipInserts.length > 0) {
      await db.insert(clipsTable).values(clipInserts);
    }

    // ── SELESAI ──────────────────────────────────────────────────────
    await db.update(projectsTable).set({
      status: "completed",
      processingProgress: 100,
      clipCount: clipInserts.length,
      momentCount: analysis.moments.length,
      errorMessage: null,
    }).where(eq(projectsTable.id, projectId));

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function analyzeWithDeepSeek(
  transcript: string,
  segments: Array<{ start: number; end: number; text: string }>,
  videoDuration: number,
  maxClips: number,
  durations: number[],
) {
  const trimmed = transcript.length > 12000
    ? transcript.slice(0, 6000) + "\n...[tengah dipotong]...\n" + transcript.slice(-6000)
    : transcript;

  const segSummary = segments.slice(0, 200)
    .map(s => `[${fmt(s.start)}-${fmt(s.end)}] ${s.text}`)
    .join("\n");

  const prompt = `Kamu adalah ahli konten viral. Analisis transkrip video ini dan temukan TOP ${maxClips} momen paling viral untuk konten pendek (TikTok, YouTube Shorts, Reels).

INFO VIDEO:
- Durasi total: ${fmt(videoDuration)} (${videoDuration} detik)
- Target durasi klip: ${durations.join(", ")} detik

TRANSKRIP DENGAN TIMESTAMP:
${segSummary || "(tidak ada timestamp)"}

TRANSKRIP PENUH:
${trimmed}

Cari momen dengan:
- Hook kuat (mengejutkan, kontroversial, emosional, edukatif)
- Cerita yang berdiri sendiri
- Energi tinggi atau puncak emosi
- Pernyataan yang bisa dikutip/dibagikan

Kembalikan HANYA JSON valid (tanpa markdown):
{
  "moments": [
    {
      "startTime": 42,
      "endTime": 102,
      "transcript": "kutipan dari momen ini",
      "momentType": "hook|punchline|emotion|debate|education|surprise|laugh|highlight",
      "viralScore": 94,
      "engagementScore": 91,
      "retentionScore": 89,
      "confidenceScore": 95,
      "selectionReason": "alasan momen ini viral (1 kalimat)",
      "clipTitle": "judul menarik untuk klip ini",
      "hookText": "kalimat pembuka hook (maks 10 kata)",
      "hashtags": ["#relevant", "#hashtag"]
    }
  ]
}

Aturan:
- startTime dan endTime harus dalam rentang 0 sampai ${videoDuration}
- Klip tidak boleh overlap
- Semua skor: integer 50-100
- Kembalikan tepat ${maxClips} momen diurutkan viralScore descending`;

  const response = await getDeepseek().chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 4096,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  return { moments: parsed.moments ?? [] };
}

/** Generate an ASS subtitle file from transcript segments, timed relative to clip start. */
async function generateSubtitleASS(
  segments: Array<{ start: number; end: number; text: string }>,
  clipStart: number,
  clipEnd: number,
  style: string,
  outPath: string,
): Promise<boolean> {
  const clipDur = clipEnd - clipStart;
  const subs = segments
    .filter(s => s.end > clipStart && s.start < clipEnd)
    .map(s => ({
      start: Math.max(0, s.start - clipStart),
      end: Math.min(clipDur, s.end - clipStart),
      text: s.text.replace(/\\/g, "").replace(/\{/g, "").replace(/\}/g, "").trim(),
    }))
    .filter(s => s.text && s.end > s.start);

  if (subs.length === 0) return false;

  const toASSTime = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.round((sec % 1) * 100);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  // Colours: &HAABBGGRR (AA=alpha 00=opaque, then BGR order)
  const styleMap: Record<string, string> = {
    highlight:    "Style: Default,DejaVu Sans,60,&H00FFFFFF,&H000000FF,&H00000000,&H80F65C8B,-1,0,0,0,100,100,2,0,3,0,0,2,40,40,80,1",
    karaoke:      "Style: Default,DejaVu Sans,60,&H00FFFFFF,&H0000FFFF,&H00000000,&HAA000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,80,1",
    word_by_word: "Style: Default,DejaVu Sans,56,&H00FFFFFF,&H000000FF,&H00000000,&HAA000000,0,0,0,0,100,100,0,0,1,3,1,2,40,40,80,1",
    pop:          "Style: Default,DejaVu Sans,72,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,5,2,2,40,40,80,1",
    glow:         "Style: Default,DejaVu Sans,60,&H00FFFFFF,&H000000FF,&H00F65C8B,&H00F65C8B,-1,0,0,0,100,100,0,0,1,4,4,2,40,40,80,1",
  };
  const styleStr = styleMap[style] ?? styleMap.highlight;

  const dialogues = subs
    .map(s => `Dialogue: 0,${toASSTime(s.start)},${toASSTime(s.end)},Default,,0,0,0,,${s.text}`)
    .join("\n");

  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleStr}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogues}
`;

  await fs.writeFile(outPath, ass, "utf-8");
  return true;
}

async function extractClip(
  src: string,
  out: string,
  start: number,
  end: number,
  format: string,
  subtitleOptions?: {
    segments: Array<{ start: number; end: number; text: string }>;
    style: string;
    assPath: string;
  },
): Promise<void> {
  const isVertical = format === "shorts" || format === "reels" || format === "tiktok";

  // setsar=1 fixes non-square pixel (SAR) artifacts inherited from source
  // lanczos = high-quality upscaling algorithm; unsharp sharpens after scale
  let vf = isVertical
    ? `crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,unsharp=5:5:0.8:3:3:0.0`
    : `crop='min(iw,ih)':'min(ih,iw)',scale=1080:1080:flags=lanczos,setsar=1,unsharp=5:5:0.8:3:3:0.0`;

  if (subtitleOptions) {
    const hasASS = await generateSubtitleASS(
      subtitleOptions.segments,
      start, end,
      subtitleOptions.style,
      subtitleOptions.assPath,
    );
    if (hasASS) {
      const safePath = subtitleOptions.assPath.replace(/\\/g, "/");
      // fontsdir tells libass where to find the DejaVu font
      vf += `,subtitles='${safePath}':fontsdir=/usr/share/fonts/truetype/dejavu`;
    }
  }

  await execFileAsync("ffmpeg", [
    "-ss", String(start),        // fast input seek
    "-i", src,
    "-t", String(end - start),   // accurate duration cut (not -to)
    "-vf", vf,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",                // was 28 — better quality
    "-c:a", "aac",
    "-b:a", "192k",             // was 128k
    "-movflags", "+faststart",
    "-y", out,
  ], { timeout: 180_000 });
}

async function extractThumbnail(src: string, out: string, ts: number): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-ss", String(ts), "-i", src,
    "-vframes", "1", "-q:v", "3", "-y", out,
  ], { timeout: 30_000 });
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

function fmt(s: number): string {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
