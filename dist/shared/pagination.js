"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginationHelper = void 0;
const paginationHelper = (query) => {
    let { page = 1, limit = 10, status = "" } = query;
    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;
    return { skip, limit, page, status };
};
exports.paginationHelper = paginationHelper;
