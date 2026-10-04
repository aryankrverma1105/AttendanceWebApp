import { Router } from "express";
import { getPerformanceScorecards } from "../controllers/analytics.controller";

const analyticsRouter = Router();

analyticsRouter.get("/scorecards", getPerformanceScorecards);

export default analyticsRouter;
