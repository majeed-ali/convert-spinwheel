import prisma from "../db.server";

function parseJsonField(value, fallback) {
  if (typeof value !== "string") {
    return value ?? fallback;
  }

  try {
    return JSON.parse(value || "{}");
  } catch (_error) {
    return fallback;
  }
}

import { getOrInitShop, ensureDefaultCampaign } from "../services/billing.server";
import { PLAN_TIERS } from "../services/plans";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const rawShopDomain = url.searchParams.get("shop");
  const cleanDomain = rawShopDomain
    ? rawShopDomain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim().toLowerCase()
    : null;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let shop = null;
    if (cleanDomain) {
      shop = await prisma.shop.findFirst({
        where: {
          shopifyDomain: cleanDomain,
        },
        include: {
          campaigns: {
            where: { status: "ACTIVE" },
            include: {
              segments: { orderBy: { position: "asc" } },
            },
          },
        },
      });

      if (!shop) {
        shop = await getOrInitShop(cleanDomain);
        const defaultCamp = await ensureDefaultCampaign(shop.id);
        shop.campaigns = [defaultCamp];
      } else if (!shop.campaigns || shop.campaigns.length === 0) {
        const defaultCamp = await ensureDefaultCampaign(shop.id);
        shop.campaigns = [defaultCamp];
      }
    }

  if (!shop || !shop.campaigns || shop.campaigns.length === 0) {
    const anyCampaign = await prisma.campaign.findFirst({
      where: { status: "ACTIVE" },
      include: {
        shop: true,
        segments: { orderBy: { position: "asc" } },
      },
    });

    if (anyCampaign) {
      shop = anyCampaign.shop || { shopifyDomain: cleanDomain || "store.myshopify.com", currentPlan: "FREE" };
      shop.campaigns = [anyCampaign];
    } else {
      return Response.json({ campaign: null }, { headers: corsHeaders });
    }
  }

  // Check if shop has exceeded its monthly plan impression limit
  let planKey = (shop.currentPlan || "FREE").toUpperCase();
  if (planKey === "GROW") planKey = "GROWTH";
  if (planKey === "ADVANCED") planKey = "PRO";

  const currentPlanTier = PLAN_TIERS[planKey] || PLAN_TIERS.FREE;
  const currentImpressions = shop.monthlyImpressionsCount || 0;
  const planLimit = currentPlanTier.monthlyImpressions || 1000;

  if (currentImpressions >= planLimit) {
    return Response.json(
      {
        campaign: null,
        isPaused: true,
        reason: "MONTHLY_IMPRESSION_LIMIT_EXCEEDED",
        currentPlan: planKey,
        currentImpressions,
        planLimit,
      },
      { headers: corsHeaders }
    );
  }

  const activeCampaigns = shop.campaigns;
  const selectedCampaign = activeCampaigns[Math.floor(Math.random() * activeCampaigns.length)];

  let segments = selectedCampaign.segments;
  if (!segments || segments.length === 0) {
    segments = [
      { id: "1", label: "10% OFF", discountType: "PERCENTAGE", discountValue: "10", winProbability: 35, hexColor: "#EF4444" },
      { id: "2", label: "15% OFF", discountType: "PERCENTAGE", discountValue: "15", winProbability: 25, hexColor: "#3B82F6" },
      { id: "3", label: "$5 OFF", discountType: "FIXED_AMOUNT", discountValue: "5", winProbability: 20, hexColor: "#10B981" },
      { id: "4", label: "FREE SHIPPING", discountType: "FREE_SHIPPING", discountValue: "0", winProbability: 10, hexColor: "#F59E0B" },
      { id: "5", label: "20% OFF", discountType: "PERCENTAGE", discountValue: "20", winProbability: 5, hexColor: "#8B5CF6" },
      { id: "6", label: "TRY AGAIN", discountType: "TRY_AGAIN", discountValue: "0", winProbability: 5, hexColor: "#6B7280" },
    ];
  }

  const canonicalDomain = shop.shopifyDomain || cleanDomain;

    const responsePayload = {
      campaign: {
        id: selectedCampaign.id,
        shopDomain: canonicalDomain,
        name: selectedCampaign.name,
        type: selectedCampaign.type,
        triggers: parseJsonField(selectedCampaign.triggers, {}),
        themeSettings: parseJsonField(selectedCampaign.themeSettings, {}),
        segments: segments.map((s) => ({
          id: s.id,
          label: s.label,
          hexColor: s.hexColor,
          discountType: s.discountType,
        })),
      },
      shopDomain: canonicalDomain,
      currentPlan: shop.currentPlan || "FREE",
    };

    return Response.json(responsePayload, { headers: corsHeaders });
  } catch (error) {
    console.error("[CS Campaign Public] Error fetching campaign:", error);
    return Response.json({ campaign: null, error: "Internal error" }, { status: 200, headers: corsHeaders });
  }
};
