import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { validateSpinEligibility, selectWeightedSegment } from "../services/anti-cheat.server";
import { createDynamicDiscountCode } from "../services/discount.server";
import { syncLeadToIntegrations } from "../services/integrations.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

import { getOrInitShop, ensureDefaultCampaign } from "../services/billing.server";

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { shopDomain, campaignId, email, phone, sessionHash, deviceType } = body;

    const rawDomain = shopDomain || "";
    const cleanDomain = rawDomain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim().toLowerCase();

    let campaign = null;
    let shop = null;

    // 1. Try finding campaign directly by campaignId
    if (campaignId) {
      campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          shop: true,
          segments: {
            orderBy: { position: "asc" },
          },
        },
      });

      if (campaign) {
        shop = campaign.shop;
      }
    }

    // 2. If not found via campaignId, lookup by shopDomain
    if (!shop && cleanDomain) {
      shop = await prisma.shop.findFirst({
        where: {
          shopifyDomain: {
            equals: cleanDomain,
            mode: "insensitive",
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

      if (!shop) {
        shop = await getOrInitShop(cleanDomain);
      }

      if (shop?.campaigns?.length > 0) {
        campaign = shop.campaigns[0];
      }
    }

    // 3. Fallback: ensure a default active campaign exists for the shop
    if (shop && (!campaign || !campaign.segments?.length)) {
      campaign = await ensureDefaultCampaign(shop.id);
    }

    // 4. Global fallback to any active campaign in DB
    if (!campaign || !campaign.segments?.length) {
      campaign = await prisma.campaign.findFirst({
        where: { status: "ACTIVE" },
        include: {
          shop: true,
          segments: { orderBy: { position: "asc" } },
        },
      });
      if (campaign) {
        shop = campaign.shop;
      }
    }

    if (!campaign || !shop || !campaign.segments?.length) {
      return Response.json(
        { success: false, error: "Campaign is currently unavailable. Please check back soon." },
        { status: 200, headers: corsHeaders }
      );
    }

    const canonicalShopDomain = shop.shopifyDomain || cleanDomain;
    const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";

    // 1. Anti-Cheat Verification
    const eligibility = await validateSpinEligibility(shop.id, campaignId, email, phone, clientIp, sessionHash);
    if (!eligibility.allowed) {
      return Response.json(
        {
          success: false,
          error: eligibility.reason,
          existingCode: eligibility.existingCode,
        },
        { status: 429, headers: corsHeaders }
      );
    }

    // 2. Select Weighted Segment Server-Side
    const selected = selectWeightedSegment(campaign.segments);
    const winningSegment = selected.segment;
    const winningIndex = selected.index;

    // 3. Retrieve offline access token and create real Shopify Discount
    let discountResult = { success: true, code: null, label: winningSegment.label };

    try {
      let accessToken = shop.accessToken;
      if (!accessToken) {
        const offlineSession = await prisma.session.findFirst({
          where: { shop: canonicalShopDomain, isOnline: false },
        });
        accessToken = offlineSession?.accessToken;
      }

      if (accessToken) {
        discountResult = await createDynamicDiscountCode(accessToken, winningSegment, campaign.name, canonicalShopDomain);
      } else {
        try {
          const { admin } = await unauthenticated.admin(canonicalShopDomain);
          discountResult = await createDynamicDiscountCode(admin, winningSegment, campaign.name, canonicalShopDomain);
        } catch (unauthErr) {
          discountResult = await createDynamicDiscountCode(null, winningSegment, campaign.name, canonicalShopDomain);
        }
      }
    } catch (discErr) {
      console.error("[CS Spin] Discount creation exception:", discErr);
      discountResult = await createDynamicDiscountCode(null, winningSegment, campaign.name, canonicalShopDomain);
    }

    // 4. Save Lead Record
    const lead = await prisma.lead.create({
      data: {
        shopId: shop.id,
        campaignId: campaign.id,
        email: email ? email.trim().toLowerCase() : null,
        phone: phone ? phone.trim() : null,
        wonCode: discountResult.code,
        wonDiscountLabel: winningSegment.label,
        ipAddress: clientIp,
        deviceType: deviceType || "desktop",
        sessionHash,
      },
    });

    // 5. Async Integration Sync (Klaviyo, Mailchimp, SendGrid)
    syncLeadToIntegrations(shop, {
      email,
      phone,
      wonCode: discountResult.code,
      wonDiscountLabel: winningSegment.label,
    }).catch((err) => console.error("Async integration sync error:", err));

    return Response.json(
      {
        success: true,
        winningIndex,
        segmentLabel: winningSegment.label,
        discountType: winningSegment.discountType,
        discountCode: discountResult.code,
        leadId: lead.id,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Spin Action Error:", error);
    return Response.json({ error: "Failed to process spin. Please try again." }, { status: 500, headers: corsHeaders });
  }
};
