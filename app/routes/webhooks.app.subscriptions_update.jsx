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
      const name = payload.app_subscription.name || "";
      if (name.includes("Advanced")) {
        currentPlan = "ADVANCED";
      } else if (name.includes("Grow")) {
        currentPlan = "GROW";
      } else if (name.includes("Basic")) {
        currentPlan = "BASIC";
      }

      // Find usage line item ID for overage billing
      const usageItem = lineItems.find((item) => item.plan?.pricing_details?.interval === "USAGE");
      if (usageItem) {
        usageLineItemId = usageItem.id;
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
