import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import clipsRouter from "./clips";
import dashboardRouter from "./dashboard";
import uploadRouter from "./upload";

const router: IRouter = Router();

router.use(healthRouter);
router.use(uploadRouter);
router.use(projectsRouter);
router.use(clipsRouter);
router.use(dashboardRouter);

export default router;
