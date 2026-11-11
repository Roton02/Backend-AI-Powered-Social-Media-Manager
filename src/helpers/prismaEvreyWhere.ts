import "../loadEnv";
import { PrismaClient } from '@prisma/client';

const prismaEveryWhere = new PrismaClient({
  omit: {
    user: {
      password: true,
    },
  },

});
export default prismaEveryWhere;
