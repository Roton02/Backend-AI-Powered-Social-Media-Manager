import { ZodError, ZodIssue } from "zod";
import { IGenericErrorResponse } from "../interfaces/common";
import { IGenericErrorMessage } from "../interfaces/error";

const handleZodError = (error: ZodError): IGenericErrorResponse => {
  const errors: IGenericErrorMessage[] = error.issues.map((issue: ZodIssue) => {
    return {
      path: issue?.path[issue.path.length - 1],
      message: issue?.message,
    };
  });

  const statusCode = 400;
  const message =
    errors.length === 0
      ? "Please check the information you entered."
      : errors.length === 1
        ? String(errors[0].message)
        : errors.map((item) => item.message).join(" ");

  return {
    statusCode,
    message,
    errorMessages: errors,
  };
};

export default handleZodError;
