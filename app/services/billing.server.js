import prisma from "../db.server";
import {
  PLAN_TIERS,
  AUTO_SCALE_PLAN,
  normalizePlanKey,
  getTierForCount,
  getImpressionLimit,
} from "./plans";

import {
  sendCapWarningEmail,
  sendCapPausedEmail,
  sendMonthlyResetEmail,
  sendAutoScaleTierEmail,
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

      const planKey = normalizePlanKey(shop.currentPlan);
      const planLimit = getImpressionLimit(shop);
      const count = shop.monthlyImpressionsCount || 0;
      const isCapExceeded = count >= planLimit;

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
          cycleBilledCents: 0,
        },
      });

      console.log(`[CS Billing] Reset 30-day billing cycle for shop: ${shop.shopifyDomain}`);

      // 4. Send email alerting merchant that their wheel is unpaused & refreshed
      if (shop.contactEmail) {
        sendMonthlyResetEmail({
          to: shop.contactEmail,
          shopDomain: shop.shopifyDomain,
          freeLimit: planLimit,
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
 * Map Shopify's active subscriptions onto our plan keys and persist them.
 * Also captures the usage line item ID for the Auto-Scale plan.
 */
export async function applyActiveSubscriptions(shop, subs) {
  if (!shop) return shop;

  const active = (subs || []).find((s) => s.status === "ACTIVE");
  let planKey = "FREE";
  let usageLineItemId = null;

  if (active) {
    const subName = (active.name || "").toUpperCase();
    if (subName.includes("AUTO")) planKey = "AUTO";
    else if (subName.includes("PRO") || subName.includes("ADVANCED")) planKey = "PRO";
    else if (subName.includes("GROWTH") || subName.includes("GROW")) planKey = "GROWTH";
    else if (subName.includes("BASIC")) planKey = "BASIC";
    else if (subName.includes("STARTER")) planKey = "STARTER";

    const usageItem = (active.lineItems || []).find(
      (li) => li?.plan?.pricingDetails?.__typename === "AppUsagePricing"
    );
    usageLineItemId = usageItem?.id || null;
  }

  const data = {};
  if (normalizePlanKey(shop.currentPlan) !== planKey) data.currentPlan = planKey;
  if ((shop.usageSubscriptionLineItemId || null) !== usageLineItemId) {
    data.usageSubscriptionLineItemId = usageLineItemId;
  }

  // Newly activated Auto-Scale: start a fresh billing window aligned with
  // Shopify's usage interval so our per-cycle total matches its capped amount.
  if (planKey === "AUTO" && normalizePlanKey(shop.currentPlan) !== "AUTO") {
    data.billingCycleStartDate = new Date();
    data.cycleBilledCents = 0;
    data.lastWarningEmailSent = "NONE";
  }

  if (Object.keys(data).length === 0) return shop;
  return prisma.shop.update({ where: { id: shop.id }, data });
}

const ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query getActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        lineItems {
          id
          plan {
            pricingDetails {
              __typename
            }
          }
        }
      }
    }
  }
`;

/**
 * Synchronize the shop's active subscription from Shopify GraphQL to DB
 */
export async function syncShopSubscription(admin, shop) {
  if (!admin || !shop) return shop;

  try {
    const subRes = await admin.graphql(ACTIVE_SUBSCRIPTIONS_QUERY);
    const subJson = await subRes.json();
    const subs = subJson?.data?.currentAppInstallation?.activeSubscriptions || [];
    shop = await applyActiveSubscriptions(shop, subs);
  } catch (e) {
    console.error("[CS Billing] syncShopSubscription error:", e);
  }

  return shop;
}

/**
 * Create the Auto-Scale usage subscription and return Shopify's confirmation URL.
 * The merchant approves once; later tier changes are billed automatically.
 */
export async function createAutoScaleSubscription(admin, shopDomain, returnPath = "/app") {
  const returnUrl = `https://${shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}${returnPath}`;

  const mutation = `#graphql
    mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $test: Boolean) {
      appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, test: $test) {
        appSubscription { id }
        confirmationUrl
        userErrors { field message }
      }
    }
  `;

  const response = await admin.graphql(mutation, {
    variables: {
      name: AUTO_SCALE_PLAN.subscriptionName,
      returnUrl,
      test: process.env.NODE_ENV !== "production",
      lineItems: [
        {
          plan: {
            appUsagePricingDetails: {
              cappedAmount: { amount: AUTO_SCALE_PLAN.cappedAmount, currencyCode: "USD" },
              terms: AUTO_SCALE_PLAN.terms,
            },
          },
        },
      ],
    },
  });

  const json = await response.json();
  const result = json?.data?.appSubscriptionCreate;
  if (result?.userErrors?.length) {
    return { error: result.userErrors.map((e) => e.message).join(", ") };
  }
  if (!result?.confirmationUrl) {
    return { error: "Unable to obtain confirmation URL from Shopify Billing API" };
  }
  return { confirmationUrl: result.confirmationUrl };
}

/**
 * Auto-Scale billing: when impressions cross into a higher tier this cycle,
 * charge the difference between that tier's price and what's already billed.
 * Uses an optimistic DB claim so concurrent impressions never double-charge,
 * plus a Shopify idempotency key as a second guard.
 */
