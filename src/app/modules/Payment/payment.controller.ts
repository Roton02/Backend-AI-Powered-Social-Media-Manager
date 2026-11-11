import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { paymentServices } from './payment.service';

const createPlan = catchAsync(async (req, res) => {
  const result = await paymentServices.createPlanInStripe(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Plan created successfully',
    data: result,
  });
});

const getAllPlans = catchAsync(async (req, res) => {
  const result = await paymentServices.allPlansFromDB();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All plans fetched successfully',
    data: result,
  });
});

const getActivePlans = catchAsync(async (req, res) => {
  const result = await paymentServices.activePlansFromDB();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Active plans fetched successfully',
    data: result,
  });
});

const singlePlan = catchAsync(async (req, res) => {
  const { planId } = req.params;
  const result = await paymentServices.getPlanFromDB(planId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Plan fetched successfully',
    data: result,
  });
});

const editPlanInStripe = catchAsync(async (req, res) => {
  const { planId } = req.params;
  const result = await paymentServices.editPlanInStripe(req.body, planId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Plan updated successfully',
    data: result,
  });
});

const deletePlan = catchAsync(async (req, res) => {
  const { planId } = req.params;
  const result = await paymentServices.deletePlanInStripe(planId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Plan deactivated successfully',
    data: result,
  });
});

const totalEarnings = catchAsync(async (req, res) => {
  const result = await paymentServices.totalEarningsFromStripe();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Total earnings fetched successfully',
    data: result,
  });
});

const createSubcription = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const result = await paymentServices.createSubscriptionInStripe(
    userId,
    req.body,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Redirect to Stripe to complete payment",
    data: result,
  });
});

const confirmCheckoutSubscription = catchAsync(async (req, res) => {
  const result = await paymentServices.confirmCheckoutSubscription(
    req.user.id,
    req.body.sessionId,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Subscription activated successfully",
    data: result,
  });
});

const cancelSubscription = catchAsync(async (req, res) => {
  const { subscriptionId } = req.body;
  const userId = req.user.id;
  await paymentServices.cancelSubscriptionInDB(subscriptionId, userId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Subscription cancel successfull',
    data: '',
  });
});

const updateSubscription = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const result = await paymentServices.updateSubscriptionInStripe(
    req.body,
    userId,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Subscription update successfull',
    data: result,
  });
});

const handelPaymentWebhook = catchAsync(async (req, res) => {
  const result = await paymentServices.handelPaymentWebhook(req);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'done',
    data: result,
  });
});

const getMySubscription = catchAsync(async (req, res) => {
  const result = await paymentServices.getMySubscriptionFromDB(req.user.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const allPayments = catchAsync(async (req, res) => {
  const result = await paymentServices.getPaymentsFromDB(req);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Payments fetched successfully',
    data: result,
  });
});

const getPaymentDetails = catchAsync(async (req, res) => {
  const { paymentId } = req.params;
  const result = await paymentServices.getPaymentDetailsFromDB(paymentId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Payment details fetched successfully',
    data: result,
  });
});

const allSubscriptions = catchAsync(async (req, res) => {
  const result = await paymentServices.getSubscriptionsFromDB(req);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Subscriptions fetched successfully',
    data: result,
  });
});

export const paymentControllers = {
  createPlan,
  getAllPlans,
  getActivePlans,
  singlePlan,
  editPlanInStripe,
  deletePlan,
  totalEarnings,
  createSubcription,
  confirmCheckoutSubscription,
  handelPaymentWebhook,
  updateSubscription,
  cancelSubscription,
  getMySubscription,
  allPayments,
  getPaymentDetails,
  allSubscriptions,
};
