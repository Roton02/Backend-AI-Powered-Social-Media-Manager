import { Prisma } from "@prisma/client";
import { IGenericErrorMessage } from "../interfaces/error";

const FIELD_LABELS: Record<string, string> = {
  email: "email",
  phone: "phone number",
  slug: "slug",
};

const handleClientError = (error: Prisma.PrismaClientKnownRequestError) => {
  let errors: IGenericErrorMessage[] = [];
  let message = "Something went wrong while saving this data.";
  let statusCode = 400;

  if (error.code === "P2025") {
    statusCode = 404;
    message = "We couldn't find that record.";
    errors = [{ path: "", message }];
  } else if (error.code === "P2002") {
    statusCode = 409;
    const target = Array.isArray(error.meta?.target)
      ? String((error.meta?.target as string[])[0] || "")
      : String(error.meta?.target || "");
    const label = FIELD_LABELS[target] || target || "value";
    message = `This ${label} is already in use.`;
    errors = [{ path: target, message }];
  } else if (error.code === "P2003") {
    statusCode = 400;
    message = "This item is linked to other records, so it cannot be changed that way.";
    errors = [{ path: "", message }];
  }

  return {
    statusCode,
    message,
    errorMessages: errors,
  };
};

export default handleClientError;
