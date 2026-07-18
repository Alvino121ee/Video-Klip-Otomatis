import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import clipsRouter from "./clips";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(clipsRouter);
router.use(dashboardRouter);

export default router;
