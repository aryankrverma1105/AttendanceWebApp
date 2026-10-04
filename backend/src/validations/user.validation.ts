import { z } from "zod";

const reservedUsernames = [
  "admin",
  "root",
  "support",
  "system",
  "api",
  "www",
  "null",
  "undefined",
];

export const userProfileSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(
      /^[A-Za-z](?:[A-Za-z0-9]|[._](?=[A-Za-z0-9]))*$/,
      "Username can only contain letters, numbers, dots, and underscores"
    )
    .refine(
      (username) => !reservedUsernames.includes(username.toLowerCase()),
      {
        message: "This username is reserved",
      }
    ),

  bio: z
    .string()
    .trim()
    .max(200, "Bio must be at most 200 characters")
    .optional(),
});