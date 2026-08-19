import prisma from "../db.server";
import { PLAN_TIERS } from "./plans";

export { PLAN_TIERS };

export async function ensureDefaultCampaign(shopId) {
  const existingCampaign = await prisma.campaign.findFirst({
    where: { shopId, status: "ACTIVE" },
    include: {
      segments: { orderBy: { position: "asc" } },
    },
  });

  if (existingCampaign && existingCampaign.segments?.length > 0) {
    return existingCampaign;
  }

  // Create default starter campaign with 6 engaging slices
  return await prisma.campaign.create({
    data: {
      shopId,
      name: "Welcome Spin Wheel",
      type: "POPUP",
      status: "ACTIVE",
      isABTest: false,
      triggers: JSON.stringify({
        exitIntent: true,
        scrollDepth: 50,
        timeDelay: 5,
        pageUrlRules: [],
        cartValueMin: 0,
      }),
      themeSettings: JSON.stringify({
        title: "Spin & Win Exclusive Discount!",
        subtitle: "Enter your email for a chance to win up to 20% off!",
        buttonText: "Spin The Wheel Now",
        floatingLauncherText: "🎁 Spin to Win!",
        primaryColor: "#4F46E5",
        backgroundColor: "#FFFFFF",
        textColor: "#1F2937",
        requirePhone: false,
        gdprNotice: "By spinning, you agree to receive marketing updates.",
      }),
      segments: {
        create: [
          { label: "10% OFF", discountType: "PERCENTAGE", discountValue: "10", winProbability: 35, hexColor: "#EF4444", position: 0 },
          { label: "15% OFF", discountType: "PERCENTAGE", discountValue: "15", winProbability: 25, hexColor: "#3B82F6", position: 1 },
          { label: "$5 OFF", discountType: "FIXED_AMOUNT", discountValue: "5", winProbability: 20, hexColor: "#10B981", position: 2 },
          { label: "FREE SHIPPING", discountType: "FREE_SHIPPING", discountValue: "0", winProbability: 10, hexColor: "#F59E0B", position: 3 },
          { label: "20% OFF", discountType: "PERCENTAGE", discountValue: "20", winProbability: 5, hexColor: "#8B5CF6", position: 4 },
          { label: "TRY AGAIN", discountType: "TRY_AGAIN", discountValue: "0", winProbability: 5, hexColor: "#6B7280", position: 5 },
        ],
      },
    },
    include: {
      segments: { orderBy: { position: "asc" } },
    },
  });
}

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
    // Initialize default campaign immediately for new shop
    await ensureDefaultCampaign(shop.id);
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
