import { authenticate, unauthenticated } from "../shopify.server";
import prisma from "../db.server";
import { PLAN_TIERS, normalizePlanKey } from "../services/plans";
import { syncShopSubscription } from "../services/billing.server";
import { sendSubscriptionUpgradedEmail } from "../services/email.server";

export const action = async ({ request }) => {
  const { shop, payload, topic, admin: webhookAdmin } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (!payload?.app_subscription) return new Response();

  const existingShop = await prisma.shop.findUnique({
    where: { shopifyDomain: shop },
  });
  if (!existingShop) return new Response();

  // Re-read active subscriptions from Shopify so we capture the usage
  // line item ID needed for Auto-Scale billing (the payload doesn't include it).
  let admin = webhookAdmin;
  if (!admin) {
    try {
      admin = (await unauthenticated.admin(shop))?.admin;
    } catch (e) {
      console.error("[Webhook] Could not get admin context:", e);
    }
  }

  let updatedShop = existingShop;
  if (admin) {
    updatedShop = await syncShopSubscription(admin, existingShop);
  } else if (payload.app_subscription.status !== "ACTIVE") {
    updatedShop = await prisma.shop.update({
      where: { id: existingShop.id },
      data: { currentPlan: "FREE", usageSubscriptionLineItemId: null },
    });
  }

  const previousPlan = normalizePlanKey(existingShop.currentPlan);
  const newPlan = normalizePlanKey(updatedShop.currentPlan);

  // Auto-Scale has its own per-tier notices, so only email for fixed-price upgrades.
  if (newPlan !== previousPlan && newPlan !== "FREE" && newPlan !== "AUTO" && existingShop.contactEmail) {
    const planInfo = PLAN_TIERS[newPlan] || PLAN_TIERS.STARTER;
    sendSubscriptionUpgradedEmail({
      to: existingShop.contactEmail,
      shopDomain: shop,
      planName: planInfo.name,
      planPrice: planInfo.price,
      impressionLimit: planInfo.monthlyImpressions,
    }).catch((err) => console.error("[Webhook] Upgrade email error:", err));
  }

  return new Response();
};
