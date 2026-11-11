import prisma from "../shared/prisma";

export const getOrCreateDirectRoom = async (
  userAId: string,
  userBId: string
) => {
  const existing = await prisma.room.findFirst({
    where: {
      OR: [
        { user1Id: userAId, user2Id: userBId },
        { user1Id: userBId, user2Id: userAId },
      ],
    },
  });

  if (existing) return existing;

  return prisma.room.create({
    data: { user1Id: userAId, user2Id: userBId },
  });
};

export const assertRoomParticipant = (
  room: { user1Id: string | null; user2Id: string | null },
  userId: string,
  role?: string
) => {
  if (role === "Admin") return true;
  return room.user1Id === userId || room.user2Id === userId;
};
