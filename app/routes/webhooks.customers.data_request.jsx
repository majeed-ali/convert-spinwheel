import { verifyShopifyHmac } from "../services/hmac.server";

export const loader = async () => {
  return new Response("OK", { status: 200 });
};

export const action = async ({ request }) => {
  const { valid, payload, shopDomain } = await verifyShopifyHmac(request);
  if (!valid) {
    return new Response("Unauthorized", { status: 401 });
  }

  console.log(`[GDPR Webhook] customers/data_request received for ${shopDomain}`, payload);
  return new Response("OK", { status: 200 });
};
