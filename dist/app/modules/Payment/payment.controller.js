"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentControllers = void 0;
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const payment_service_1 = require("./payment.service");
const createPlan = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield payment_service_1.paymentServices.createPlanInStripe(req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Plan created successfully',
        data: result,
    });
}));
const getAllPlans = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield payment_service_1.paymentServices.allPlansFromDB();
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'All plans fetched successfully',
        data: result,
    });
}));
const getActivePlans = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield payment_service_1.paymentServices.activePlansFromDB();
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Active plans fetched successfully',
        data: result,
    });
}));
const singlePlan = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { planId } = req.params;
    const result = yield payment_service_1.paymentServices.getPlanFromDB(planId);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Plan fetched successfully',
        data: result,
    });
}));
const editPlanInStripe = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { planId } = req.params;
    const result = yield payment_service_1.paymentServices.editPlanInStripe(req.body, planId);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Plan updated successfully',
        data: result,
    });
}));
const deletePlan = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { planId } = req.params;
    const result = yield payment_service_1.paymentServices.deletePlanInStripe(planId);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Plan deactivated successfully',
        data: result,
    });
}));
const totalEarnings = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield payment_service_1.paymentServices.totalEarningsFromStripe();
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Total earnings fetched successfully',
        data: result,
    });
}));
const createSubcription = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    const result = yield payment_service_1.paymentServices.createSubscriptionInStripe(userId, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Redirect to Stripe to complete payment",
        data: result,
    });
}));
const confirmCheckoutSubscription = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield payment_service_1.paymentServices.confirmCheckoutSubscription(req.user.id, req.body.sessionId);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Subscription activated successfully",
        data: result,
    });
}));
const cancelSubscription = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { subscriptionId } = req.body;
    const userId = req.user.id;
    yield payment_service_1.paymentServices.cancelSubscriptionInDB(subscriptionId, userId);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Subscription cancel successfull',
        data: '',
    });
}));
const updateSubscription = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    const result = yield payment_service_1.paymentServices.updateSubscriptionInStripe(req.body, userId);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Subscription update successfull',
        data: result,
    });
}));
const handelPaymentWebhook = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield payment_service_1.paymentServices.handelPaymentWebhook(req);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'done',
        data: result,
    });
}));
const getMySubscription = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield payment_service_1.paymentServices.getMySubscriptionFromDB(req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: result.message,
        data: result,
    });
}));
const allPayments = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield payment_service_1.paymentServices.getPaymentsFromDB(req);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Payments fetched successfully',
        data: result,
    });
}));
const getPaymentDetails = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { paymentId } = req.params;
    const result = yield payment_service_1.paymentServices.getPaymentDetailsFromDB(paymentId);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Payment details fetched successfully',
        data: result,
    });
}));
const allSubscriptions = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield payment_service_1.paymentServices.getSubscriptionsFromDB(req);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Subscriptions fetched successfully',
        data: result,
    });
}));
exports.paymentControllers = {
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
