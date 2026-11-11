import { z } from "zod";

const createNotificationSchema = z.object({
  title: z.string().min(1, "Title is required."),
  message: z.string().min(1, "Message is required."),
  redirectEndpoint: z.string().optional(),
  userIds: z.array(z.string()).optional(),
  audience: z.enum(["all", "clients", "technicians"]).optional(),
});

export const notificationValidation = {
  createNotificationSchema,
};
