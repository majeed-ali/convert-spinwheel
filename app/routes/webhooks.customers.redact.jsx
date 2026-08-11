import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async () => {
  return new Response("OK", { status: 200 });
};

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);
    const shopDomain = shop || payload?.shop_domain;
    const shopId = payload?.shop_id;

    console.log(`[GDPR Webhook] ${topic} received for ${shopDomain} (Shop ID: ${shopId})`, payload);

    const customerEmail = payload?.customer?.email;
    const customerPhone = payload?.customer?.phone;

    if ((customerEmail || customerPhone) && shopDomain) {
      const dbShop = await prisma.shop.findFirst({
        where: {
          OR: [
            { shopifyDomain: shopDomain },
            { shopifyDomain: { contains: shopDomain } },
          ],
        },
      });
      if (dbShop) {
        await prisma.lead.deleteMany({
          where: {
            shopId: dbShop.id,
            OR: [
              { email: customerEmail || undefined },
              { phone: customerPhone || undefined },
            ],
          },
        });
      }
    }
  } catch (error) {
    console.error("[GDPR Webhook] Redact customer error:", error);
  }

  return new Response("OK", { status: 200 });
};
