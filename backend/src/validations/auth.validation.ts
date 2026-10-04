import z from "zod";

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


export const registerSchema = z.object({
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

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(255, "Email is too long"),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(255, "Password is too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character")
    .refine((password) => !/\s/.test(password), {
      message: "Password cannot contain spaces",
    }),
});

export const loginSchema = z.object({
    email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(255, "Email is too long"),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(255, "Password is too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character")
    .refine((password) => !/\s/.test(password), {
      message: "Password cannot contain spaces",
    }),
});