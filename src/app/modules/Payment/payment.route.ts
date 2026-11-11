import express from 'express';
import auth from '../../middlewares/auth';
import { paymentControllers } from './payment.controller';
import { UserRole } from '@prisma/client';

const router = express.Router();

// -----------/ START THE PRODUCT /-------------//

router.post(
  "/create/stripe-plan",
  auth(UserRole.Admin, UserRole.Admin),
  paymentControllers.createPlan
);
router.get("/stripe-plans", paymentControllers.getAllPlans);
router.get("/active-plans", paymentControllers.getActivePlans);
router.get("/stripe-plan/:planId", paymentControllers.singlePlan);
router.patch(
  "/update-plan/:planId",
  auth(UserRole.Admin, UserRole.Admin),
  paymentControllers.editPlanInStripe
);
router.delete(
  "/stripe-plan/:planId",
  auth(UserRole.Admin),
  paymentControllers.deletePlan
);

// -----------/ END THE PRODUCT /-------------//

// GET THE EARNING
router.get(
  "/total-earnings",
  auth(UserRole.Admin, UserRole.Admin),
  paymentControllers.totalEarnings
);

// -----------/ START THE PAYMENT /-------------//
router.post(
  "/create/stripe-subscription",
  auth(),
  paymentControllers.createSubcription
);

router.post(
  "/confirm/stripe-subscription",
  auth(),
  paymentControllers.confirmCheckoutSubscription
);

router.patch(
  "/update/stripe-subscription",
  auth(),
  paymentControllers.updateSubscription
);

router.delete(
  "/cancel/stripe-subscription",
  auth(),
  paymentControllers.cancelSubscription
);

router.get("/my-subscription", auth(), paymentControllers.getMySubscription);

router.get("/payments", auth(UserRole.Admin, UserRole.Admin), paymentControllers.allPayments);
router.get("/payments/:paymentId", auth(UserRole.Admin, UserRole.Admin), paymentControllers.getPaymentDetails);
router.get("/subscriptions", auth(UserRole.Admin), paymentControllers.allSubscriptions);

export const paymentRoute = router;