import prisma from "../db.server";
import { PLAN_TIERS } from "./plans";

import {
  sendCapWarningEmail,
  sendCapPausedEmail,
  sendMonthlyResetEmail,
} from "./email.server";

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
 * Checks if a store's 30-day billing cycle has ended (or if force=true).
 * Archives the completed cycle to BillingCycleHistory, resets count to 0,
 * and notifies the merchant that fresh impressions are available.
 */
export async function checkAndResetMonthlyCycle(shop, force = false) {
  if (!shop) return shop;

  const now = new Date();
  const cycleStart = shop.billingCycleStartDate ? new Date(shop.billingCycleStartDate) : now;
  const diffDays = (now.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays >= 30 || force) {
    try {
      // 1. Calculate total leads gathered during this expiring cycle
      const leadsCount = await prisma.lead.count({
        where: {
          shopId: shop.id,
          convertedAt: {
            gte: cycleStart,
            lte: now,
          },
        },
      });

      const planKey = (shop.currentPlan || "FREE").toUpperCase();
      const plan = PLAN_TIERS[planKey] || PLAN_TIERS.FREE;
      const count = shop.monthlyImpressionsCount || 0;
      const isCapExceeded = count >= (plan.monthlyImpressions || 1000);

      // 2. Archive snapshot into BillingCycleHistory for Super Admin & Merchant history
      await prisma.billingCycleHistory.create({
        data: {
          shopId: shop.id,
          cycleStartDate: cycleStart,
          cycleEndDate: now,
          planKey,
          impressionsCount: count,
          leadsCount,
          status: isCapExceeded ? "CAP_EXCEEDED" : "COMPLETED",
        },
      });

      // 3. Reset impressions counter and update cycle date
      shop = await prisma.shop.update({
        where: { id: shop.id },
        data: {
          monthlyImpressionsCount: 0,
          billingCycleStartDate: now,
          lastWarningEmailSent: "NONE",
        },
      });

      console.log(`[CS Billing] Reset 30-day billing cycle for shop: ${shop.shopifyDomain}`);

      // 4. Send email alerting merchant that their wheel is unpaused & refreshed
      if (shop.contactEmail) {
        sendMonthlyResetEmail({
          to: shop.contactEmail,
          shopDomain: shop.shopifyDomain,
          freeLimit: plan.monthlyImpressions || 1000,
        }).catch((err) => console.error("[CS Billing] Reset notification email error:", err));
      }
    } catch (err) {
      console.error("[CS Billing] checkAndResetMonthlyCycle error:", err);
    }
  }

  return shop;
}

/**
 * Fetch and sync the merchant's store contact email from Shopify Admin GraphQL
 */
export async function syncShopContactEmail(admin, shop) {
  if (!admin || !shop) return shop;

  try {
    const shopQuery = `#graphql
      query getShopEmail {
        shop {
          email
          contactEmail
        }
      }
    `;
    const res = await admin.graphql(shopQuery);
    const json = await res.json();
    const email = json?.data?.shop?.contactEmail || json?.data?.shop?.email;

    if (email && email !== shop.contactEmail) {
      shop = await prisma.shop.update({
        where: { id: shop.id },
        data: { contactEmail: email },
      });
    }
  } catch (err) {
    console.error("[CS Billing] syncShopContactEmail error:", err);
  }

  return shop;
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
        lastWarningEmailSent: "NONE",
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

  // Automatically check and reset cycle if 30 days have elapsed
  shop = await checkAndResetMonthlyCycle(shop);

  return shop;
}

/**
 * Synchronize the shop's active recurring subscription from Shopify GraphQL to DB
 */
