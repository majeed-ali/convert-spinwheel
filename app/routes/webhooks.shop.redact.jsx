import { verifyShopifyHmac } from "../services/hmac.server";
import prisma from "../db.server";

export const loader = async () => {
  return new Response("OK", { status: 200 });
};

export const action = async ({ request }) => {
  const { valid, payload, shopDomain } = await verifyShopifyHmac(request);
  if (!valid) {
    return new Response("Bad Request", { status: 400 });
  }

  console.log(`[GDPR Webhook] shop/redact received for ${shopDomain}`, payload);

  try {
    if (shopDomain) {
      const dbShop = await prisma.shop.findFirst({
        where: {
          OR: [
            { shopifyDomain: shopDomain },
            { shopifyDomain: { contains: shopDomain } },
          ],
        },
      });
      if (dbShop) {
        await prisma.shop.delete({ where: { id: dbShop.id } });
      }
    }
  } catch (error) {
    console.error("[GDPR Webhook] Redact shop error:", error);
  }

  return new Response("OK", { status: 200 });
};
