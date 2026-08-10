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

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { shopDomain, campaignId, email, phone, sessionHash, deviceType } = body;

    if (!shopDomain || !campaignId) {
      return Response.json({ error: "Missing required params" }, { status: 400, headers: corsHeaders });
    }

    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopDomain },
    });

    if (!shop) {
      return Response.json({ error: "Shop not found" }, { status: 404, headers: corsHeaders });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        segments: {
          orderBy: { position: "asc" },
        },
      },
    });

    if (!campaign || campaign.status !== "ACTIVE" || !campaign.segments.length) {
      return Response.json({ error: "Campaign unavailable" }, { status: 400, headers: corsHeaders });
    }

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
          where: { shop: shopDomain, isOnline: false },
        });
        accessToken = offlineSession?.accessToken;
      }

      if (accessToken) {
        discountResult = await createDynamicDiscountCode(accessToken, winningSegment, campaign.name, shopDomain);
      } else {
        const { admin } = await unauthenticated.admin(shopDomain);
        discountResult = await createDynamicDiscountCode(admin, winningSegment, campaign.name, shopDomain);
      }
    } catch (discErr) {
      console.error("[CS Spin] Discount creation exception:", discErr);
      discountResult = await createDynamicDiscountCode(null, winningSegment, campaign.name, shopDomain);
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
