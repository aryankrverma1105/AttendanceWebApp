import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  loginUser,
  logoutUser,
  adminResetUserSessions,
  getCurrentUser,
  refreshSession,
} from "../controllers/auth.controller";
import { authorized, requireRole } from "../middleware/auth.middleware";

const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please try again later." },
});

authRouter.post("/login", loginLimiter, loginUser);
authRouter.post("/refresh", loginLimiter, refreshSession);
authRouter.post("/logout", logoutUser);
authRouter.get("/me", authorized, getCurrentUser);
authRouter.post("/reset-sessions/:userId", authorized, requireRole("ADMIN"), adminResetUserSessions);

export default authRouter;