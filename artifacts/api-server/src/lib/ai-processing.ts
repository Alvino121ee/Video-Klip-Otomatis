/**
 * Real AI video processing pipeline:
 * 1. yt-dlp  → download YouTube subtitles (fast) or audio (fallback)
 * 2. Whisper → transcribe audio if no subtitles (via Python script)
 * 3. DeepSeek → analyze transcript, detect viral moments
 * 4. yt-dlp  → download only needed video sections
 * 5. ffmpeg  → extract clips + generate thumbnails
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";
import { db, projectsTable, clipsTable, viralMomentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const execFileAsync = promisify(execFile);

// DeepSeek API (OpenAI-compatible) — lazy init so missing key doesn't crash startup
let _deepseek: OpenAI | null = null;
function getDeepseek(): OpenAI {
  if (!_deepseek) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set. Please add it as a secret.");
    _deepseek = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
  }
  return _deepseek;
}

const WHISPER_PYTHON = process.env.WHISPER_PYTHON ?? "python3";
const TRANSCRIBE_SCRIPT = path.resolve(__dirname, "../scripts/transcribe.py");
const FETCH_TRANSCRIPT_SCRIPT = path.resolve(__dirname, "../scripts/fetch_transcript.py");
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const CLIPS_DIR = path.join(PUBLIC_DIR, "clips");
const TEMP_DIR = "/tmp/clipper-processing";
const COOKIES_FILE = "/tmp/yt-cookies.txt";

// Tulis cookies dari env var ke file saat pertama kali dipakai
let cookiesReady = false;
async function ensureCookies(): Promise<string[]> {
  const content = process.env.YOUTUBE_COOKIES;
  console.log(`[cookies] YOUTUBE_COOKIES tersedia: ${!!content}, panjang: ${content?.length ?? 0}`);
  if (!content) return [];
  if (!cookiesReady) {
    await fs.writeFile(COOKIES_FILE, content, "utf-8");
    cookiesReady = true;
    console.log(`[cookies] File cookies ditulis ke ${COOKIES_FILE}`);
  }
  return ["--cookies", COOKIES_FILE];
}

// Path ke yt-dlp — ELF binary standalone 2026.07.04 (tidak butuh Python)
const YTDLP_BIN = "/home/runner/workspace/.pythonlibs/bin/yt-dlp-latest";

// Argumen yt-dlp standar
async function ytdlpBase(): Promise<string[]> {
  return [
    "--no-playlist",
    "--no-check-certificates",
    // Android client: tidak punya nsig/SABR issue
    "--extractor-args", "youtube:player_client=android",
    ...await ensureCookies(),
  ];
}

export async function realAiProcessing(
  projectId: number,
  options: {
    clipDurations?: number[];
    maxClips?: number;
    enableSubtitles?: boolean;
    enableAutoReframe?: boolean;
    subtitleStyle?: string;
    targetFormats?: string[];
  },
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

  // Fetch project
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) throw new Error("Project not found");

  const videoUrl = project.videoUrl;
  if (!videoUrl) return fail("No video URL on project");

  const tmpDir = path.join(TEMP_DIR, `project-${projectId}`);
  const clipsOut = path.join(CLIPS_DIR, `project-${projectId}`);

  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(clipsOut, { recursive: true });

  try {
    // ── STEP 1: Transcript ──────────────────────────────────────────
    await setProgress(5);
    let segments: Array<{ start: number; end: number; text: string }>;
    let fullTranscript: string;
    let videoDuration: number = project.duration ?? 0;

    const language = project.language ?? "id";

    // Coba subtitle: bahasa proyek → English → semua bahasa
    const subResult =
      await downloadSubtitles(videoUrl, tmpDir, language) ||
      (language !== "en" ? await downloadSubtitles(videoUrl, tmpDir, "en") : null) ||
      await downloadSubtitles(videoUrl, tmpDir, ".*");

    if (subResult) {
      ({ segments, transcript: fullTranscript } = subResult);
      // Estimate duration from last segment
      if (segments.length > 0 && !videoDuration) {
        videoDuration = Math.ceil(segments[segments.length - 1].end) + 30;
      }
    } else {
      // Fallback: download audio + whisper
      await setProgress(10);
      const audioPath = path.join(tmpDir, "audio.wav");
      try {
        await downloadAudio(videoUrl, audioPath);
      } catch (e: any) {
        const msg = e?.stderr ?? e?.message ?? String(e);
        console.error(`[yt-dlp audio error]\n${msg}`);
        if (msg.includes("Sign in") || msg.includes("bot") || msg.includes("confirm")) {
          return fail("YouTube memblokir download: bot detection. Pastikan YOUTUBE_COOKIES sudah diisi dengan cookies yang valid dan belum expired.");
        }
        if (msg.includes("Private video") || msg.includes("private")) {
          return fail("Video ini bersifat private dan tidak bisa diproses.");
        }
        return fail(`Gagal download audio: ${msg.slice(0, 300)}`);
      }
      await setProgress(20);
      const whisperResult = await runWhisper(audioPath, language);
      segments = whisperResult.segments;
      fullTranscript = whisperResult.transcript;
      if (!videoDuration) videoDuration = whisperResult.duration ?? 0;
    }

    await setProgress(30);

    // Get video metadata for duration if not set
    if (!videoDuration) {
      videoDuration = await getVideoDuration(videoUrl);
    }

    // Update project with real duration
    await db.update(projectsTable)
      .set({ duration: videoDuration })
      .where(eq(projectsTable.id, projectId));

    // ── STEP 2: DeepSeek Analysis ───────────────────────────────────
    await setProgress(40);
    const maxClips = options.maxClips ?? 8;
    const durations = options.clipDurations ?? [30, 60];
    const formats = (options.targetFormats ?? ["shorts", "reels", "tiktok"]) as Array<"shorts" | "reels" | "tiktok" | "square">;

    const analysis = await analyzeWithDeepSeek(fullTranscript, segments, videoDuration, maxClips, durations);

    await setProgress(55);

    // ── STEP 3: Store viral moments ─────────────────────────────────
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

    // ── STEP 4: Download video + extract clips ──────────────────────
    const topMoments = analysis.moments
      .sort((a: any, b: any) => b.viralScore - a.viralScore)
      .slice(0, maxClips);

    const videoPath = path.join(tmpDir, "video.mp4");
    await setProgress(65);

    // Try to download video — if it fails (bot detection, IP block, etc.)
    // we still save the AI analysis and moments as useful partial output.
    let videoDownloaded = false;
    try {
      const sections = buildSections(topMoments, durations);
      await downloadVideoSections(videoUrl, videoPath, sections);
      videoDownloaded = true;
    } catch (dlErr: any) {
      const msg = dlErr?.stderr ?? dlErr?.message ?? String(dlErr);
      console.error(`[video-download] Gagal download video (${msg.slice(0, 200)}). Melanjutkan dengan data AI saja.`);
      // Update error message tapi jangan hentikan proses
      await db.update(projectsTable)
        .set({ errorMessage: `Video tidak bisa didownload (YouTube bot detection atau cookies expired). Momen AI tetap tersimpan. Detail: ${msg.slice(0, 300)}` })
        .where(eq(projectsTable.id, projectId));
    }

    await setProgress(80);

    // Extract each clip and thumbnail (only if video was downloaded)
    const clipInserts = [];
    for (let i = 0; i < topMoments.length; i++) {
      const moment = topMoments[i];
      const dur = durations[i % durations.length];
      const start = moment.startTime;
      const end = Math.min(start + dur, videoDuration);
      const format = formats[i % formats.length];

      const clipUrlBase = `/api/media/clips/project-${projectId}`;
      let clipFileUrl: string | null = null;
      let thumbFileUrl: string | null = null;

      if (videoDownloaded) {
        const clipFile = `clip-${i}.mp4`;
        const thumbFile = `thumb-${i}.jpg`;
        const clipPath = path.join(clipsOut, clipFile);
        const thumbPath = path.join(clipsOut, thumbFile);

        try {
          await extractClip(videoPath, clipPath, start, end, format);
          await extractThumbnail(videoPath, thumbPath, start + (end - start) * 0.3);
        } catch {
          // clip extraction failed, continue without file
        }

        if (await fileExists(clipPath)) clipFileUrl = `${clipUrlBase}/${clipFile}`;
        if (await fileExists(thumbPath)) thumbFileUrl = `${clipUrlBase}/${thumbFile}`;
      }

      clipInserts.push({
        projectId,
        title: moment.clipTitle ?? moment.transcript?.slice(0, 80) ?? `Clip ${i + 1}`,
        thumbnailUrl: thumbFileUrl,
        videoUrl: clipFileUrl,
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
    }

    if (clipInserts.length > 0) {
      await db.insert(clipsTable).values(clipInserts);
    }

    // ── DONE ────────────────────────────────────────────────────────
    await db.update(projectsTable).set({
      status: "completed",
      processingProgress: 100,
      clipCount: clipInserts.length,
      momentCount: analysis.moments.length,
    }).where(eq(projectsTable.id, projectId));

  } finally {
    // Clean up temp directory (keep public clips)
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function downloadSubtitles(url: string, tmpDir: string, language: string = "id"): Promise<{
  transcript: string;
  segments: Array<{ start: number; end: number; text: string }>;
} | null> {
  try {
    await execFileAsync(YTDLP_BIN, [
      "--write-auto-subs",
      "--sub-langs", `${language}.*`,
      "--skip-download",
      "--output", path.join(tmpDir, "subs.%(ext)s"),
      ...await ytdlpBase(),
      url,
    ], { timeout: 30_000 });

    const files = await fs.readdir(tmpDir);
    const subFile = files.find(f => f.endsWith(".vtt") || f.endsWith(".srt"));
    if (!subFile) return null;

    const content = await fs.readFile(path.join(tmpDir, subFile), "utf-8");
    return parseSubtitles(content);
  } catch {
    return null;
  }
}

function parseSubtitles(content: string): { transcript: string; segments: Array<{ start: number; end: number; text: string }> } {
  const segments: Array<{ start: number; end: number; text: string }> = [];

  // VTT / SRT time pattern: 00:00:00.000 --> 00:00:05.000
  const timeRegex = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})/g;
  const lines = content.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const match = line.match(/^(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})/);
    if (match) {
      const toSec = (h: string, m: string, s: string, ms: string) =>
        parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
      const start = toSec(match[1], match[2], match[3], match[4]);
      const end = toSec(match[5], match[6], match[7], match[8]);

      // Collect text lines
      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "" && !lines[i].match(/^\d{1,2}:\d{2}:\d{2}/)) {
        const txt = lines[i].replace(/<[^>]+>/g, "").trim(); // strip HTML tags
        if (txt) textLines.push(txt);
        i++;
      }
      const text = textLines.join(" ");
      if (text) segments.push({ start, end, text });
    } else {
      i++;
    }
  }

  // Merge very short adjacent segments into ~30s chunks for cleaner analysis
  const merged: Array<{ start: number; end: number; text: string }> = [];
  let cur: { start: number; end: number; text: string } | null = null;
  for (const seg of segments) {
    if (!cur) { cur = { ...seg }; continue; }
    if (seg.end - cur.start < 30 && seg.text !== cur.text) {
      cur.end = seg.end;
      cur.text += " " + seg.text;
    } else {
      if (cur.text) merged.push(cur);
      cur = { ...seg };
    }
  }
  if (cur?.text) merged.push(cur);

  return { transcript: merged.map(s => s.text).join(" "), segments: merged };
}

async function downloadAudio(url: string, outputPath: string): Promise<void> {
  await execFileAsync(YTDLP_BIN, [
    "-x", "--audio-format", "wav", "--audio-quality", "3",
    "--output", outputPath,
    ...await ytdlpBase(),
    url,
  ], { timeout: 300_000 });
}

async function runWhisper(audioPath: string, language: string = "id"): Promise<{
  transcript: string;
  segments: Array<{ start: number; end: number; text: string }>;
  duration: number;
}> {
  const { stdout } = await execFileAsync(
    WHISPER_PYTHON,
    [TRANSCRIBE_SCRIPT, audioPath, "base", language],
    { timeout: 600_000, maxBuffer: 10 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function getVideoDuration(url: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(YTDLP_BIN, [
      "--no-playlist",
      "--print", "duration",
      url,
    ], { timeout: 30_000 });
    return Math.round(parseFloat(stdout.trim()));
  } catch {
    return 1800;
  }
}

async function analyzeWithDeepSeek(
  transcript: string,
  segments: Array<{ start: number; end: number; text: string }>,
  videoDuration: number,
  maxClips: number,
  durations: number[],
) {
  // Trim transcript to fit context (max ~12K chars)
  const trimmedTranscript = transcript.length > 12000
    ? transcript.slice(0, 6000) + "\n...[middle trimmed]...\n" + transcript.slice(-6000)
    : transcript;

  // Build segmented view for timestamps
  const segmentSummary = segments
    .slice(0, 200)
    .map(s => `[${fmtTime(s.start)}-${fmtTime(s.end)}] ${s.text}`)
    .join("\n");

  const prompt = `You are a viral content expert. Analyze this video transcript and identify the TOP ${maxClips} most viral-worthy moments for short-form content (TikTok, YouTube Shorts, Instagram Reels).

VIDEO INFO:
- Total duration: ${fmtTime(videoDuration)} (${videoDuration} seconds)
- Target clip durations: ${durations.join(", ")} seconds

TIMESTAMPED TRANSCRIPT:
${segmentSummary}

FULL TRANSCRIPT:
${trimmedTranscript}

Find moments that have:
- Strong hooks (surprising, controversial, emotional, or educational)
- Self-contained stories (viewer doesn't need prior context)
- High energy or emotional peaks
- Quotable/shareable statements

Return ONLY valid JSON (no markdown, no code blocks):
{
  "moments": [
    {
      "startTime": 42,
      "endTime": 102,
      "transcript": "exact quote from this moment",
      "momentType": "hook|punchline|emotion|debate|education|surprise|laugh|highlight",
      "viralScore": 94,
      "engagementScore": 91,
      "retentionScore": 89,
      "confidenceScore": 95,
      "selectionReason": "why this moment is viral (1 sentence)",
      "clipTitle": "catchy title for this clip",
      "hookText": "opening hook line (max 10 words)",
      "hashtags": ["#relevant", "#hashtag", "#list"]
    }
  ]
}

Rules:
- startTime and endTime must be valid seconds within the video
- Clips must NOT overlap
- viralScore, engagementScore, retentionScore, confidenceScore: integers 50-100
- Return exactly ${maxClips} moments sorted by viralScore descending
- momentType must be one of the exact values listed`;

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

function buildSections(moments: any[], durations: number[]): Array<{ start: number; end: number }> {
  return moments.map((m, i) => ({
    start: Math.max(0, m.startTime - 2),
    end: m.startTime + (durations[i % durations.length] ?? 60) + 5,
  }));
}

async function downloadVideoSections(url: string, outputPath: string, sections: Array<{ start: number; end: number }>): Promise<void> {
  // Build section args — download all needed parts merged into one file
  const sectionArgs: string[] = [];
  for (const s of sections) {
    sectionArgs.push("--download-sections", `*${s.start}-${s.end}`);
  }

  await execFileAsync(YTDLP_BIN, [
    "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]",
    "--merge-output-format", "mp4",
    ...sectionArgs,
    "--force-keyframes-at-cuts",
    "--output", outputPath,
    "--no-playlist",
    url,
  ], { timeout: 600_000 });
}

async function extractClip(videoPath: string, outputPath: string, start: number, end: number, format: string): Promise<void> {
  // Aspect ratio filter for vertical formats
  const vf = (format === "shorts" || format === "reels" || format === "tiktok")
    ? `crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2`
    : `crop='min(iw,ih)':'min(ih,iw)',scale=1080:1080`;

  await execFileAsync("ffmpeg", [
    "-ss", String(start),
    "-to", String(end),
    "-i", videoPath,
    "-vf", vf,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "28",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ], { timeout: 120_000 });
}

async function extractThumbnail(videoPath: string, outputPath: string, timestamp: number): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-ss", String(timestamp),
    "-i", videoPath,
    "-vframes", "1",
    "-q:v", "3",
    "-y",
    outputPath,
  ], { timeout: 30_000 });
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
