import { Router } from "express";
import {
  submitLocation,
  submitBatchLocations,
  getLocationHistory,
  reportLocationStatus,
} from "../controllers/location.controller";

const locationRouter = Router();

locationRouter.post("/", submitLocation);
locationRouter.post("/update", submitLocation);
locationRouter.post("/batch", submitBatchLocations);
locationRouter.post("/status", reportLocationStatus);
locationRouter.get("/:id/history", getLocationHistory);

export default locationRouter;
