"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentRoute = void 0;
const express_1 = __importDefault(require("express"));
const auth_1 = __importDefault(require("../../middlewares/auth"));
const payment_controller_1 = require("./payment.controller");
const client_1 = require("@prisma/client");
const router = express_1.default.Router();
// -----------/ START THE PRODUCT /-------------//
router.post("/create/stripe-plan", (0, auth_1.default)(client_1.UserRole.Admin, client_1.UserRole.Admin), payment_controller_1.paymentControllers.createPlan);
router.get("/stripe-plans", payment_controller_1.paymentControllers.getAllPlans);
router.get("/active-plans", payment_controller_1.paymentControllers.getActivePlans);
router.get("/stripe-plan/:planId", payment_controller_1.paymentControllers.singlePlan);
router.patch("/update-plan/:planId", (0, auth_1.default)(client_1.UserRole.Admin, client_1.UserRole.Admin), payment_controller_1.paymentControllers.editPlanInStripe);
router.delete("/stripe-plan/:planId", (0, auth_1.default)(client_1.UserRole.Admin), payment_controller_1.paymentControllers.deletePlan);
// -----------/ END THE PRODUCT /-------------//
// GET THE EARNING
router.get("/total-earnings", (0, auth_1.default)(client_1.UserRole.Admin, client_1.UserRole.Admin), payment_controller_1.paymentControllers.totalEarnings);
// -----------/ START THE PAYMENT /-------------//
router.post("/create/stripe-subscription", (0, auth_1.default)(), payment_controller_1.paymentControllers.createSubcription);
router.post("/confirm/stripe-subscription", (0, auth_1.default)(), payment_controller_1.paymentControllers.confirmCheckoutSubscription);
router.patch("/update/stripe-subscription", (0, auth_1.default)(), payment_controller_1.paymentControllers.updateSubscription);
router.delete("/cancel/stripe-subscription", (0, auth_1.default)(), payment_controller_1.paymentControllers.cancelSubscription);
router.get("/my-subscription", (0, auth_1.default)(), payment_controller_1.paymentControllers.getMySubscription);
router.get("/payments", (0, auth_1.default)(client_1.UserRole.Admin, client_1.UserRole.Admin), payment_controller_1.paymentControllers.allPayments);
router.get("/payments/:paymentId", (0, auth_1.default)(client_1.UserRole.Admin, client_1.UserRole.Admin), payment_controller_1.paymentControllers.getPaymentDetails);
router.get("/subscriptions", (0, auth_1.default)(client_1.UserRole.Admin), payment_controller_1.paymentControllers.allSubscriptions);
exports.paymentRoute = router;
