import stripe from "./stripe";
import prisma from "../shared/prisma";
import ApiError from "../errors/ApiErrors";

export const getOrCreateClientStripeCustomer = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.stripeCustomerId) {
    return { customerId: user.stripeCustomerId, user };
  }

  const customer = await stripe.customers.create({
    name: user.userName,
    email: user.email ?? undefined,
    phone: user.phone,
  });

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });

  return { customerId: customer.id, user };
};

export const chargeClientToTechnician = async (params: {
  clientId: string;
  amount: number;
  paymentMethodId?: string | null;
  technicianStripeAccountId?: string | null;
}) => {
  if (!params.amount || params.amount <= 0) {
    throw new ApiError(400, "A positive amount is required for payment");
  }

  const { customerId } = await getOrCreateClientStripeCustomer(params.clientId);
  const appCharge = Math.round(params.amount * 0.05 * 100);

  if (params.paymentMethodId) {
    await stripe.paymentMethods.attach(params.paymentMethodId, {
      customer: customerId,
    });
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: params.paymentMethodId,
      },
    });
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(params.amount * 100),
    currency: "bdt",
    payment_method: params.paymentMethodId ?? undefined,
    customer: customerId,
    application_fee_amount: appCharge,
    ...(params.technicianStripeAccountId
      ? {
          transfer_data: {
            destination: params.technicianStripeAccountId,
          },
        }
      : {}),
    confirm: true,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: "never",
    },
  });

  if (paymentIntent.status !== "succeeded") {
    throw new ApiError(400, "Payment failed");
  }

  return paymentIntent;
};
