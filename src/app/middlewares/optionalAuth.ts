import { NextFunction, Request, Response } from "express";
import config from "../../config";
import { JwtPayload, Secret } from "jsonwebtoken";
import httpStatus from "http-status";
import prisma from "../../shared/prisma";
import { jwtHelpers } from "../../helpers/jwtHelpers";
import ApiError from "../../errors/ApiErrors";

const optionalAuth = (required = true, ...roles: string[]) => {
  return async (
    req: Request & { user?: JwtPayload },
    res: Response,
    next: NextFunction
  ) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");

      if (!token) {
        if (required) {
          throw new ApiError(
            httpStatus.UNAUTHORIZED,
            "Please sign in to continue."
          );
        } else {
          return next();
        }
      }

      const verifiedUser = jwtHelpers.verifyToken(
        token,
        config.jwt.jwt_secret as Secret
      );
      const { id, role } = verifiedUser;

      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
      }

      req.user = verifiedUser as JwtPayload;

      if (roles.length && !roles.includes(role)) {
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

export default optionalAuth;
