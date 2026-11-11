"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const FIELD_LABELS = {
    email: "email",
    phone: "phone number",
    slug: "slug",
};
const handleClientError = (error) => {
    var _a, _b, _c;
    let errors = [];
    let message = "Something went wrong while saving this data.";
    let statusCode = 400;
    if (error.code === "P2025") {
        statusCode = 404;
        message = "We couldn't find that record.";
        errors = [{ path: "", message }];
    }
    else if (error.code === "P2002") {
        statusCode = 409;
        const target = Array.isArray((_a = error.meta) === null || _a === void 0 ? void 0 : _a.target)
            ? String(((_b = error.meta) === null || _b === void 0 ? void 0 : _b.target)[0] || "")
            : String(((_c = error.meta) === null || _c === void 0 ? void 0 : _c.target) || "");
        const label = FIELD_LABELS[target] || target || "value";
        message = `This ${label} is already in use.`;
        errors = [{ path: target, message }];
    }
    else if (error.code === "P2003") {
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
exports.default = handleClientError;
