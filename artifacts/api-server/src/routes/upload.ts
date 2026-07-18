import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { db, projectsTable } from "@workspace/db";
import { localVideoProcessing } from "../lib/local-video-processing";

const UPLOADS_DIR = path.resolve(__dirname, "../public/uploads");

// Pastikan folder uploads ada
fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp4";
    cb(null, `upload-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
  fileFilter: (_req, file, cb) => {
    const allowed = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/mpeg", "video/x-matroska"];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp4|mov|avi|webm|mkv|mpeg)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Format file tidak didukung. Gunakan MP4, MOV, AVI, WebM, atau MKV."));
    }
  },
});

const router: IRouter = Router();

/**
 * POST /api/upload
 * Multipart form-data: file, title, language, category, description, clipDurations, maxClips
 * Membuat project baru, menyimpan video, langsung mulai processing.
 */
router.post("/upload", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "Tidak ada file yang diupload." });
    return;
  }

  const title = (req.body.title as string)?.trim() || path.basename(req.file.originalname, path.extname(req.file.originalname));
  const language = (req.body.language as string) || "id";
  const category = (req.body.category as string) || "vlog";
  const description = (req.body.description as string) || "";

  // Parse options
  let clipDurations: number[] = [30, 60];
  try { clipDurations = JSON.parse(req.body.clipDurations); } catch {}
  const maxClips = parseInt(req.body.maxClips, 10) || 8;

  // Buat project
  const [project] = await db
    .insert(projectsTable)
    .values({
      title,
      description,
      videoUrl: `/api/media/uploads/${req.file.filename}`,
      videoSource: "upload",
      category: category as any,
      language,
      status: "processing",
      processingProgress: 0,
    })
    .returning();

  // Mulai processing secara async
  localVideoProcessing(project.id, req.file.path, { clipDurations, maxClips }).catch((err) => {
    req.log.error({ err }, "Local video processing failed");
  });

  res.status(201).json(project);
});

export default router;