export async function syncShopSubscription(admin, shop) {
  if (!admin || !shop) return shop;

  try {
    const activeSubQuery = `#graphql
      query getActiveSubscriptions {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
          }
        }
      }
    `;
    const subRes = await admin.graphql(activeSubQuery);
    const subJson = await subRes.json();
    const subs = subJson?.data?.currentAppInstallation?.activeSubscriptions || [];

    let activePlanKey = "FREE";
    if (subs.length > 0 && subs[0].status === "ACTIVE") {
      const subName = (subs[0].name || "").toUpperCase();
      if (subName.includes("PRO") || subName.includes("ADVANCED")) {
        activePlanKey = "PRO";
      } else if (subName.includes("GROWTH") || subName.includes("GROW")) {
        activePlanKey = "GROWTH";
      } else if (subName.includes("BASIC")) {
        activePlanKey = "BASIC";
      } else if (subName.includes("STARTER")) {
        activePlanKey = "STARTER";
      }

      if (shop.currentPlan !== activePlanKey) {
        shop = await prisma.shop.update({
          where: { id: shop.id },
          data: { currentPlan: activePlanKey },
        });
      }
    } else if (shop.currentPlan !== "FREE") {
      shop = await prisma.shop.update({
        where: { id: shop.id },
        data: { currentPlan: "FREE", usageSubscriptionLineItemId: null },
      });
    }
  } catch (e) {
    console.error("[CS Billing] syncShopSubscription error:", e);
  }

  return shop;
}

/**
 * Increment impression count and handle overage billing / automated email warnings
 */
export async function recordShopImpression(admin, shopifyDomain, campaignId, sessionHash) {
  let shop = await getOrInitShop(shopifyDomain);
  shop = await checkAndResetMonthlyCycle(shop);

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
  const planKey = (updatedShop.currentPlan || "FREE").toUpperCase();
  const plan = PLAN_TIERS[planKey] || PLAN_TIERS.FREE;
  const planLimit = plan.monthlyImpressions || 1000;

  // 1. Check 80% threshold warning email
  const eightyPercentThreshold = Math.floor(planLimit * 0.8);
  if (
    newCount >= eightyPercentThreshold &&
    newCount < planLimit &&
    updatedShop.lastWarningEmailSent !== "WARN_80" &&
    updatedShop.lastWarningEmailSent !== "PAUSED_100" &&
    updatedShop.contactEmail
  ) {
    const leadsCount = await prisma.lead.count({
      where: {
        shopId: updatedShop.id,
        convertedAt: { gte: new Date(updatedShop.billingCycleStartDate) },
      },
    });

    const nextTierKey = planKey === "FREE" ? "STARTER" : planKey === "STARTER" ? "BASIC" : "GROWTH";
    const nextPlan = PLAN_TIERS[nextTierKey] || PLAN_TIERS.STARTER;

    sendCapWarningEmail({
      to: updatedShop.contactEmail,
      shopDomain: updatedShop.shopifyDomain,
      currentImpressions: newCount,
      limit: planLimit,
      leadsCount,
      nextPlanName: nextPlan.name,
      nextPlanPrice: nextPlan.price,
    }).catch((err) => console.error("[CS Billing] Warning email error:", err));

    await prisma.shop.update({
      where: { id: updatedShop.id },
      data: { lastWarningEmailSent: "WARN_80" },
    });
  }

  // 2. Check 100% threshold pause alert email
  if (
    newCount >= planLimit &&
    updatedShop.lastWarningEmailSent !== "PAUSED_100" &&
    updatedShop.contactEmail
  ) {
    const leadsCount = await prisma.lead.count({
      where: {
        shopId: updatedShop.id,
        convertedAt: { gte: new Date(updatedShop.billingCycleStartDate) },
      },
    });

    const nextTierKey = planKey === "FREE" ? "STARTER" : planKey === "STARTER" ? "BASIC" : "GROWTH";
    const nextPlan = PLAN_TIERS[nextTierKey] || PLAN_TIERS.STARTER;

    sendCapPausedEmail({
      to: updatedShop.contactEmail,
      shopDomain: updatedShop.shopifyDomain,
      currentImpressions: newCount,
      limit: planLimit,
      leadsCount,
      nextPlanName: nextPlan.name,
      nextPlanPrice: nextPlan.price,
    }).catch((err) => console.error("[CS Billing] Paused email error:", err));

    await prisma.shop.update({
      where: { id: updatedShop.id },
      data: { lastWarningEmailSent: "PAUSED_100" },
    });
  }

  // Handle overage billing for 50,000+ Advanced Plan
  if (updatedShop.currentPlan === "ADVANCED" && newCount > 50000) {
    const overageImpressions = newCount - 50000;
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
