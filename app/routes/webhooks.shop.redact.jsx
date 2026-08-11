import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[GDPR Webhook] ${topic} received for ${shop}`, payload);

  try {
    const dbShop = await prisma.shop.findUnique({ where: { shopifyDomain: shop } });
    if (dbShop) {
      await prisma.shop.delete({ where: { id: dbShop.id } });
    }
  } catch (error) {
    console.error("Redact shop error:", error);
  }

  return new Response("OK", { status: 200 });
};