async function chargeAutoScaleTierIfNeeded(admin, shop) {
  if (!admin || !shop.usageSubscriptionLineItemId) return shop;

  const tier = getTierForCount(shop.monthlyImpressionsCount || 0);
  const targetCents = Math.round(tier.price * 100);
  const billedCents = shop.cycleBilledCents || 0;
  const deltaCents = targetCents - billedCents;
  if (deltaCents <= 0) return shop;

  // Claim this charge; if another request already moved the counter, skip.
  const claim = await prisma.shop.updateMany({
    where: { id: shop.id, cycleBilledCents: billedCents },
    data: { cycleBilledCents: targetCents },
  });
  if (claim.count === 0) return shop;

  const cycleKey = new Date(shop.billingCycleStartDate).getTime();
  const result = await createUsageRecord(admin, shop.usageSubscriptionLineItemId, {
    amountCents: deltaCents,
    description: `${tier.name}: up to ${tier.monthlyImpressions.toLocaleString()} impressions this 30-day cycle`,
    idempotencyKey: `cs-auto-${shop.id}-${cycleKey}-${tier.key}`,
  });

  if (!result.ok) {
    // Roll back the claim so the next impression retries the charge.
    await prisma.shop.updateMany({
      where: { id: shop.id, cycleBilledCents: targetCents },
      data: { cycleBilledCents: billedCents },
    });
    console.error(`[CS Billing] Auto-scale charge failed for ${shop.shopifyDomain}:`, result.error);
    return shop;
  }

  console.log(`[CS Billing] Auto-scale charged $${(deltaCents / 100).toFixed(2)} (${tier.name}) to ${shop.shopifyDomain}`);

  if (shop.contactEmail) {
    sendAutoScaleTierEmail({
      to: shop.contactEmail,
      shopDomain: shop.shopifyDomain,
      tierName: tier.name,
      tierPrice: tier.price,
      impressionLimit: tier.monthlyImpressions,
      currentImpressions: shop.monthlyImpressionsCount,
    }).catch((err) => console.error("[CS Billing] Auto-scale email error:", err));
  }

  return { ...shop, cycleBilledCents: targetCents };
}

async function countCycleLeads(shop) {
  return prisma.lead.count({
    where: {
      shopId: shop.id,
      convertedAt: { gte: new Date(shop.billingCycleStartDate) },
    },
  });
}

/**
 * Increment impression count, bill Auto-Scale tier changes, and send cap emails
 */
export async function recordShopImpression(admin, shopifyDomain, campaignId, sessionHash) {
  const shop = await getOrInitShop(shopifyDomain);

  await prisma.impressionLog.create({
    data: {
      shopId: shop.id,
      campaignId: campaignId || null,
      sessionHash: sessionHash || null,
    },
  });

  let updatedShop = await prisma.shop.update({
    where: { id: shop.id },
    data: { monthlyImpressionsCount: { increment: 1 } },
  });

  const newCount = updatedShop.monthlyImpressionsCount;
  const planKey = normalizePlanKey(updatedShop.currentPlan);
  const planLimit = getImpressionLimit(updatedShop);

  if (planKey === "AUTO" && updatedShop.usageSubscriptionLineItemId) {
    updatedShop = await chargeAutoScaleTierIfNeeded(admin, updatedShop);
  } else if (updatedShop.contactEmail) {
    // Fixed plans / free: warn at 80%, notify at 100% with the auto-scale option.
    const eightyPercent = Math.floor(planLimit * 0.8);
    const sent = updatedShop.lastWarningEmailSent;
    const nextPlan = getTierForCount(planLimit + 1);

    if (newCount >= eightyPercent && newCount < planLimit && sent !== "WARN_80" && sent !== "PAUSED_100") {
      sendCapWarningEmail({
        to: updatedShop.contactEmail,
        shopDomain: updatedShop.shopifyDomain,
        currentImpressions: newCount,
        limit: planLimit,
        leadsCount: await countCycleLeads(updatedShop),
        nextPlanName: nextPlan.name,
        nextPlanPrice: nextPlan.price,
      }).catch((err) => console.error("[CS Billing] Warning email error:", err));

      await prisma.shop.update({ where: { id: updatedShop.id }, data: { lastWarningEmailSent: "WARN_80" } });
    }

    if (newCount >= planLimit && sent !== "PAUSED_100") {
      sendCapPausedEmail({
        to: updatedShop.contactEmail,
        shopDomain: updatedShop.shopifyDomain,
        currentImpressions: newCount,
        limit: planLimit,
        leadsCount: await countCycleLeads(updatedShop),
        nextPlanName: nextPlan.name,
        nextPlanPrice: nextPlan.price,
      }).catch((err) => console.error("[CS Billing] Paused email error:", err));

      await prisma.shop.update({ where: { id: updatedShop.id }, data: { lastWarningEmailSent: "PAUSED_100" } });
    }
  }

  return {
    counted: true,
    newCount,
    isSoftCapReached: newCount >= planLimit,
    shop: updatedShop,
  };
}

/**
 * Execute Shopify appUsageRecordCreate against a usage line item
 */
export async function createUsageRecord(admin, subscriptionLineItemId, { amountCents, description, idempotencyKey }) {
  const mutation = `#graphql
    mutation appUsageRecordCreate($subscriptionLineItemId: ID!, $price: MoneyInput!, $description: String!, $idempotencyKey: String) {
      appUsageRecordCreate(subscriptionLineItemId: $subscriptionLineItemId, price: $price, description: $description, idempotencyKey: $idempotencyKey) {
        appUsageRecord { id }
        userErrors { field message }
      }
    }
  `;

  try {
    const response = await admin.graphql(mutation, {
      variables: {
        subscriptionLineItemId,
        price: { amount: (amountCents / 100).toFixed(2), currencyCode: "USD" },
        description,
        idempotencyKey,
      },
    });
    const json = await response.json();
    const result = json?.data?.appUsageRecordCreate;
    if (result?.userErrors?.length) {
      return { ok: false, error: result.userErrors.map((e) => e.message).join(", ") };
    }
    if (!result?.appUsageRecord?.id) {
      return { ok: false, error: json?.errors || "No usage record returned" };
    }
    return { ok: true, id: result.appUsageRecord.id };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}
