import "./loadEnv";
import express, { Application, NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import cors from "cors";
import router from "./app/routes";
import GlobalErrorHandler from "./app/middlewares/globalErrorHandler";
import path from "path";
import { paymentControllers } from "./app/modules/Payment/payment.controller";

const app: Application = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3005", credentials: true }));
app.post(
  "/api/v1/payment/webhook",
  express.raw({ type: "application/json" }),
  paymentControllers.handelPaymentWebhook
);
app.use(express.json({ limit: "10mb", verify: (req, _res, buffer) => { (req as any).rawBody = buffer; } }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/", (req: Request, res: Response) => {
  res.send({
    Message: "🎉 Welcome Nirapod Sheba Backend",
  });
});

app.use("/api/v1", router);
app.use(GlobalErrorHandler);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(httpStatus.NOT_FOUND).json({
    success: false,
    message: "API NOT FOUND!",
    error: {
      path: req.originalUrl,
      message: "Your requested path is not found!",
    },
  });
});

export default app;
