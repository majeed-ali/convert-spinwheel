import prisma from "../db.server";
import { PLAN_TIERS } from "./plans";

export { PLAN_TIERS };

/**
 * Get or initialize shop details from DB
 */
export async function getOrInitShop(shopifyDomain, accessToken = null) {
  let shop = await prisma.shop.findUnique({
    where: { shopifyDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        shopifyDomain,
        accessToken,
        currentPlan: "FREE",
        monthlyImpressionsCount: 0,
        billingCycleStartDate: new Date(),
      },
    });
  } else if (accessToken && shop.accessToken !== accessToken) {
    shop = await prisma.shop.update({
      where: { shopifyDomain },
      data: { accessToken },
    });
  }

  // Reset monthly impressions count if billing cycle month has passed
  const now = new Date();
  const cycleStart = new Date(shop.billingCycleStartDate);
  const diffDays = (now - cycleStart) / (1000 * 60 * 60 * 24);

  if (diffDays >= 30) {
    shop = await prisma.shop.update({
      where: { id: shop.id },
      data: {
        monthlyImpressionsCount: 0,
        billingCycleStartDate: now,
      },
    });
  }

  return shop;
}

/**
 * Increment impression count and handle overage billing for Advanced plan
 */
export async function recordShopImpression(admin, shopifyDomain, campaignId, sessionHash) {
  const shop = await getOrInitShop(shopifyDomain);

  // Record impression log
  await prisma.impressionLog.create({
    data: {
      shopId: shop.id,
      campaignId: campaignId || null,
      sessionHash: sessionHash || null,
    },
  });

  const updatedShop = await prisma.shop.update({
    where: { id: shop.id },
    data: {
      monthlyImpressionsCount: { increment: 1 },
    },
  });

  const newCount = updatedShop.monthlyImpressionsCount;
  const plan = PLAN_TIERS[updatedShop.currentPlan] || PLAN_TIERS.FREE;

  // Handle overage billing for 50,000+ Advanced Plan
  if (updatedShop.currentPlan === "ADVANCED" && newCount > 50000) {
    const overageImpressions = newCount - 50000;
    // Check if exactly at a 1,000 milestone (e.g. 51,000, 52,000...)
    if (overageImpressions % 1000 === 0 && updatedShop.usageSubscriptionLineItemId && admin) {
      await createOverageUsageRecord(admin, updatedShop.usageSubscriptionLineItemId, 1.0, `1,000 impressions overage milestone at ${newCount} impressions`);
    }
  }

  const isSoftCapReached = !plan.isOverageAllowed && newCount > plan.monthlyImpressions;

  return {
    counted: true,
    newCount,
    isSoftCapReached,
    shop: updatedShop,
  };
}

/**
 * Execute Shopify appUsageRecordCreate GraphQL mutation for $1.00 overage billing
 */
export async function createOverageUsageRecord(admin, subscriptionLineItemId, amount, description) {
  const mutation = `#graphql
    mutation appUsageRecordCreate($subscriptionLineItemId: ID!, $price: MoneyInput!, $description: String!) {
      appUsageRecordCreate(subscriptionLineItemId: $subscriptionLineItemId, price: $price, description: $description) {
        appUsageRecord {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(mutation, {
      variables: {
        subscriptionLineItemId,
        price: { amount: amount.toFixed(2), currencyCode: "USD" },
        description,
      },
    });
    const json = await response.json();
    return json.data?.appUsageRecordCreate;
  } catch (error) {
    console.error("Failed to create Shopify billing usage record:", error);
    return null;
  }
}
