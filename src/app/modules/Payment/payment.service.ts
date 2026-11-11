import { Request } from "express";
import Stripe from "stripe";
import config from "../../../config";
import stripe from "../../../helpers/stripe";
import prismaEveryWhere from "../../../helpers/prismaEvreyWhere";
import { Plan, Subscription } from "@prisma/client";
import ApiError from "../../../errors/ApiErrors";
import { paginationHelper } from "../../../shared/pagination";
import prisma from "../../../shared/prisma";
import { automationService } from "../automation/automation.service";

const getUserStripeCustomer = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  let customerId = user.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.userName,
      phone: user.phone,
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  return { customerId, user };
};

const resolveWorkspaceIdForUser = async (userId: string) => {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, role: "owner" },
  });
  const fallback =
    membership ??
    (await prisma.workspaceMember.findFirst({ where: { userId } }));
  if (!fallback) {
    throw new ApiError(
      400,
      "No workspace found for this account. Create a workspace before subscribing."
    );
  }
  return fallback.workspaceId;
};
//plan create
const createPlanInStripe = async (payload: Plan) => {
  const { planType, description, amount, currency, interval } = payload;

  // Step 1: Create a product
  const product = await stripe.products.create({
    name: planType,
    description,
  });

  // Step 2: Create a price for the product
  const price = await stripe.prices.create({
    unit_amount: amount * 100,
    currency,
    product: product.id,
    recurring: {
      interval: interval,
    },
  });

  const planInfo = await prismaEveryWhere.plan.create({
    data: { ...payload, productId: product.id, priceId: price.id },
  });
  console.log(product, price);

  return planInfo;
};

const deletePlanInStripe = async (planId: string) => {
  const plan = await prismaEveryWhere.plan.findUnique({
    where: { id: planId },
  });
  if (!plan) {
    throw new ApiError(404, "Plan not found");
  }

  try {
    await stripe.products.update(plan.productId, { active: false });
  } catch (error) {
    console.log("Could not deactivate stripe product:", error);
  }

  return prismaEveryWhere.plan.update({
    where: { id: planId },
    data: { active: false },
  });
};

//get all products
const allPlansFromDB = async () => {
  const plans = await prismaEveryWhere.plan.findMany({
    orderBy: { createdAt: "desc" },
  });
  return plans;
};

//get active plan
const activePlansFromDB = async () => {
  const plans = await prismaEveryWhere.plan.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });
  return plans;
};

//get single product
const getPlanFromDB = async (planId: string) => {
  const plan = await prismaEveryWhere.plan.findUnique({
    where: { id: planId },
  });
  return plan;
};

//edit plan
const editPlanInStripe = async (payload: Partial<Plan>, planId: string) => {
  const plan = await prismaEveryWhere.plan.findUnique({
    where: { id: planId },
  });
  if (!plan) {
    throw new ApiError(404, "Plan not found");
  }

  const { planType, active, description, feature, amount, currency, interval } =
    payload;

  const stripeProductUpdate: Record<string, string | boolean> = {};
  if (planType !== undefined) stripeProductUpdate.name = planType;
  if (active !== undefined) stripeProductUpdate.active = active;
  if (description !== undefined) stripeProductUpdate.description = description;

  if (Object.keys(stripeProductUpdate).length > 0) {
    await stripe.products.update(plan.productId, stripeProductUpdate);
  }

  let priceId = plan.priceId;
  const pricingChanged =
    amount !== undefined || currency !== undefined || interval !== undefined;

  if (pricingChanged) {
    const newAmount = amount ?? plan.amount;
    const newCurrency = currency ?? plan.currency;
    const newInterval = interval ?? plan.interval;

    const price = await stripe.prices.create({
      unit_amount: newAmount * 100,
      currency: newCurrency,
      product: plan.productId,
      recurring: {
        interval: newInterval,
      },
    });
    priceId = price.id;

    try {
      await stripe.prices.update(plan.priceId, { active: false });
    } catch (error) {
      console.log("Could not deactivate old price:", error);
    }
  }

  const dbUpdate: Record<string, unknown> = {};
  if (planType !== undefined) dbUpdate.planType = planType;
  if (active !== undefined) dbUpdate.active = active;
  if (description !== undefined) dbUpdate.description = description;
  if (feature !== undefined) dbUpdate.feature = feature;
  if (amount !== undefined) dbUpdate.amount = amount;
  if (currency !== undefined) dbUpdate.currency = currency;
  if (interval !== undefined) dbUpdate.interval = interval;
  if (pricingChanged) dbUpdate.priceId = priceId;

  if (Object.keys(dbUpdate).length === 0) {
    throw new ApiError(400, "No valid fields to update");
  }

  const updatedPlan = await prismaEveryWhere.plan.update({
    where: { id: planId },
    data: dbUpdate,
  });
  return updatedPlan;
};

