import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[Prisma Config] WARNING: DATABASE_URL is not set in environment!");
}

const adapter = new PrismaPg({
  connectionString: connectionString || "",
});

const prisma = new PrismaClient({
  adapter,
});

export default prisma;