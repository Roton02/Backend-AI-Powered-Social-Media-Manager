"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceService = void 0;
const zod_1 = require("zod");
const ApiErrors_1 = __importDefault(require("../../../errors/ApiErrors"));
const prisma_1 = __importDefault(require("../../../shared/prisma"));
const createWorkspace = (payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, slug } = payload;
    const existingWorkspace = yield prisma_1.default.workspace.findFirst({
        where: { slug },
    });
    if (existingWorkspace) {
        throw new ApiErrors_1.default(409, "Workspace slug already exists!");
    }
    const workspace = yield prisma_1.default.workspace.create({
        data: {
            name,
            slug,
            ownerId: userId,
            members: {
                create: {
                    userId,
                    role: "owner",
                },
            },
        },
    });
    return workspace;
});
const getWorkspace = (workspaceId) => __awaiter(void 0, void 0, void 0, function* () {
    const workspace = yield prisma_1.default.workspace.findUnique({
        where: { id: workspaceId },
    });
    if (!workspace) {
        throw new ApiErrors_1.default(404, "Workspace not found!");
    }
    return workspace;
});
const updateWorkspace = (payload, workspaceId) => __awaiter(void 0, void 0, void 0, function* () {
    const workspace = yield prisma_1.default.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) {
        throw new ApiErrors_1.default(404, "Workspace not found!");
    }
    return prisma_1.default.workspace.update({
        where: { id: workspaceId },
        data: zod_1.z.object({
            name: zod_1.z.string().trim().min(1).max(100).optional(),
            slug: zod_1.z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).optional(),
            settings: zod_1.z.object({
                ai_auto_reply: zod_1.z.boolean().optional(),
                business_description: zod_1.z.string().max(4000).optional(),
                products_services: zod_1.z.string().max(4000).optional(),
                opening_hours: zod_1.z.string().max(1000).optional(),
                delivery_information: zod_1.z.string().max(4000).optional(),
                return_policy: zod_1.z.string().max(4000).optional(),
                custom_instructions: zod_1.z.string().max(2000).optional(),
            }).optional(),
        }).parse(payload),
    });
});
const addMember = (payload, workspaceId) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, role } = payload;
    const existingMember = yield prisma_1.default.workspaceMember.findUnique({
        where: {
            workspaceId_userId: {
                workspaceId,
                userId,
            },
        },
    });
    if (existingMember) {
        throw new ApiErrors_1.default(409, "User is already a member of this workspace!");
    }
    return prisma_1.default.workspaceMember.create({
        data: {
            workspaceId,
            userId,
            role,
        },
    });
});
const removeMember = (userId, workspaceId) => __awaiter(void 0, void 0, void 0, function* () {
    const membership = yield prisma_1.default.workspaceMember.findUnique({
        where: {
            workspaceId_userId: {
                workspaceId,
                userId,
            },
        },
    });
    if (!membership) {
        throw new ApiErrors_1.default(404, "Membership not found!");
    }
    return prisma_1.default.workspaceMember.delete({
        where: { id: membership.id },
    });
});
const getMyWorkspace = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const membership = yield prisma_1.default.workspaceMember.findFirst({
        where: { userId, role: "owner" },
        include: { workspace: true },
    });
    const fallback = membership !== null && membership !== void 0 ? membership : (yield prisma_1.default.workspaceMember.findFirst({
        where: { userId },
        include: { workspace: true },
    }));
    if (!fallback) {
        throw new ApiErrors_1.default(404, "No workspace found for this account");
    }
    return fallback.workspace;
});
const getWorkspaceStats = (workspaceId) => __awaiter(void 0, void 0, void 0, function* () {
    const [totalMessages, unreadMessages, pendingAIReplies, publishedPosts, failedPosts, connectedAccounts, recentRows,] = yield Promise.all([
        prisma_1.default.unifiedMessage.count({ where: { workspaceId } }),
        prisma_1.default.unifiedMessage.count({ where: { workspaceId, status: "unread" } }),
        prisma_1.default.unifiedMessage.count({ where: { workspaceId, aiProcessed: false } }),
        prisma_1.default.postStatus.count({ where: { workspaceId, status: "PUBLISHED" } }),
        prisma_1.default.postStatus.count({ where: { workspaceId, status: "FAILED" } }),
        prisma_1.default.socialAccount.count({ where: { workspaceId } }),
        prisma_1.default.postStatus.findMany({
            where: { workspaceId },
            orderBy: { createdAt: "desc" },
            take: 6,
        }),
    ]);
    const recentActivity = recentRows.map((row) => ({
        id: row.id,
        event: row.status === "PUBLISHED"
            ? "Post Published"
            : row.status === "FAILED"
                ? "Post Failed"
                : "Post Processing",
        platform: row.platform,
        time: row.createdAt.toISOString(),
        status: row.status === "PUBLISHED"
            ? "success"
            : row.status === "FAILED"
                ? "error"
                : "info",
    }));
    return {
        totalMessages,
        unreadMessages,
        pendingAIReplies,
        publishedPosts,
        failedPosts,
        connectedAccounts,
        recentActivity,
    };
});
const getMembers = (workspaceId) => __awaiter(void 0, void 0, void 0, function* () {
    const members = yield prisma_1.default.workspaceMember.findMany({
        where: { workspaceId },
        include: {
            user: {
                select: {
                    id: true,
                    userName: true,
                    email: true,
                    profileImage: true,
                    role: true,
                },
            },
        },
    });
    return members;
});
const getWorkspaceAnalytics = (workspaceId) => __awaiter(void 0, void 0, void 0, function* () {
    const since7 = new Date();
    since7.setDate(since7.getDate() - 6);
    since7.setHours(0, 0, 0, 0);
    const [messagesByPlatform, postsByPlatform, accountsByPlatform, last7Messages, last7Posts, totalProducts, totalOrders,] = yield Promise.all([
        prisma_1.default.unifiedMessage.groupBy({
            by: ["platform"],
            where: { workspaceId },
            _count: { _all: true },
        }),
        prisma_1.default.postStatus.groupBy({
            by: ["platform", "status"],
            where: { workspaceId },
            _count: { _all: true },
        }),
        prisma_1.default.socialAccount.groupBy({
            by: ["platform"],
            where: { workspaceId },
            _count: { _all: true },
        }),
        prisma_1.default.unifiedMessage.findMany({
            where: { workspaceId, timestamp: { gte: since7 } },
            select: { timestamp: true },
        }),
        prisma_1.default.postStatus.findMany({
            where: { workspaceId, createdAt: { gte: since7 } },
            select: { createdAt: true },
        }),
        prisma_1.default.product.count({ where: { workspaceId } }),
        prisma_1.default.order.count({ where: { workspaceId } }),
    ]);
    const platforms = [
        "FACEBOOK",
        "INSTAGRAM",
        "TIKTOK",
        "YOUTUBE",
        "LINKEDIN",
        "X",
    ];
    const perPlatform = platforms.map((platform) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        return ({
            platform,
            messages: (_b = (_a = messagesByPlatform.find((m) => m.platform === platform)) === null || _a === void 0 ? void 0 : _a._count._all) !== null && _b !== void 0 ? _b : 0,
            published: (_d = (_c = postsByPlatform.find((p) => p.platform === platform && p.status === "PUBLISHED")) === null || _c === void 0 ? void 0 : _c._count._all) !== null && _d !== void 0 ? _d : 0,
            failed: (_f = (_e = postsByPlatform.find((p) => p.platform === platform && p.status === "FAILED")) === null || _e === void 0 ? void 0 : _e._count._all) !== null && _f !== void 0 ? _f : 0,
            pending: (_h = (_g = postsByPlatform.find((p) => p.platform === platform && (p.status === "PENDING" || p.status === "PROCESSING"))) === null || _g === void 0 ? void 0 : _g._count._all) !== null && _h !== void 0 ? _h : 0,
            connectedAccounts: (_k = (_j = accountsByPlatform.find((a) => a.platform === platform)) === null || _j === void 0 ? void 0 : _j._count._all) !== null && _k !== void 0 ? _k : 0,
        });
    });
    const totals = {
        messages: messagesByPlatform.reduce((sum, m) => sum + m._count._all, 0),
        published: postsByPlatform.filter((p) => p.status === "PUBLISHED").reduce((s, p) => s + p._count._all, 0),
        failed: postsByPlatform.filter((p) => p.status === "FAILED").reduce((s, p) => s + p._count._all, 0),
        connectedAccounts: accountsByPlatform.reduce((sum, a) => sum + a._count._all, 0),
        products: totalProducts,
        orders: totalOrders,
    };
    const byDay = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(since7);
        d.setDate(since7.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        byDay.push({
            date: key,
            messages: last7Messages.filter((m) => m.timestamp.toISOString().slice(0, 10) === key).length,
            posts: last7Posts.filter((p) => p.createdAt.toISOString().slice(0, 10) === key).length,
        });
    }
    return { perPlatform, totals, byDay };
});
const adminListWorkspaces = () => __awaiter(void 0, void 0, void 0, function* () {
    const workspaces = yield prisma_1.default.workspace.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            owner: { select: { userName: true, email: true, phone: true } },
            plan: { select: { planType: true, amount: true, interval: true } },
        },
    });
    const enriched = yield Promise.all(workspaces.map((ws) => __awaiter(void 0, void 0, void 0, function* () {
        const [members, accounts, messages, posts] = yield Promise.all([
            prisma_1.default.workspaceMember.count({ where: { workspaceId: ws.id } }),
            prisma_1.default.socialAccount.count({ where: { workspaceId: ws.id } }),
            prisma_1.default.unifiedMessage.count({ where: { workspaceId: ws.id } }),
            prisma_1.default.postStatus.count({ where: { workspaceId: ws.id } }),
        ]);
        return Object.assign(Object.assign({}, ws), { counts: { members, accounts, messages, posts } });
    })));
    return enriched;
});
exports.workspaceService = {
    createWorkspace,
    getWorkspace,
    updateWorkspace,
    addMember,
    removeMember,
    getMembers,
    getMyWorkspace,
    getWorkspaceStats,
    getWorkspaceAnalytics,
    adminListWorkspaces,
};