//total earnings from subscriptions
const totalEarningsFromStripe = async () => {
  let totalAmount = 0;
  let hasMore = true;
  let startingAfter = null;

  while (hasMore) {
    const invoices: any = await stripe.invoices.list({
      limit: 10000, // Adjust the number of invoices per request if needed
      starting_after: startingAfter || undefined,
    });

    // Sum the total amount from each invoice
    invoices.data.forEach((invoice: any) => {
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
};

const technicianAppOrigin = (requested?: string) => {
  const fallback = process.env.TECHNICIAN_APP_URL || "http://localhost:3003";
  if (!requested) return fallback.replace(/\/$/, "");
  try {
    const url = new URL(requested);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return url.origin;
    }
    const allowed = new URL(fallback);
    if (url.host === allowed.host) return url.origin;
  } catch {
    /* use fallback */
  }
  return fallback.replace(/\/$/, "");
};

const persistCheckoutSubscription = async (session: Stripe.Checkout.Session) => {
  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (!stripeSubscriptionId) {
    throw new ApiError(400, "Checkout did not create a subscription.");
  }

  const existing = await prismaEveryWhere.subscription.findFirst({
    where: { subscriptionId: stripeSubscriptionId },
  });
  if (existing) return existing;

  const userId = session.metadata?.userId;
  if (!userId) {
    throw new ApiError(400, "Checkout session is missing user information.");
  }
  const workspaceId =
    session.metadata?.workspaceId || (await resolveWorkspaceIdForUser(userId));

  const stripeSubscription = await stripe.subscriptions.retrieve(
    stripeSubscriptionId,
    { expand: ["items.data.price", "default_payment_method"] }
  );
  const price = stripeSubscription.items.data[0]?.price;
  const paymentMethodId =
    (typeof stripeSubscription.default_payment_method === "string"
      ? stripeSubscription.default_payment_method
      : stripeSubscription.default_payment_method?.id) || "checkout";

  await prismaEveryWhere.subscription.deleteMany({
    where: { userId, subscriptionId: { not: stripeSubscriptionId } },
  });

  const alreadyPersisted = await prismaEveryWhere.subscription.findFirst({
    where: { subscriptionId: stripeSubscriptionId },
  });
  if (alreadyPersisted) return alreadyPersisted;

  const createdSubscription = await prismaEveryWhere.subscription.create({
    data: {
      paymentMethodId,
      userId,
      workspaceId,
      priceId: session.metadata?.priceId || price?.id || "",
      subscriptionId: stripeSubscriptionId,
      interval:
        price?.recurring?.interval ||
        session.metadata?.interval ||
        "month",
      planType: session.metadata?.planType || "Plan",
      price: price?.unit_amount ? price.unit_amount / 100 : undefined,
      status: "ACTIVE",
    },
  });

  // Trigger n8n automation for subscription activated
  await automationService.triggerEvent(workspaceId, "subscription.activated", {
    userId,
    subscriptionId: createdSubscription.id,
    planType: createdSubscription.planType,
  });

  return createdSubscription;
};

//create subscription
const createSubscriptionInStripe = async (
  userId: string,
  payload: {
    paymentMethodId?: string;
    priceId?: string;
    planType?: string;
    successOrigin?: string;
  }
) => {
  const { priceId, planType, successOrigin } = payload;

  if (!priceId) {
    throw new ApiError(400, "A plan price is required.");
  }

  const userInfo = await prismaEveryWhere.user.findUnique({
    where: { id: userId },
  });

  if (!userInfo) {
    throw new ApiError(404, "User not found");
  }

  const activeSubscription = await prismaEveryWhere.subscription.findFirst({
    where: { userId: userInfo.id, status: "ACTIVE" },
  });

  if (activeSubscription) {
    throw new ApiError(409, "You already have an active subscription");
  }

  const { customerId } = await getUserStripeCustomer(userId);
  const origin = technicianAppOrigin(successOrigin);

  const session = await stripe.checkout.sessions.create({
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
    throw new ApiError(400, "Could not start Stripe checkout.");
  }

  return { url: session.url, sessionId: session.id };
};

const confirmCheckoutSubscription = async (
  userId: string,
  sessionId: string
) => {
  if (!sessionId) {
    throw new ApiError(400, "Checkout session is required.");
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });

  if (session.metadata?.userId && session.metadata.userId !== userId) {
    throw new ApiError(403, "This checkout session belongs to another account.");
  }

  if (session.status !== "complete" && session.payment_status !== "paid") {
    throw new ApiError(400, "Payment is not complete yet. Try again in a moment.");
  }

  if (session.mode && session.mode !== "subscription") {
    throw new ApiError(400, "This checkout session is not a subscription.");
  }

  return persistCheckoutSubscription(session);
};

const cancelSubscriptionInDB = async (
  subscriptionId: string,
  userId: string
) => {
  const userInfo = await prismaEveryWhere.user.findUnique({
    where: { id: userId },
  });
  if (!userInfo) {
    throw new ApiError(404, "User not found");
  }
  const subscriptionData = await prismaEveryWhere.subscription.findFirst({
    where: { userId: userId, subscriptionId: subscriptionId },
  });
  if (!subscriptionData) {
    throw new ApiError(404, "Subscription not found");
  }
  await stripe.subscriptions.cancel(subscriptionId);
  await prismaEveryWhere.subscription.delete({
    where: { id: subscriptionData.id },
  });
  return;
};

const updateSubscriptionInStripe = async (
  payload: Subscription,
  userId: string
) => {
  const { paymentMethodId, priceId, subscriptionId } = payload;
  const userInfo = await prismaEveryWhere.user.findUnique({
    where: { id: userId },
  });

  if (!userInfo) {
    throw new ApiError(404, "User not found");
  }

  const isExistingSubscription = await prismaEveryWhere.subscription.findFirst({
    where: { userId: userId, subscriptionId: subscriptionId },
  });

  if (!isExistingSubscription) {
    throw new ApiError(404, "Subscription not found");
  }

  const { customerId } = await getUserStripeCustomer(userId);

  if (paymentMethodId) {
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  }

  try {
    await stripe.subscriptions.cancel(subscriptionId);
  } catch (error) {
    console.log(error);
  }

  let subscription: any;
  try {
    subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      expand: ["latest_invoice.payment_intent"],
    });
  } catch (error) {
    console.log(error);
  }

  const workspaceId = await resolveWorkspaceIdForUser(userId);
  const subscriptionData = {
    paymentMethodId: paymentMethodId,
    userId: userId,
    workspaceId,
    priceId: priceId,
    subscriptionId: subscription.id,
    interval: subscription.plan.interval,
    planType: payload.planType,
  };

  await prismaEveryWhere.subscription.deleteMany({
    where: {
      subscriptionId: subscriptionId,
    },
  });

  const updatedSubscription = await prismaEveryWhere.subscription.create({
    data: subscriptionData,
  });

  return updatedSubscription;
};

