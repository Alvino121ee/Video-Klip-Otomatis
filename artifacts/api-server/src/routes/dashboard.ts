import { Router, type IRouter } from "express";
import { eq, desc, avg, max, sum, sql } from "drizzle-orm";
import { db, projectsTable, clipsTable, viralMomentsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/stats", async (_req, res): Promise<void> => {
  const [projectStats] = await db
    .select({
      totalProjects: sql<number>`count(*)::int`,
      completedProjects: sql<number>`count(*) filter (where status = 'completed')::int`,
      processingProjects: sql<number>`count(*) filter (where status = 'processing')::int`,
      totalVideoDuration: sum(projectsTable.duration),
    })
    .from(projectsTable);

  const [clipStats] = await db
    .select({
      totalClips: sql<number>`count(*)::int`,
      avgViralScore: avg(clipsTable.viralScore),
      topViralScore: max(clipsTable.viralScore),
    })
    .from(clipsTable);

  const [momentStats] = await db
    .select({ totalMoments: sql<number>`count(*)::int` })
    .from(viralMomentsTable);

  // Status breakdown
  const statusRows = await db
    .select({
      status: projectsTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(projectsTable)
    .groupBy(projectsTable.status);

  const statusBreakdown = Object.fromEntries(
    statusRows.map((r) => [r.status, r.count]),
  );

  // Format breakdown
  const formatRows = await db
    .select({
      format: clipsTable.format,
      count: sql<number>`count(*)::int`,
    })
    .from(clipsTable)
    .where(sql`format is not null`)
    .groupBy(clipsTable.format);

  const formatBreakdown = Object.fromEntries(
    formatRows.map((r) => [r.format ?? "unknown", r.count]),
  );

  res.json({
    totalProjects: projectStats?.totalProjects ?? 0,
    totalClips: clipStats?.totalClips ?? 0,
    totalMoments: momentStats?.totalMoments ?? 0,
    completedProjects: projectStats?.completedProjects ?? 0,
    processingProjects: projectStats?.processingProjects ?? 0,
    avgViralScore: Number(clipStats?.avgViralScore ?? 0),
    topViralScore: Number(clipStats?.topViralScore ?? 0),
    totalVideoDuration: Number(projectStats?.totalVideoDuration ?? 0),
    statusBreakdown,
    formatBreakdown,
  });
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
  const recentProjects = await db
    .select({
      id: projectsTable.id,
      title: projectsTable.title,
      status: projectsTable.status,
      createdAt: projectsTable.createdAt,
      updatedAt: projectsTable.updatedAt,
    })
    .from(projectsTable)
    .orderBy(desc(projectsTable.updatedAt))
    .limit(5);

  const recentClips = await db
    .select({
      id: clipsTable.id,
      title: clipsTable.title,
      status: clipsTable.status,
      projectId: clipsTable.projectId,
      projectTitle: projectsTable.title,
      createdAt: clipsTable.createdAt,
      updatedAt: clipsTable.updatedAt,
    })
    .from(clipsTable)
    .leftJoin(projectsTable, eq(clipsTable.projectId, projectsTable.id))
    .where(eq(clipsTable.status, "ready"))
    .orderBy(desc(clipsTable.createdAt))
    .limit(5);

  const activities = [
    ...recentProjects.map((p) => ({
      id: p.id,
      type: p.status === "completed"
        ? "project_completed"
        : p.status === "processing"
          ? "processing_started"
          : "project_created",
      title: p.status === "completed"
        ? `"${p.title}" processing complete`
        : p.status === "processing"
          ? `"${p.title}" AI processing started`
          : `Project "${p.title}" created`,
      subtitle: null as string | null,
      entityId: p.id,
      entityType: "project" as const,
      timestamp: p.updatedAt,
    })),
    ...recentClips.map((c) => ({
      id: c.id,
      type: "clip_ready" as const,
      title: `Clip ready: "${c.title}"`,
      subtitle: c.projectTitle ?? null,
      entityId: c.id,
      entityType: "clip" as const,
      timestamp: c.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  res.json(activities);
});

router.get("/dashboard/top-clips", async (_req, res): Promise<void> => {
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
    .where(eq(clipsTable.status, "ready"))
    .orderBy(desc(clipsTable.viralScore))
    .limit(6);
  res.json(clips);
});

export default router;
