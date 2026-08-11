import { authenticate, verifyShopifyHmac } from "../shopify.server";
import prisma from "../db.server";

export const loader = async () => {
  return new Response("OK", { status: 200 });
};

export const action = async ({ request }) => {
  const { valid, payload, shopDomain } = await verifyShopifyHmac(request);
  if (!valid) {
    return new Response("Unauthorized", { status: 401 });
  }

  console.log(`[GDPR Webhook] customers/redact received for ${shopDomain}`, payload);

  try {
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
