import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[GDPR Webhook] ${topic} received for ${shop}`, payload);

  try {
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
    console.error("Redact customer error:", error);
  }

  return new Response("OK", { status: 200 });
};
