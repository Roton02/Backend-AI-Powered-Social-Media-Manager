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
exports.paymentServices = void 0;
const config_1 = __importDefault(require("../../../config"));
const stripe_1 = __importDefault(require("../../../helpers/stripe"));
const prismaEvreyWhere_1 = __importDefault(require("../../../helpers/prismaEvreyWhere"));
const ApiErrors_1 = __importDefault(require("../../../errors/ApiErrors"));
const pagination_1 = require("../../../shared/pagination");
const prisma_1 = __importDefault(require("../../../shared/prisma"));
const automation_service_1 = require("../automation/automation.service");
const getUserStripeCustomer = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const user = yield prisma_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!user) {
        throw new ApiErrors_1.default(404, "User not found");
    }
    let customerId = user.stripeCustomerId;
    if (!customerId) {
        const customer = yield stripe_1.default.customers.create({
            email: (_a = user.email) !== null && _a !== void 0 ? _a : undefined,
            name: user.userName,
            phone: user.phone,
        });
        customerId = customer.id;
        yield prisma_1.default.user.update({
            where: { id: user.id },
            data: { stripeCustomerId: customerId },
        });
    }
    return { customerId, user };
});
const resolveWorkspaceIdForUser = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const membership = yield prisma_1.default.workspaceMember.findFirst({
        where: { userId, role: "owner" },
    });
    const fallback = membership !== null && membership !== void 0 ? membership : (yield prisma_1.default.workspaceMember.findFirst({ where: { userId } }));
    if (!fallback) {
        throw new ApiErrors_1.default(400, "No workspace found for this account. Create a workspace before subscribing.");
    }
    return fallback.workspaceId;
});
//plan create
const createPlanInStripe = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { planType, description, amount, currency, interval } = payload;
    // Step 1: Create a product
    const product = yield stripe_1.default.products.create({
        name: planType,
        description,
    });
    // Step 2: Create a price for the product
    const price = yield stripe_1.default.prices.create({
        unit_amount: amount * 100,
        currency,
        product: product.id,
        recurring: {
            interval: interval,
        },
    });
    const planInfo = yield prismaEvreyWhere_1.default.plan.create({
        data: Object.assign(Object.assign({}, payload), { productId: product.id, priceId: price.id }),
    });
    console.log(product, price);
    return planInfo;
});
const deletePlanInStripe = (planId) => __awaiter(void 0, void 0, void 0, function* () {
    const plan = yield prismaEvreyWhere_1.default.plan.findUnique({
        where: { id: planId },
    });
    if (!plan) {
        throw new ApiErrors_1.default(404, "Plan not found");
    }
    try {
        yield stripe_1.default.products.update(plan.productId, { active: false });
    }
    catch (error) {
        console.log("Could not deactivate stripe product:", error);
    }
    return prismaEvreyWhere_1.default.plan.update({
        where: { id: planId },
        data: { active: false },
    });
});
//get all products
const allPlansFromDB = () => __awaiter(void 0, void 0, void 0, function* () {
    const plans = yield prismaEvreyWhere_1.default.plan.findMany({
        orderBy: { createdAt: "desc" },
    });
    return plans;
});
//get active plan
const activePlansFromDB = () => __awaiter(void 0, void 0, void 0, function* () {
    const plans = yield prismaEvreyWhere_1.default.plan.findMany({
        where: { active: true },
        orderBy: { createdAt: "desc" },
    });
    return plans;
});
//get single product
const getPlanFromDB = (planId) => __awaiter(void 0, void 0, void 0, function* () {
    const plan = yield prismaEvreyWhere_1.default.plan.findUnique({
        where: { id: planId },
    });
    return plan;
});
//edit plan
const editPlanInStripe = (payload, planId) => __awaiter(void 0, void 0, void 0, function* () {
    const plan = yield prismaEvreyWhere_1.default.plan.findUnique({
        where: { id: planId },
    });
    if (!plan) {
        throw new ApiErrors_1.default(404, "Plan not found");
    }
    const { planType, active, description, feature, amount, currency, interval } = payload;
    const stripeProductUpdate = {};
    if (planType !== undefined)
        stripeProductUpdate.name = planType;
    if (active !== undefined)
        stripeProductUpdate.active = active;
    if (description !== undefined)
        stripeProductUpdate.description = description;
    if (Object.keys(stripeProductUpdate).length > 0) {
        yield stripe_1.default.products.update(plan.productId, stripeProductUpdate);
    }
    let priceId = plan.priceId;
    const pricingChanged = amount !== undefined || currency !== undefined || interval !== undefined;
    if (pricingChanged) {
        const newAmount = amount !== null && amount !== void 0 ? amount : plan.amount;
        const newCurrency = currency !== null && currency !== void 0 ? currency : plan.currency;
        const newInterval = interval !== null && interval !== void 0 ? interval : plan.interval;
        const price = yield stripe_1.default.prices.create({
            unit_amount: newAmount * 100,
            currency: newCurrency,
            product: plan.productId,
            recurring: {
                interval: newInterval,
            },
        });
        priceId = price.id;
        try {
            yield stripe_1.default.prices.update(plan.priceId, { active: false });
        }
        catch (error) {
            console.log("Could not deactivate old price:", error);
        }
    }
    const dbUpdate = {};
    if (planType !== undefined)
        dbUpdate.planType = planType;
    if (active !== undefined)
        dbUpdate.active = active;
    if (description !== undefined)
        dbUpdate.description = description;
    if (feature !== undefined)
        dbUpdate.feature = feature;
    if (amount !== undefined)
        dbUpdate.amount = amount;
    if (currency !== undefined)
        dbUpdate.currency = currency;
    if (interval !== undefined)
        dbUpdate.interval = interval;
    if (pricingChanged)
        dbUpdate.priceId = priceId;
    if (Object.keys(dbUpdate).length === 0) {
        throw new ApiErrors_1.default(400, "No valid fields to update");
    }
    const updatedPlan = yield prismaEvreyWhere_1.default.plan.update({
        where: { id: planId },
        data: dbUpdate,
    });
    return updatedPlan;
});
//total earnings from subscriptions
const totalEarningsFromStripe = () => __awaiter(void 0, void 0, void 0, function* () {
    let totalAmount = 0;
    let hasMore = true;
    let startingAfter = null;
    while (hasMore) {
        const invoices = yield stripe_1.default.invoices.list({
            limit: 10000, // Adjust the number of invoices per request if needed
            starting_after: startingAfter || undefined,
        });
        // Sum the total amount from each invoice
        invoices.data.forEach((invoice) => {
            totalAmount += invoice.amount_paid;
        });
        hasMore = invoices.has_more;
        if (hasMore) {
            startingAfter = invoices.data[invoices.data.length - 1].id;
        }
    }
    return {
        totalAmount: totalAmount / 100,
    };
});
const technicianAppOrigin = (requested) => {
    const fallback = process.env.TECHNICIAN_APP_URL || "http://localhost:3003";
    if (!requested)
        return fallback.replace(/\/$/, "");
    try {
        const url = new URL(requested);
        if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
            return url.origin;
        }
        const allowed = new URL(fallback);
        if (url.host === allowed.host)
            return url.origin;
    }
    catch (_a) {
        /* use fallback */
    }
    return fallback.replace(/\/$/, "");
};
const persistCheckoutSubscription = (session) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const stripeSubscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : (_a = session.subscription) === null || _a === void 0 ? void 0 : _a.id;
    if (!stripeSubscriptionId) {
        throw new ApiErrors_1.default(400, "Checkout did not create a subscription.");
    }
    const existing = yield prismaEvreyWhere_1.default.subscription.findFirst({
        where: { subscriptionId: stripeSubscriptionId },
    });
    if (existing)
        return existing;
    const userId = (_b = session.metadata) === null || _b === void 0 ? void 0 : _b.userId;
    if (!userId) {
        throw new ApiErrors_1.default(400, "Checkout session is missing user information.");
    }
    const workspaceId = ((_c = session.metadata) === null || _c === void 0 ? void 0 : _c.workspaceId) || (yield resolveWorkspaceIdForUser(userId));
    const stripeSubscription = yield stripe_1.default.subscriptions.retrieve(stripeSubscriptionId, { expand: ["items.data.price", "default_payment_method"] });
    const price = (_d = stripeSubscription.items.data[0]) === null || _d === void 0 ? void 0 : _d.price;
    const paymentMethodId = (typeof stripeSubscription.default_payment_method === "string"
        ? stripeSubscription.default_payment_method
        : (_e = stripeSubscription.default_payment_method) === null || _e === void 0 ? void 0 : _e.id) || "checkout";
    yield prismaEvreyWhere_1.default.subscription.deleteMany({
        where: { userId, subscriptionId: { not: stripeSubscriptionId } },
    });
    const alreadyPersisted = yield prismaEvreyWhere_1.default.subscription.findFirst({
        where: { subscriptionId: stripeSubscriptionId },
    });
    if (alreadyPersisted)
        return alreadyPersisted;
    const createdSubscription = yield prismaEvreyWhere_1.default.subscription.create({
        data: {
            paymentMethodId,
            userId,
            workspaceId,
            priceId: ((_f = session.metadata) === null || _f === void 0 ? void 0 : _f.priceId) || (price === null || price === void 0 ? void 0 : price.id) || "",
            subscriptionId: stripeSubscriptionId,
            interval: ((_g = price === null || price === void 0 ? void 0 : price.recurring) === null || _g === void 0 ? void 0 : _g.interval) ||
                ((_h = session.metadata) === null || _h === void 0 ? void 0 : _h.interval) ||
                "month",
            planType: ((_j = session.metadata) === null || _j === void 0 ? void 0 : _j.planType) || "Plan",
            price: (price === null || price === void 0 ? void 0 : price.unit_amount) ? price.unit_amount / 100 : undefined,
            status: "ACTIVE",
        },
    });
    // Trigger n8n automation for subscription activated
    yield automation_service_1.automationService.triggerEvent(workspaceId, "subscription.activated", {
        userId,
        subscriptionId: createdSubscription.id,
        planType: createdSubscription.planType,
    });
    return createdSubscription;
});
//create subscription
const createSubscriptionInStripe = (userId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { priceId, planType, successOrigin } = payload;
    if (!priceId) {
        throw new ApiErrors_1.default(400, "A plan price is required.");
    }
    const userInfo = yield prismaEvreyWhere_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!userInfo) {
        throw new ApiErrors_1.default(404, "User not found");
    }
    const activeSubscription = yield prismaEvreyWhere_1.default.subscription.findFirst({
        where: { userId: userInfo.id, status: "ACTIVE" },
    });
    if (activeSubscription) {
        throw new ApiErrors_1.default(409, "You already have an active subscription");
    }
    const { customerId } = yield getUserStripeCustomer(userId);
    const origin = technicianAppOrigin(successOrigin);
    const session = yield stripe_1.default.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: userId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/subscribe?success=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/subscribe?canceled=1`,
        metadata: {
            userId,
            priceId,
            planType: planType || "Plan",
        },
        subscription_data: {
            metadata: {
                userId,
                priceId,
                planType: planType || "Plan",
            },
        },
    });
    if (!session.url) {
        throw new ApiErrors_1.default(400, "Could not start Stripe checkout.");
    }
    return { url: session.url, sessionId: session.id };
});
const confirmCheckoutSubscription = (userId, sessionId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!sessionId) {
        throw new ApiErrors_1.default(400, "Checkout session is required.");
    }
    const session = yield stripe_1.default.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
    });
    if (((_a = session.metadata) === null || _a === void 0 ? void 0 : _a.userId) && session.metadata.userId !== userId) {
        throw new ApiErrors_1.default(403, "This checkout session belongs to another account.");
    }
    if (session.status !== "complete" && session.payment_status !== "paid") {
        throw new ApiErrors_1.default(400, "Payment is not complete yet. Try again in a moment.");
    }
    if (session.mode && session.mode !== "subscription") {
        throw new ApiErrors_1.default(400, "This checkout session is not a subscription.");
    }
    return persistCheckoutSubscription(session);
});
const cancelSubscriptionInDB = (subscriptionId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const userInfo = yield prismaEvreyWhere_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!userInfo) {
        throw new ApiErrors_1.default(404, "User not found");
    }
    const subscriptionData = yield prismaEvreyWhere_1.default.subscription.findFirst({
        where: { userId: userId, subscriptionId: subscriptionId },
    });
    if (!subscriptionData) {
        throw new ApiErrors_1.default(404, "Subscription not found");
    }
    yield stripe_1.default.subscriptions.cancel(subscriptionId);
    yield prismaEvreyWhere_1.default.subscription.delete({
        where: { id: subscriptionData.id },
    });
    return;
});
const updateSubscriptionInStripe = (payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const { paymentMethodId, priceId, subscriptionId } = payload;
    const userInfo = yield prismaEvreyWhere_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!userInfo) {
        throw new ApiErrors_1.default(404, "User not found");
    }
    const isExistingSubscription = yield prismaEvreyWhere_1.default.subscription.findFirst({
        where: { userId: userId, subscriptionId: subscriptionId },
    });
    if (!isExistingSubscription) {
        throw new ApiErrors_1.default(404, "Subscription not found");
    }
    const { customerId } = yield getUserStripeCustomer(userId);
    if (paymentMethodId) {
        yield stripe_1.default.paymentMethods.attach(paymentMethodId, {
            customer: customerId,
        });
        yield stripe_1.default.customers.update(customerId, {
            invoice_settings: { default_payment_method: paymentMethodId },
        });
    }
    try {
        yield stripe_1.default.subscriptions.cancel(subscriptionId);
    }
    catch (error) {
        console.log(error);
    }
    let subscription;
    try {
        subscription = yield stripe_1.default.subscriptions.create({
            customer: customerId,
            items: [{ price: priceId }],
            expand: ["latest_invoice.payment_intent"],
        });
    }
    catch (error) {
        console.log(error);
    }
    const workspaceId = yield resolveWorkspaceIdForUser(userId);
    const subscriptionData = {
        paymentMethodId: paymentMethodId,
        userId: userId,
        workspaceId,
        priceId: priceId,
        subscriptionId: subscription.id,
        interval: subscription.plan.interval,
        planType: payload.planType,
    };
    yield prismaEvreyWhere_1.default.subscription.deleteMany({
        where: {
            subscriptionId: subscriptionId,
        },
    });
    const updatedSubscription = yield prismaEvreyWhere_1.default.subscription.create({
        data: subscriptionData,
    });
    return updatedSubscription;
});
//using for webhook
const deleteSubscriptionByStripeId = (subscriptionId) => __awaiter(void 0, void 0, void 0, function* () {
    const existingSubscription = yield prismaEvreyWhere_1.default.subscription.findFirst({
        where: { subscriptionId },
    });
    yield prismaEvreyWhere_1.default.subscription.deleteMany({
        where: { subscriptionId },
    });
    if (existingSubscription) {
        // removed legacy technicianProfile update
    }
});
const subscriptionIdFromEvent = (event) => {
    var _a, _b;
    const object = event.data.object;
    if (event.type.startsWith("customer.subscription.")) {
        return typeof object.id === "string" ? object.id : null;
    }
    if (event.type === "invoice.payment_failed") {
        if (typeof object.subscription === "string")
            return object.subscription;
        const parent = object.parent;
        return (_b = (_a = parent === null || parent === void 0 ? void 0 : parent.subscription_details) === null || _a === void 0 ? void 0 : _a.subscription) !== null && _b !== void 0 ? _b : null;
    }
    return null;
};
const handelPaymentWebhook = (req) => __awaiter(void 0, void 0, void 0, function* () {
    const sig = req.headers["stripe-signature"];
    const secret = config_1.default.stripe.webhook_secret;
    if (!sig || !secret) {
        throw new ApiErrors_1.default(400, "Missing Stripe webhook signature or secret");
    }
    const event = stripe_1.default.webhooks.constructEvent(req.body, sig, secret);
    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        if (session.mode === "subscription") {
            yield persistCheckoutSubscription(session);
        }
    }
    if (event.type === "invoice.payment_failed" ||
        event.type === "customer.subscription.deleted") {
        const subscriptionId = subscriptionIdFromEvent(event);
        if (subscriptionId) {
            yield deleteSubscriptionByStripeId(subscriptionId);
        }
    }
    return { received: true, type: event.type };
});
const getMySubscriptionFromDB = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const subscription = yield prismaEvreyWhere_1.default.subscription.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
    });
    if (!subscription) {
        return {
            hasSubscription: false,
            subscription: null,
            message: "No active subscription. Subscribe to a plan to work on the platform.",
        };
    }
    return {
        hasSubscription: subscription.status === "ACTIVE",
        subscription: {
            id: subscription.id,
            planType: subscription.planType,
            status: subscription.status,
            interval: subscription.interval,
            price: subscription.price,
            priceId: subscription.priceId,
            subscriptionId: subscription.subscriptionId,
            createdAt: subscription.createdAt,
        },
        message: subscription.status === "ACTIVE"
            ? "Subscription is active."
            : "Subscription is not active. Please renew or subscribe again.",
    };
});
const getPaymentsFromDB = (req) => __awaiter(void 0, void 0, void 0, function* () {
    const { page, limit, skip } = (0, pagination_1.paginationHelper)(req.query);
    const [payments, totalCount] = yield Promise.all([
        prisma_1.default.payment.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        userName: true,
                        email: true,
                        phone: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma_1.default.payment.count(),
    ]);
    return {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        payments,
    };
});
const getPaymentDetailsFromDB = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const payment = yield prisma_1.default.payment.findUnique({
        where: { id },
        include: {
            user: {
                select: {
                    id: true,
                    userName: true,
                    email: true,
                    phone: true,
                },
            },
        },
    });
    if (!payment) {
        throw new ApiErrors_1.default(404, "Payment not found");
    }
    return payment;
});
const getSubscriptionsFromDB = (req) => __awaiter(void 0, void 0, void 0, function* () {
    const { page, limit, skip } = (0, pagination_1.paginationHelper)(req.query);
    const [subscriptions, totalCount] = yield Promise.all([
        prismaEvreyWhere_1.default.subscription.findMany({
            select: {
                id: true,
                planType: true,
                status: true,
                paymentMethodId: true,
                interval: true,
                priceId: true,
                price: true,
                subscriptionId: true,
                user: {
                    select: {
                        id: true,
                        userName: true,
                        email: true,
                    },
                },
                createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prismaEvreyWhere_1.default.subscription.count(),
    ]);
    return {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        subscriptions,
    };
});
exports.paymentServices = {
    createPlanInStripe,
    allPlansFromDB,
    activePlansFromDB,
    getPlanFromDB,
    editPlanInStripe,
    deletePlanInStripe,
    totalEarningsFromStripe,
    handelPaymentWebhook,
    createSubscriptionInStripe,
    confirmCheckoutSubscription,
    updateSubscriptionInStripe,
    cancelSubscriptionInDB,
    getMySubscriptionFromDB,
    getPaymentsFromDB,
    getPaymentDetailsFromDB,
    getSubscriptionsFromDB,
};
