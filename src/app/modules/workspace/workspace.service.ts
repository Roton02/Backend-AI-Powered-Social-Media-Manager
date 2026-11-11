import { Prisma, Workspace, WorkspaceMember } from "@prisma/client";
import { z } from "zod";
import ApiError from "../../../errors/ApiErrors";
import prisma from "../../../shared/prisma";

const createWorkspace = async (payload: Prisma.WorkspaceCreateInput, userId: string) => {
  const { name, slug } = payload;

  const existingWorkspace = await prisma.workspace.findFirst({
    where: { slug },
  });

  if (existingWorkspace) {
    throw new ApiError(409, "Workspace slug already exists!");
  }

  const workspace = await prisma.workspace.create({
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
};

const getWorkspace = async (workspaceId: string) => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace) {
    throw new ApiError(404, "Workspace not found!");
  }

  return workspace;
};

const updateWorkspace = async (payload: Prisma.WorkspaceUpdateInput, workspaceId: string) => {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) {
    throw new ApiError(404, "Workspace not found!");
  }

  return prisma.workspace.update({
    where: { id: workspaceId },
    data: z.object({
      name: z.string().trim().min(1).max(100).optional(),
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).optional(),
      settings: z.object({
        ai_auto_reply: z.boolean().optional(),
        business_description: z.string().max(4000).optional(),
        products_services: z.string().max(4000).optional(),
        opening_hours: z.string().max(1000).optional(),
        delivery_information: z.string().max(4000).optional(),
        return_policy: z.string().max(4000).optional(),
        custom_instructions: z.string().max(2000).optional(),
      }).optional(),
    }).parse(payload),
  });
};

const addMember = async (payload: { userId: string; role: string }, workspaceId: string) => {
  const { userId, role } = payload;

  const existingMember = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });

  if (existingMember) {
    throw new ApiError(409, "User is already a member of this workspace!");
  }

  return prisma.workspaceMember.create({
    data: {
      workspaceId,
      userId,
      role,
    },
  });
};

const removeMember = async (userId: string, workspaceId: string) => {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });

  if (!membership) {
    throw new ApiError(404, "Membership not found!");
  }

  return prisma.workspaceMember.delete({
    where: { id: membership.id },
  });
};

const getMyWorkspace = async (userId: string) => {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, role: "owner" },
    include: { workspace: true },
  });
  const fallback =
    membership ??
    (await prisma.workspaceMember.findFirst({
      where: { userId },
      include: { workspace: true },
    }));
  if (!fallback) {
    throw new ApiError(404, "No workspace found for this account");
  }
  return fallback.workspace;
};

const getWorkspaceStats = async (workspaceId: string) => {
  const [
    totalMessages,
    unreadMessages,
    pendingAIReplies,
    publishedPosts,
    failedPosts,
    connectedAccounts,
    recentRows,
  ] = await Promise.all([
    prisma.unifiedMessage.count({ where: { workspaceId } }),
    prisma.unifiedMessage.count({ where: { workspaceId, status: "unread" } }),
    prisma.unifiedMessage.count({ where: { workspaceId, aiProcessed: false } }),
    prisma.postStatus.count({ where: { workspaceId, status: "PUBLISHED" } }),
    prisma.postStatus.count({ where: { workspaceId, status: "FAILED" } }),
    prisma.socialAccount.count({ where: { workspaceId } }),
    prisma.postStatus.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  const recentActivity = recentRows.map((row) => ({
    id: row.id,
    event:
      row.status === "PUBLISHED"
        ? "Post Published"
        : row.status === "FAILED"
          ? "Post Failed"
          : "Post Processing",
    platform: row.platform,
    time: row.createdAt.toISOString(),
    status:
      row.status === "PUBLISHED"
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
};

const getMembers = async (workspaceId: string) => {
  const members = await prisma.workspaceMember.findMany({
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
};

const getWorkspaceAnalytics = async (workspaceId: string) => {
  const since7 = new Date();
  since7.setDate(since7.getDate() - 6);
  since7.setHours(0, 0, 0, 0);

  const [
    messagesByPlatform,
    postsByPlatform,
    accountsByPlatform,
    last7Messages,
    last7Posts,
    totalProducts,
    totalOrders,
  ] = await Promise.all([
    prisma.unifiedMessage.groupBy({
      by: ["platform"],
      where: { workspaceId },
      _count: { _all: true },
    }),
    prisma.postStatus.groupBy({
      by: ["platform", "status"],
      where: { workspaceId },
      _count: { _all: true },
    }),
    prisma.socialAccount.groupBy({
      by: ["platform"],
      where: { workspaceId },
      _count: { _all: true },
    }),
    prisma.unifiedMessage.findMany({
      where: { workspaceId, timestamp: { gte: since7 } },
      select: { timestamp: true },
    }),
    prisma.postStatus.findMany({
      where: { workspaceId, createdAt: { gte: since7 } },
      select: { createdAt: true },
    }),
    prisma.product.count({ where: { workspaceId } }),
    prisma.order.count({ where: { workspaceId } }),
  ]);

  const platforms = [
    "FACEBOOK",
    "INSTAGRAM",
    "TIKTOK",
    "YOUTUBE",
    "LINKEDIN",
    "X",
  ] as const;

  const perPlatform = platforms.map((platform) => ({
    platform,
    messages: messagesByPlatform.find((m) => m.platform === platform)?._count._all ?? 0,
    published:
      postsByPlatform.find((p) => p.platform === platform && p.status === "PUBLISHED")?._count._all ?? 0,
    failed:
      postsByPlatform.find((p) => p.platform === platform && p.status === "FAILED")?._count._all ?? 0,
    pending:
      postsByPlatform.find((p) => p.platform === platform && (p.status === "PENDING" || p.status === "PROCESSING"))?._count._all ?? 0,
    connectedAccounts: accountsByPlatform.find((a) => a.platform === platform)?._count._all ?? 0,
  }));

  const totals = {
    messages: messagesByPlatform.reduce((sum, m) => sum + m._count._all, 0),
    published: postsByPlatform.filter((p) => p.status === "PUBLISHED").reduce((s, p) => s + p._count._all, 0),
    failed: postsByPlatform.filter((p) => p.status === "FAILED").reduce((s, p) => s + p._count._all, 0),
    connectedAccounts: accountsByPlatform.reduce((sum, a) => sum + a._count._all, 0),
    products: totalProducts,
    orders: totalOrders,
  };

  const byDay: { date: string; messages: number; posts: number }[] = [];
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
};

const adminListWorkspaces = async () => {
  const workspaces = await prisma.workspace.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { userName: true, email: true, phone: true } },
      plan: { select: { planType: true, amount: true, interval: true } },
    },
  });

  const enriched = await Promise.all(
    workspaces.map(async (ws) => {
      const [members, accounts, messages, posts] = await Promise.all([
        prisma.workspaceMember.count({ where: { workspaceId: ws.id } }),
        prisma.socialAccount.count({ where: { workspaceId: ws.id } }),
        prisma.unifiedMessage.count({ where: { workspaceId: ws.id } }),
        prisma.postStatus.count({ where: { workspaceId: ws.id } }),
      ]);
      return { ...ws, counts: { members, accounts, messages, posts } };
    })
  );

  return enriched;
};

export const workspaceService = {
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
