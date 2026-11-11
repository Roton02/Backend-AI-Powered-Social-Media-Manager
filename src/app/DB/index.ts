import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import config from "../../config";
import prisma from "../../shared/prisma";

const seedSuperAdmin = async () => {
  try {
    const email = "admin@gmail.com";
    const phone = "01569140345";

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ role: UserRole.Admin }, { email }, { phone }],
      },
    });

    if (existing) return;

    const password = await bcrypt.hash(
      config.super_admin_password as string,
      Number(config.bcrypt_salt_rounds) || 12
    );

    await prisma.user.create({
      data: {
        userName: "Super Admin",
        email,
        phone,
        password,
        role: UserRole.Admin,
      },
    });
    console.log("🦸 Super Admin created successfully.");
  } catch (error) {
    console.error("Error seeding Super Admin:", error);
  }
};

export default seedSuperAdmin;
