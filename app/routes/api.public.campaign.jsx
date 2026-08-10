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

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let shop = null;
  if (shopDomain) {
    shop = await prisma.shop.findFirst({
      where: {
        shopifyDomain: {
          equals: shopDomain,
        },
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
  }

  // Dev-only convenience: if the exact shop isn't found (e.g. tunnel hostname
  // mismatch), fall back to the first shop. Never do this in production — it
  // would serve one merchant's campaign to another merchant's storefront.
  if (!shop && process.env.NODE_ENV !== "production") {
    shop = await prisma.shop.findFirst({
      include: {
        campaigns: {
          where: { status: "ACTIVE" },
          include: {
            segments: { orderBy: { position: "asc" } },
          },
        },
      },
    });
  }

  if (!shop || !shop.campaigns || shop.campaigns.length === 0) {
    // If no active campaign, check if any campaign exists in DB
    const anyCampaign = await prisma.campaign.findFirst({
      include: { segments: { orderBy: { position: "asc" } } },
    });
    if (anyCampaign) {
      shop = { campaigns: [anyCampaign], currentPlan: "FREE" };
    } else {
      return Response.json({ campaign: null }, { headers: corsHeaders });
    }
  }

  const activeCampaigns = shop.campaigns;
  const selectedCampaign = activeCampaigns[Math.floor(Math.random() * activeCampaigns.length)];

  let segments = selectedCampaign.segments;
  if (!segments || segments.length === 0) {
    segments = [
      { id: "1", label: "10% OFF", discountType: "PERCENTAGE", discountValue: "10", winProbability: 25, hexColor: "#EF4444" },
      { id: "2", label: "$5 OFF", discountType: "FIXED_AMOUNT", discountValue: "5", winProbability: 25, hexColor: "#3B82F6" },
      { id: "3", label: "FREE SHIPPING", discountType: "FREE_SHIPPING", discountValue: "0", winProbability: 25, hexColor: "#10B981" },
      { id: "4", label: "TRY AGAIN", discountType: "TRY_AGAIN", discountValue: "0", winProbability: 25, hexColor: "#6B7280" },
    ];
  }

  const responsePayload = {
    campaign: {
      id: selectedCampaign.id,
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
    shopDomain,
    currentPlan: shop.currentPlan || "FREE",
  };

  return Response.json(responsePayload, { headers: corsHeaders });
};
