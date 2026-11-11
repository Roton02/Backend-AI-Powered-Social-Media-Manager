import Stripe from "stripe";
import config from "../config";

const stripe = new Stripe(config.stripe.stripe_secret!, {
  apiVersion: "2025-04-30.basil",
});

export const createConnectedAccount = async (hosterEmail: string) => {
  const account = await stripe.accounts.create({
    type: "express",
    country: "US",
    email: hosterEmail,
    capabilities: {
      transfers: { requested: true },
    },
  });

  return account.id; // save this Stripe Account ID in your DB for the worker
};

/**
 * Stripe Connect Express with card_payments is not available for BD.
 * Account creation is deferred/skipped at apply time so registration does not fail.
 */
export const createTechnicianConnectAccount = async (
  email: string
): Promise<string | undefined> => {
  const connectCountry = process.env.STRIPE_CONNECT_COUNTRY?.toUpperCase();

  // Bangladesh requires cross-border Connect setup; skip at apply time.
  if (!connectCountry || connectCountry === "BD") {
    return undefined;
  }

  try {
    const account = await stripe.accounts.create({
      type: "express",
      email,
      country: connectCountry,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    return account.id;
  } catch (error) {
    console.warn("Stripe Connect account creation skipped:", error);
    return undefined;
  }
};

export default stripe;
