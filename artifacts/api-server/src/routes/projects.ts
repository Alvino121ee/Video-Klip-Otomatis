import { Router, type IRouter } from "express";
import { eq, desc, count, sql } from "drizzle-orm";
import { db, projectsTable, clipsTable, viralMomentsTable } from "@workspace/db";
import {
  ListProjectsQueryParams,
  CreateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  UpdateProjectBody,
  DeleteProjectParams,
  ProcessProjectParams,
  ProcessProjectBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/projects", async (req, res): Promise<void> => {
  const query = ListProjectsQueryParams.safeParse(req.query);
  const projects = await db
    .select()
    .from(projectsTable)
    .where(
      query.success && query.data.status
        ? eq(projectsTable.status, query.data.status as "pending" | "processing" | "completed" | "failed")
        : undefined,
    )
    .orderBy(desc(projectsTable.createdAt));
  res.json(projects);
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [project] = await db
    .insert(projectsTable)
    .values({
      title: parsed.data.title,
      description: parsed.data.description,
      videoUrl: parsed.data.videoUrl,
      videoSource: parsed.data.videoSource,
      category: parsed.data.category as "podcast" | "gaming" | "tutorial" | "education" | "review" | "interview" | "news" | "streaming" | "vlog" | "comedy" | "sports" | undefined,
      language: parsed.data.language,
    })
    .returning();
  res.status(201).json(project);
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [project] = await db
    .update(projectsTable)
    .set({
      ...parsed.data,
      category: parsed.data.category as "podcast" | "gaming" | "tutorial" | "education" | "review" | "interview" | "news" | "streaming" | "vlog" | "comedy" | "sports" | undefined,
    })
    .where(eq(projectsTable.id, params.data.id))
    .returning();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [project] = await db
    .delete(projectsTable)
    .where(eq(projectsTable.id, params.data.id))
    .returning();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/projects/:id/process", async (req, res): Promise<void> => {
  const params = ProcessProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const options = ProcessProjectBody.safeParse(req.body);
  if (!options.success) {
    res.status(400).json({ error: options.error.message });
    return;
  }

  // Update project to processing state
  const [project] = await db
    .update(projectsTable)
    .set({ status: "processing", processingProgress: 0 })
    .where(eq(projectsTable.id, params.data.id))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Simulate AI processing: generate demo viral moments and clips asynchronously
  simulateAiProcessing(params.data.id, options.data).catch((err) => {
    req.log.error({ err }, "AI processing simulation failed");
  });

  res.json(project);
});

router.get("/projects/:id/clips", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const clips = await db
    .select()
    .from(clipsTable)
    .where(eq(clipsTable.projectId, params.data.id))
    .orderBy(desc(clipsTable.viralScore));
  res.json(clips);
});

router.get("/projects/:id/moments", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const moments = await db
    .select()
    .from(viralMomentsTable)
    .where(eq(viralMomentsTable.projectId, params.data.id))
    .orderBy(desc(viralMomentsTable.viralScore));
  res.json(moments);
});

