import { z } from "zod";

const authLoginSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const authValidation = {
  authLoginSchema,
};
