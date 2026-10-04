import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// JWT_SECRET signs every access/refresh token issued by this server — it must come from
// the environment, never a hardcoded fallback (a fallback baked into source code stops
// being a "secret" the moment the repo is shared).
if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Add a long random value to your .env file before starting the server."
  );
}

export const config = {
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_SECURE: process.env.SMTP_SECURE,
  JWT_SECRET: process.env.JWT_SECRET,
  BASE_URL: process.env.BASE_URL || "http://localhost:3000",
  // Bootstrap admin: only used to auto-create the very first ADMIN account when both are
  // set. Leave unset in production once a real admin account exists.
  SYSTEM_ADMIN: process.env.SYSTEM_ADMIN,
  SYSTEM_ADMIN_PASSWORD: process.env.SYSTEM_ADMIN_PASSWORD,
  // Explicit opt-in for demo-only conveniences (x-user-role header auth, permissive CORS).
  // Requires NODE_ENV !== "production" as well — this is a second, independent gate.
  ALLOW_DEV_MODE: process.env.ALLOW_DEV_MODE === "true",
};