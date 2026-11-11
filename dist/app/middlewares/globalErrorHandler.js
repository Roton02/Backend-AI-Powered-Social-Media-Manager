"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const http_status_1 = __importDefault(require("http-status"));
const zod_1 = require("zod");
const handleZodError_1 = __importDefault(require("../../errors/handleZodError"));
const handleClientError_1 = __importDefault(require("../../errors/handleClientError"));
const ApiErrors_1 = __importDefault(require("../../errors/ApiErrors"));
const handleStorageError_1 = require("../../errors/handleStorageError");
const GlobalErrorHandler = (error, req, res, next) => {
    let statusCode = http_status_1.default.INTERNAL_SERVER_ERROR;
    let message = error.message || "Something went wrong!";
    let errorMessages = [];
    // handle prisma client validation errors
    if (error instanceof client_1.Prisma.PrismaClientValidationError) {
        statusCode = http_status_1.default.BAD_REQUEST;
        message = "Invalid input data. Please check the request payload.";
        const errorLines = error.message.split("\n");
        const lastLine = errorLines.slice(-1)[0];
        const fieldMatch = lastLine.match(/Argument `(.+?)`:/);
        const fieldName = fieldMatch ? fieldMatch[1] : "unknown_field";
        let developerMessage = lastLine.replace(`Argument \`${fieldName}\`: `, "");
        const fieldSpecificMessages = {
            [fieldName]: `Invalid \`${fieldName}\`. Expected a nested object or array of promo codes, not a string. Example: \`${fieldName}: [{ id: 'some-id' }]\`.`,
        };
        if (fieldSpecificMessages[fieldName]) {
            developerMessage = fieldSpecificMessages[fieldName];
        }
        errorMessages.push({
            path: fieldName,
            message: developerMessage,
        });
    }
    // Handle Zod Validation Errors
    else if (error instanceof zod_1.ZodError) {
        const simplifiedError = (0, handleZodError_1.default)(error);
        statusCode = simplifiedError.statusCode;
        message = simplifiedError.message;
        errorMessages = simplifiedError.errorMessages;
    }
    // Handle Prisma Client Known Request Errors
    else if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        const simplifiedError = (0, handleClientError_1.default)(error);
        statusCode = simplifiedError.statusCode;
        message = simplifiedError.message;
        errorMessages = simplifiedError.errorMessages;
    }
    // Handle Custom ApiError
    else if (error instanceof ApiErrors_1.default) {
        statusCode = error === null || error === void 0 ? void 0 : error.statusCode;
        message = error.message;
        errorMessages = (error === null || error === void 0 ? void 0 : error.message)
            ? [
                {
                    path: "",
                    message: error === null || error === void 0 ? void 0 : error.message,
                },
            ]
            : [];
    }
    else if ((0, handleStorageError_1.isStorageSdkError)(error)) {
        const mapped = (0, handleStorageError_1.storageErrorToApiError)(error);
        statusCode = mapped.statusCode;
        message = mapped.message;
        errorMessages = [{ path: "", message: mapped.message }];
    }
    // Handle Errors
    else if (error instanceof Error) {
        message = error === null || error === void 0 ? void 0 : error.message;
        errorMessages = (error === null || error === void 0 ? void 0 : error.message)
            ? [
                {
                    path: "",
                    message: error === null || error === void 0 ? void 0 : error.message,
                },
            ]
            : [];
    }
    // Prisma Client Initialization Error
    else if (error instanceof client_1.Prisma.PrismaClientInitializationError) {
        statusCode = http_status_1.default.INTERNAL_SERVER_ERROR;
        message =
            "Failed to initialize Prisma Client. Check your database connection or Prisma configuration.";
        errorMessages = [
            {
                path: "",
                message: "Failed to initialize Prisma Client.",
            },
        ];
    }
    // Prisma Client Rust Panic Error
    else if (error instanceof client_1.Prisma.PrismaClientRustPanicError) {
        statusCode = http_status_1.default.INTERNAL_SERVER_ERROR;
        message =
            "A critical error occurred in the Prisma engine. Please try again later.";
        errorMessages = [
            {
                path: "",
                message: "Prisma Client Rust Panic Error",
            },
        ];
    }
    // Prisma Client Unknown Request Error
    else if (error instanceof client_1.Prisma.PrismaClientUnknownRequestError) {
        statusCode = http_status_1.default.INTERNAL_SERVER_ERROR;
        message = "An unknown error occurred while processing the request.";
        errorMessages = [
            {
                path: "",
                message: "Prisma Client Unknown Request Error",
            },
        ];
    }
    // Generic Error Handling (e.g., JavaScript Errors)
    else if (error instanceof SyntaxError) {
        statusCode = http_status_1.default.BAD_REQUEST;
        message = "Syntax error in the request. Please verify your input.";
        errorMessages = [
            {
                path: "",
                message: "Syntax Error",
            },
        ];
    }
    else if (error instanceof TypeError) {
        statusCode = http_status_1.default.BAD_REQUEST;
        message = "Type error in the application. Please verify your input.";
        errorMessages = [
            {
                path: "",
                message: "Type Error",
            },
        ];
    }
    else if (error instanceof ReferenceError) {
        statusCode = http_status_1.default.BAD_REQUEST;
        message = "Reference error in the application. Please verify your input.";
        errorMessages = [
            {
                path: "",
                message: "Reference Error",
            },
        ];
    }
    // Catch any other error type
    else {
        message = "An unexpected error occurred!";
        errorMessages = [
            {
                path: "",
                message: "An unexpected error occurred!",
            },
        ];
    }
    if (statusCode >= 500) {
        message = "Something went wrong. Please try again.";
        errorMessages = [];
    }
    res.status(statusCode).json({ success: false, message, errorMessages });
};
exports.default = GlobalErrorHandler;
