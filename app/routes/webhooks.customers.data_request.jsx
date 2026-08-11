import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[GDPR Webhook] ${topic} received for ${shop}`, payload);

  // Return 200 OK to Shopify with HMAC signature verified
  return new Response("OK", { status: 200 });
};
