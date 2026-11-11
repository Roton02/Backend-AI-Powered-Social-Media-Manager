import "../loadEnv";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: [
    {
      emit: "event",
      level: "error",
    },
  ],
});

// Query errors may contain credentials or customer data; never log their raw payload.
prisma.$on("error", () => {
  if (process.env.NODE_ENV !== "test") console.error("Database operation failed.");
});

export default prisma;
