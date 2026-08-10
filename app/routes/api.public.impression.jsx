import { recordShopImpression } from "../services/billing.server";
import { unauthenticated } from "../shopify.server";

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
    let body = {};
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const text = await request.text();
      try {
        body = JSON.parse(text);
      } catch (e) {
        body = {};
      }
    }

    const { shopDomain, campaignId, sessionHash } = body;

    if (!shopDomain) {
      return Response.json({ error: "Missing shopDomain" }, { status: 400, headers: corsHeaders });
    }

    let admin = null;
    try {
      const auth = await unauthenticated.admin(shopDomain);
      admin = auth?.admin;
    } catch (e) {
      // Ignored if unauthenticated context
    }

    const result = await recordShopImpression(admin, shopDomain, campaignId, sessionHash);

    return Response.json(
      {
        success: true,
        counted: result.counted,
        monthlyImpressionsCount: result.newCount,
        isSoftCapReached: result.isSoftCapReached,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Impression Logging Error:", error);
    return Response.json({ error: "Impression log failed" }, { status: 500, headers: corsHeaders });
  }
};
