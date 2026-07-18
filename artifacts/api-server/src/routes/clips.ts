import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, clipsTable, projectsTable } from "@workspace/db";
import {
  ListClipsQueryParams,
  GetClipParams,
  UpdateClipParams,
  UpdateClipBody,
  DeleteClipParams,
  ExportClipParams,
  ExportClipBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clips", async (req, res): Promise<void> => {
  const query = ListClipsQueryParams.safeParse(req.query);
  const clips = await db
    .select({
      id: clipsTable.id,
      projectId: clipsTable.projectId,
      projectTitle: projectsTable.title,
      title: clipsTable.title,
      description: clipsTable.description,
      thumbnailUrl: clipsTable.thumbnailUrl,
      videoUrl: clipsTable.videoUrl,
      startTime: clipsTable.startTime,
      endTime: clipsTable.endTime,
      duration: clipsTable.duration,
      format: clipsTable.format,
      status: clipsTable.status,
      viralScore: clipsTable.viralScore,
      engagementScore: clipsTable.engagementScore,
      retentionScore: clipsTable.retentionScore,
      confidenceScore: clipsTable.confidenceScore,
      selectionReason: clipsTable.selectionReason,
      subtitleStyle: clipsTable.subtitleStyle,
      hasSubtitles: clipsTable.hasSubtitles,
      isAutoReframed: clipsTable.isAutoReframed,
      hookText: clipsTable.hookText,
      suggestedTitle: clipsTable.suggestedTitle,
      suggestedHashtags: clipsTable.suggestedHashtags,
      createdAt: clipsTable.createdAt,
      updatedAt: clipsTable.updatedAt,
    })
    .from(clipsTable)
    .leftJoin(projectsTable, eq(clipsTable.projectId, projectsTable.id))
    .where(
      query.success && query.data.status
        ? eq(clipsTable.status, query.data.status as "pending" | "rendering" | "ready" | "failed")
        : undefined,
    )
    .orderBy(desc(clipsTable.viralScore));
  res.json(clips);
});

router.get("/clips/:id", async (req, res): Promise<void> => {
  const params = GetClipParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [clip] = await db
    .select({
      id: clipsTable.id,
      projectId: clipsTable.projectId,
      projectTitle: projectsTable.title,
      title: clipsTable.title,
      description: clipsTable.description,
      thumbnailUrl: clipsTable.thumbnailUrl,
      videoUrl: clipsTable.videoUrl,
      startTime: clipsTable.startTime,
      endTime: clipsTable.endTime,
      duration: clipsTable.duration,
      format: clipsTable.format,
      status: clipsTable.status,
      viralScore: clipsTable.viralScore,
      engagementScore: clipsTable.engagementScore,
      retentionScore: clipsTable.retentionScore,
      confidenceScore: clipsTable.confidenceScore,
      selectionReason: clipsTable.selectionReason,
      subtitleStyle: clipsTable.subtitleStyle,
      hasSubtitles: clipsTable.hasSubtitles,
      isAutoReframed: clipsTable.isAutoReframed,
      hookText: clipsTable.hookText,
      suggestedTitle: clipsTable.suggestedTitle,
      suggestedHashtags: clipsTable.suggestedHashtags,
      createdAt: clipsTable.createdAt,
      updatedAt: clipsTable.updatedAt,
    })
    .from(clipsTable)
    .leftJoin(projectsTable, eq(clipsTable.projectId, projectsTable.id))
    .where(eq(clipsTable.id, params.data.id));
  if (!clip) {
    res.status(404).json({ error: "Clip not found" });
    return;
  }
  res.json(clip);
});

router.patch("/clips/:id", async (req, res): Promise<void> => {
  const params = UpdateClipParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateClipBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [clip] = await db
    .update(clipsTable)
    .set({
      ...parsed.data,
      subtitleStyle: parsed.data.subtitleStyle as "word_by_word" | "karaoke" | "highlight" | "pop" | "bounce" | "glow" | "fade" | "zoom" | undefined,
    })
    .where(eq(clipsTable.id, params.data.id))
    .returning();
  if (!clip) {
    res.status(404).json({ error: "Clip not found" });
    return;
  }
  res.json(clip);
});

router.delete("/clips/:id", async (req, res): Promise<void> => {
  const params = DeleteClipParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [clip] = await db
    .delete(clipsTable)
    .where(eq(clipsTable.id, params.data.id))
    .returning();
  if (!clip) {
    res.status(404).json({ error: "Clip not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/clips/:id/export", async (req, res): Promise<void> => {
  const params = ExportClipParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ExportClipBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [clip] = await db
    .update(clipsTable)
    .set({
      status: "rendering",
      format: parsed.data.format as "shorts" | "reels" | "tiktok" | "square" | undefined,
    })
    .where(eq(clipsTable.id, params.data.id))
    .returning();
  if (!clip) {
    res.status(404).json({ error: "Clip not found" });
    return;
  }
  // Simulate render completing after 2s
  setTimeout(async () => {
    await db
      .update(clipsTable)
      .set({ status: "ready" })
      .where(eq(clipsTable.id, params.data.id));
  }, 2000);
  res.json(clip);
});

export default router;
