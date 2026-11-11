import stripe from "./stripe";

const generateAccountLink = async (accountId: string) => {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: "https://yourdomain.com/reauth", // fallback URL
    return_url: "https://yourdomain.com/return", // after completing setup
    type: "account_onboarding",
  });

  return accountLink.url;
};

export default generateAccountLink;
