"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const handleZodError = (error) => {
    const errors = error.issues.map((issue) => {
        return {
            path: issue === null || issue === void 0 ? void 0 : issue.path[issue.path.length - 1],
            message: issue === null || issue === void 0 ? void 0 : issue.message,
        };
    });
    const statusCode = 400;
    const message = errors.length === 0
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
exports.default = handleZodError;
