import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PLAN_TIERS } from "../services/plans";
import { sendSubscriptionUpgradedEmail } from "../services/email.server";

export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (payload && payload.app_subscription) {
    const status = payload.app_subscription.status;

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

    const existingShop = await prisma.shop.findUnique({
      where: { shopifyDomain: shop },
    });

    const isNewlyUpgraded = existingShop && existingShop.currentPlan !== currentPlan && currentPlan !== "FREE";

    await prisma.shop.updateMany({
      where: { shopifyDomain: shop },
      data: {
        currentPlan,
        usageSubscriptionLineItemId: usageLineItemId,
      },
    });

    if (isNewlyUpgraded && existingShop.contactEmail) {
      const planInfo = PLAN_TIERS[currentPlan] || PLAN_TIERS.STARTER;
      sendSubscriptionUpgradedEmail({
        to: existingShop.contactEmail,
        shopDomain: shop,
        planName: planInfo.name,
        planPrice: planInfo.price,
        impressionLimit: planInfo.monthlyImpressions,
      }).catch((err) => console.error("[Webhook] Upgrade email error:", err));
    }
  }

  return new Response();
};
