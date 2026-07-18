import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, projectsTable, clipsTable, viralMomentsTable } from "@workspace/db";
import { realAiProcessing } from "../lib/ai-processing";
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

  // Run real AI processing pipeline asynchronously
  realAiProcessing(params.data.id, options.data).catch((err) => {
    req.log.error({ err }, "AI processing failed");
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


export default router;
