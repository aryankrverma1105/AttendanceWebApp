import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

if (!process.env.JWT_SECRET && process.env.NODE_ENV !== "test") {
  throw new Error(
    "JWT_SECRET is not set. Add a long random value to your .env file before starting the server."
  );
}

export const config = {
  PORT: Number(process.env.PORT) || 5000,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_SECURE: process.env.SMTP_SECURE,
  JWT_SECRET: process.env.JWT_SECRET || "test-jwt-secret-key-32-chars-long-minimum-token",
  BASE_URL: process.env.BASE_URL || "http://localhost:5000",
  // Bootstrap admin credentials
  SYSTEM_ADMIN: process.env.SYSTEM_ADMIN,
  SYSTEM_ADMIN_PASSWORD: process.env.SYSTEM_ADMIN_PASSWORD,
  // Automatic geofence attendance trigger (defaults to false; manual check-in/out is source of truth)
  AUTO_GEOFENCE_ATTENDANCE: process.env.AUTO_GEOFENCE_ATTENDANCE === "true",
};

export default config;