// Simulate AI processing: creates realistic viral moments + clips
async function simulateAiProcessing(
  projectId: number,
  options: { clipDurations?: number[]; maxClips?: number; enableSubtitles?: boolean; enableAutoReframe?: boolean; subtitleStyle?: string },
): Promise<void> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return;

  const videoDuration = project.duration ?? 1800; // default 30min
  const durations = options.clipDurations ?? [30, 60];
  const maxClips = options.maxClips ?? 8;
  const subtitleStyle = (options.subtitleStyle ?? "word_by_word") as "word_by_word" | "karaoke" | "highlight" | "pop" | "bounce" | "glow" | "fade" | "zoom";

  const momentTypes: Array<"hook" | "punchline" | "emotion" | "debate" | "education" | "surprise" | "laugh" | "highlight"> = [
    "hook", "punchline", "emotion", "debate", "education", "surprise", "laugh", "highlight",
  ];
  const selectionReasons = [
    "High energy vocal delivery with strong hook potential",
    "Emotional peak with audience engagement cues detected",
    "Punchline with laughter response — high virality signal",
    "Educational insight with clear value proposition",
    "Surprising revelation that increases retention likelihood",
    "Debate moment with high tension and engagement",
    "Highlight moment with peak audio energy",
    "Strong opening hook with immediate viewer capture",
  ];

  const numMoments = Math.min(15, Math.floor(videoDuration / 120) + 5);
  const momentData = [];

  // Progress: 25% — scanning
  await db.update(projectsTable).set({ processingProgress: 25 }).where(eq(projectsTable.id, projectId));
  await sleep(1000);

  for (let i = 0; i < numMoments; i++) {
    const start = Math.random() * (videoDuration - 120) + 10;
    const dur = 30 + Math.random() * 90;
    momentData.push({
      projectId,
      startTime: Math.round(start),
      endTime: Math.round(start + dur),
      duration: Math.round(dur),
      viralScore: Math.round(50 + Math.random() * 50),
      engagementScore: Math.round(40 + Math.random() * 60),
      retentionScore: Math.round(40 + Math.random() * 60),
      confidenceScore: Math.round(60 + Math.random() * 40),
      momentType: momentTypes[i % momentTypes.length],
      transcript: `Sample transcript segment ${i + 1} — AI detected viral moment`,
      selectionReason: selectionReasons[i % selectionReasons.length],
    });
  }

  await db.insert(viralMomentsTable).values(momentData);

  // Progress: 60% — moments found
  await db.update(projectsTable).set({ processingProgress: 60, momentCount: numMoments }).where(eq(projectsTable.id, projectId));
  await sleep(1500);

  // Generate clips from top moments
  const topMoments = momentData
    .sort((a, b) => b.viralScore - a.viralScore)
    .slice(0, maxClips);

  const formats: Array<"shorts" | "reels" | "tiktok" | "square"> = ["shorts", "reels", "tiktok", "square"];
  const clipTitles = [
    "The moment everyone's talking about",
    "You won't believe what happened next",
    "This changed everything",
    "The best part of the video",
    "Why everyone is watching this",
    "The viral moment that broke the internet",
    "This is why you need to watch",
    "The most powerful moment",
  ];

  const clipData = [];
  for (let i = 0; i < topMoments.length; i++) {
    const moment = topMoments[i];
    const dur = durations[i % durations.length];
    clipData.push({
      projectId,
      title: clipTitles[i % clipTitles.length],
      thumbnailUrl: `https://picsum.photos/seed/${projectId}-${i}/360/640`,
      startTime: moment.startTime,
      endTime: moment.startTime + dur,
      duration: dur,
      format: formats[i % formats.length],
      status: "ready" as const,
      viralScore: moment.viralScore,
      engagementScore: moment.engagementScore,
      retentionScore: moment.retentionScore,
      confidenceScore: moment.confidenceScore,
      selectionReason: moment.selectionReason,
      subtitleStyle: options.enableSubtitles ? subtitleStyle : undefined,
      hasSubtitles: options.enableSubtitles ?? false,
      isAutoReframed: options.enableAutoReframe ?? true,
      hookText: `Hook: ${moment.transcript?.slice(0, 60)}...`,
      suggestedTitle: clipTitles[i % clipTitles.length],
      suggestedHashtags: ["#viral", "#trending", "#shorts", "#fyp", "#contentcreator"].slice(0, 3 + (i % 3)),
    });
  }

  await db.insert(clipsTable).values(clipData);

  // Progress: 100% — done
  await db
    .update(projectsTable)
    .set({
      status: "completed",
      processingProgress: 100,
      clipCount: clipData.length,
      momentCount: numMoments,
    })
    .where(eq(projectsTable.id, projectId));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default router;
