import { Router } from "express";
import { getNotifications, markNotificationRead } from "../controllers/notification.controller";

const notificationRouter = Router();

notificationRouter.get("/", getNotifications);
notificationRouter.patch("/:id/read", markNotificationRead);

export default notificationRouter;
