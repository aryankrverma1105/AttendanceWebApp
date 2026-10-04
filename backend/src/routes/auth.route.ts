import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  loginUser,
  demoLogin,
  logoutUser,
  adminResetUserSessions,
  getCurrentUser,
  refreshSession,
} from "../controllers/auth.controller";
import { authorized, requireRole } from "../middleware/auth.middleware";
import { config } from "../config/config";

const authRouter = Router();

// Credential-guessing throttle: generous enough for normal retries, tight enough to
// make brute-forcing a password impractical.
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

// Demo-only role switch: requires an existing valid session AND an explicit opt-in —
// disabled by default so it can never be reached in a real deployment.
if (process.env.NODE_ENV !== "production" && config.ALLOW_DEV_MODE) {
  authRouter.post("/demo-login", authorized, loginLimiter, demoLogin);
}

authRouter.post("/reset-sessions/:userId", authorized, requireRole("ADMIN"), adminResetUserSessions);

export default authRouter;