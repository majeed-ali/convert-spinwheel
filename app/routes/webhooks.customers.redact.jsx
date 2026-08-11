import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async () => {
  return new Response("OK", { status: 200 });
};

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);
    console.log(`[GDPR Webhook] ${topic} received for ${shop}`, payload);

    const customerEmail = payload?.customer?.email;
    const customerPhone = payload?.customer?.phone;

    if (customerEmail || customerPhone) {
      const dbShop = await prisma.shop.findUnique({ where: { shopifyDomain: shop } });
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
