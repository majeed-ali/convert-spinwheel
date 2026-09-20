import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (payload && payload.app_subscription) {
    const status = payload.app_subscription.status;
    const lineItems = payload.app_subscription.line_items || [];

    let currentPlan = "FREE";
    let usageLineItemId = null;

    if (status === "ACTIVE") {
      const name = (payload.app_subscription.name || "").toUpperCase();
      if (name.includes("PRO") || name.includes("ADVANCED")) {
        currentPlan = "PRO";
      } else if (name.includes("GROWTH") || name.includes("GROW")) {
        currentPlan = "GROWTH";
      } else if (name.includes("BASIC")) {
        currentPlan = "BASIC";
      } else if (name.includes("STARTER")) {
        currentPlan = "STARTER";
      }
    }

    await prisma.shop.updateMany({
      where: { shopifyDomain: shop },
      data: {
        currentPlan,
        usageSubscriptionLineItemId: usageLineItemId,
      },
    });
  }

  return new Response();
};