//using for webhook
const deleteSubscriptionByStripeId = async (subscriptionId: string) => {
  const existingSubscription = await prismaEveryWhere.subscription.findFirst({
    where: { subscriptionId },
  });

  await prismaEveryWhere.subscription.deleteMany({
    where: { subscriptionId },
  });

  if (existingSubscription) {
    // removed legacy technicianProfile update
  }
};

const subscriptionIdFromEvent = (event: Stripe.Event): string | null => {
  const object = event.data.object as unknown as Record<string, unknown>;
  if (event.type.startsWith("customer.subscription.")) {
    return typeof object.id === "string" ? object.id : null;
  }
  if (event.type === "invoice.payment_failed") {
    if (typeof object.subscription === "string") return object.subscription;
    const parent = object.parent as
      | { subscription_details?: { subscription?: string } }
      | undefined;
    return parent?.subscription_details?.subscription ?? null;
  }
  return null;
};

const handelPaymentWebhook = async (req: Request) => {
  const sig = req.headers["stripe-signature"] as string;
  const secret = config.stripe.webhook_secret as string;

  if (!sig || !secret) {
    throw new ApiError(400, "Missing Stripe webhook signature or secret");
  }

  const event = stripe.webhooks.constructEvent(req.body, sig, secret);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode === "subscription") {
      await persistCheckoutSubscription(session);
    }
  }

  if (
    event.type === "invoice.payment_failed" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscriptionId = subscriptionIdFromEvent(event);
    if (subscriptionId) {
      await deleteSubscriptionByStripeId(subscriptionId);
    }
  }

  return { received: true, type: event.type };
};

const getMySubscriptionFromDB = async (userId: string) => {
  const subscription = await prismaEveryWhere.subscription.findFirst({
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
    message:
      subscription.status === "ACTIVE"
        ? "Subscription is active."
        : "Subscription is not active. Please renew or subscribe again.",
  };
};

const getPaymentsFromDB = async (req: Request) => {
  const { page, limit, skip } = paginationHelper(req.query as any);

  const [payments, totalCount] = await Promise.all([
    prisma.payment.findMany({
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
    prisma.payment.count(),
  ]);

  return {
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    payments,
  };
};

const getPaymentDetailsFromDB = async (id: string) => {
  const payment = await prisma.payment.findUnique({
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
    throw new ApiError(404, "Payment not found");
  }
  return payment;
};

const getSubscriptionsFromDB = async (req: Request) => {
  const { page, limit, skip } = paginationHelper(req.query as any);

  const [subscriptions, totalCount] = await Promise.all([
    prismaEveryWhere.subscription.findMany({
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
    prismaEveryWhere.subscription.count(),
  ]);

  return {
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    subscriptions,
  };
};

export const paymentServices = {
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
