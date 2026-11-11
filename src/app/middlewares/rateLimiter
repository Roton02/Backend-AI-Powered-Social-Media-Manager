import rateLimit from "express-rate-limit";

const rateLimiter = (minutes: number, maxRequests: number) => {
  return rateLimit({
    windowMs: minutes * 60 * 1000,
    max: maxRequests,
    message: {
      status: 429,
      message: `Too many requests. Please try again after ${minutes} minute(s)`,
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

export default rateLimiter;
