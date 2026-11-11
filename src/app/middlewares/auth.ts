import { NextFunction, Request, Response } from "express";

import prisma from "../../shared/prisma";
import config from "../../config";
import { Secret } from "jsonwebtoken";

import httpStatus from "http-status";
import { jwtHelpers } from "../../helpers/jwtHelpers";
import ApiError from "../../errors/ApiErrors";

const auth = (...roles: string[]) => {
  return async (
    req: Request & { user?: any },
    res: Response,
    next: NextFunction
  ) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");

      if (!token) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "Please sign in to continue.");
      }

      const verifiedUser = jwtHelpers.verifyToken(
        token,
        config.jwt.jwt_secret as Secret
      );

      if (!verifiedUser.id || verifiedUser.purpose) throw new ApiError(401, "Please sign in to continue.");
      const user = await prisma.user.findUnique({ where: { id: verifiedUser.id }, select: { id: true, role: true, status: true } });
      if (!user || user.status !== "Active") throw new ApiError(401, "Please sign in to continue.");
      verifiedUser.role = user.role;
      req.user = verifiedUser;

      if (roles.length && !roles.includes(verifiedUser.role)) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          "You don't have permission to do this."
        );
      }
      next();
    } catch (err: any) {
      if (err instanceof ApiError) {
        return next(err);
      }
      if (err?.name === "TokenExpiredError") {
        return next(
          new ApiError(
            httpStatus.UNAUTHORIZED,
            "Your session has expired. Please sign in again."
          )
        );
      }
      if (err?.name === "JsonWebTokenError" || err?.name === "NotBeforeError") {
        return next(
          new ApiError(
            httpStatus.UNAUTHORIZED,
            "Invalid session. Please sign in again."
          )
        );
      }
      next(err);
    }
  };
};

export default auth;
